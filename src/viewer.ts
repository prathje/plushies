/**
 * A drop-in viewer: one plushie on its own transparent canvas, with camera,
 * resize handling, a render loop that only runs while something changes, a
 * few tweens and an optional idle loop.
 *
 * All viewers on a page draw through one hidden WebGL context (per three
 * module) and copy their pixels onto their own 2D canvas. Browsers cap live
 * WebGL contexts at around 16, so this keeps a page of plushies working, and
 * shaders and the environment map are built only once.
 *
 *   import * as THREE from 'three';
 *   import {mountPlushie} from 'plushies/viewer';
 *   const view = mountPlushie(document.querySelector('#hero'), THREE, {kind: 'heart', color: '#f47c9a', idle: true});
 *   await view.hop();
 */
import {
  createPlushie,
  resetEnvironment,
  type Plushie,
  type PlushieOptions,
  type PlushiePose,
  type ThreeModule,
} from './index.js';

/** The look a viewer builds its plushie from (the viewer brings its own renderer). */
export type ViewerLook = Omit<PlushieOptions, 'renderer'>;

export interface ViewerOptions extends ViewerLook, Partial<Omit<PlushiePose, 'width' | 'height' | 'pixelRatio'>> {
  /** Blink, breathe and glance around on its own. (default: false) */
  idle?: boolean;
  /** Eyes follow the mouse pointer anywhere on the page. (default: false) */
  followPointer?: boolean;
  /** Cap for the device pixel ratio. (default: 2) */
  maxPixelRatio?: number;
}

export type Easing = (t: number) => number;
export const easeInOut: Easing = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut: Easing = t => 1 - (1 - t) ** 3;
export const easeIn: Easing = t => t * t;

type Numeric = Exclude<keyof PlushiePose, 'color' | 'width' | 'height' | 'pixelRatio'>;

export interface PlushieViewer {
  /** The current plushie (replaced by `restyle`). */
  readonly plushie: Plushie;
  readonly canvas: HTMLCanvasElement;
  /** The current look: the options given at mount, merged with every `restyle`. */
  readonly options: Readonly<ViewerLook>;
  /** Set pose values immediately. */
  set(pose: Partial<PlushiePose>): void;
  /** Tween numeric pose values. Resolves when done; a newer tween of the same key takes over. */
  to(pose: Partial<Pick<PlushiePose, Numeric>>, seconds?: number, ease?: Easing): Promise<void>;
  /** Point the eyes at x, y in −1..1 (y down). */
  look(x: number, y?: number, seconds?: number): Promise<void>;
  blink(seconds?: number): Promise<void>;
  /** Anticipation squash, jump, landing squash, settle. `height` in pixels defaults to a fifth of the canvas height, at most 90. */
  hop(height?: number, seconds?: number): Promise<void>;
  /** Squeeze and spring back. */
  squish(amount?: number, seconds?: number): Promise<void>;
  /**
   * Change the look (build-time options) in place, keeping the pose. `options`
   * is merged into the current look; pass `undefined` for a key to reset it to
   * its default. Fur length resets to the new fabric's unless given.
   */
  restyle(options: ViewerLook & Partial<Pick<PlushiePose, 'color' | 'fur'>>): void;
  /** Stop every running tween where it is; their promises resolve. */
  stop(): void;
  /** Start or stop the idle loop (blink, breathe, glance). */
  setIdle(on: boolean): void;
  /** Start or stop following the pointer with the eyes. */
  setFollowPointer(on: boolean): void;
  /** Remove the canvas and free GPU resources. Pending promises resolve. Safe to call twice. */
  dispose(): void;
}

type Renderer = InstanceType<ThreeModule['WebGLRenderer']>;

interface SharedRenderer {
  renderer: Renderer;
  /** Each mounted viewer's canvas size in device pixels, and how to redraw it. */
  users: Map<object, {width: number; height: number; restore: () => void}>;
  /** Drawing-buffer size in device pixels; fits the largest viewer. */
  width: number;
  height: number;
}

const SHARED = new WeakMap<ThreeModule, SharedRenderer>();

function acquireRenderer(three: ThreeModule): SharedRenderer {
  let shared = SHARED.get(three);
  if (!shared) {
    const renderer = new three.WebGLRenderer({antialias: true, alpha: true, premultipliedAlpha: true});
    renderer.setClearColor(0x000000, 0);
    // Sizes below are in device pixels.
    renderer.setPixelRatio(1);
    renderer.setSize(1, 1, false);
    renderer.setScissorTest(true);
    const created: SharedRenderer = {renderer, users: new Map(), width: 1, height: 1};
    // Ask for the context back after a GPU reset, then rebuild every plushie:
    // the baked environment map and the GPU copies are gone.
    renderer.domElement.addEventListener('webglcontextlost', event => event.preventDefault());
    renderer.domElement.addEventListener('webglcontextrestored', () => {
      for (const user of created.users.values()) user.restore();
    });
    shared = created;
    SHARED.set(three, shared);
  }
  return shared;
}

function releaseRenderer(three: ThreeModule, shared: SharedRenderer, user: object) {
  if (!shared.users.delete(user)) return;
  if (shared.users.size > 0) {
    fitBuffer(shared);
    return;
  }
  SHARED.delete(three);
  shared.renderer.dispose();
  // Give the context back now rather than at garbage collection.
  shared.renderer.forceContextLoss();
}

/** Shrink the shared buffer once the viewer that needed it is gone or smaller (it grows in `paint`). */
function fitBuffer(shared: SharedRenderer) {
  let width = 1;
  let height = 1;
  for (const user of shared.users.values()) {
    width = Math.max(width, user.width);
    height = Math.max(height, user.height);
  }
  // Leave some slack so resizing one viewer doesn't reallocate on every step.
  if (width * height < shared.width * shared.height * 0.5) {
    shared.width = width;
    shared.height = height;
    shared.renderer.setSize(width, height, false);
  }
}

/** Render into the bottom-left w×h of the shared buffer and copy that onto `target`. */
function paint(
  shared: SharedRenderer,
  scene: InstanceType<ThreeModule['Scene']>,
  camera: InstanceType<ThreeModule['PerspectiveCamera']>,
  target: CanvasRenderingContext2D,
  w: number,
  h: number,
) {
  const {renderer} = shared;
  if (w > shared.width || h > shared.height) {
    shared.width = Math.max(w, shared.width);
    shared.height = Math.max(h, shared.height);
    renderer.setSize(shared.width, shared.height, false);
  }
  renderer.setViewport(0, 0, w, h);
  renderer.setScissor(0, 0, w, h);
  renderer.render(scene, camera);
  // GL's origin is bottom-left; the copy has to happen in this task, before the buffer is presented.
  target.clearRect(0, 0, w, h);
  target.drawImage(renderer.domElement, 0, shared.height - h, w, h, 0, 0, w, h);
}

const NUMERIC: Numeric[] = ['lookX', 'lookY', 'blink', 'squash', 'hop', 'lean', 'turn', 'float', 'fur'];
const POSE_KEYS: (keyof PlushiePose)[] = [...NUMERIC, 'color', 'width', 'height', 'pixelRatio'];

/** Mount a plushie filling `container` (give the container a size). */
export function mountPlushie(container: HTMLElement, three: ThreeModule, options: ViewerOptions = {}): PlushieViewer {
  const {idle = false, followPointer = false, maxPixelRatio = 2, ...rest} = options;
  // Look and initial pose arrive together; keep the look to merge restyles into.
  const look: Record<string, unknown> = {...rest};
  for (const key of POSE_KEYS) delete look[key];
  delete look.renderer;
  const shared = acquireRenderer(three);
  const {renderer} = shared;
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  container.appendChild(canvas);
  const user = {width: 1, height: 1, restore: () => restore()};
  shared.users.set(user, user);

  const scene = new three.Scene();
  // 100 px = 1 unit, like the plushie's own pixel layout expects.
  const world = new three.Group();
  world.scale.setScalar(1 / 100);
  scene.add(world);
  const camera = new three.PerspectiveCamera();
  const DISTANCE = 1600;

  let plushie = createPlushie(three, {...rest, renderer} as PlushieOptions & Partial<PlushiePose>);
  world.add(plushie.object);

  let width = 1;
  let height = 1;
  const resize = () => {
    if (disposed) return;
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const ratio = Math.min(maxPixelRatio, window.devicePixelRatio || 1);
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    // Setting the size clears the canvas, even to the same value.
    const pose = plushie.pose;
    if (w === canvas.width && h === canvas.height && pose.pixelRatio === ratio && pose.width === width && pose.height === height) return;
    canvas.width = w;
    canvas.height = h;
    user.width = canvas.width;
    user.height = canvas.height;
    fitBuffer(shared);
    camera.fov = (2 * Math.atan(height / 2 / DISTANCE) * 180) / Math.PI;
    camera.aspect = width / height;
    camera.near = 0.08;
    camera.far = 1700;
    camera.position.set(0, 0, DISTANCE / 100);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    plushie.set({width, height, pixelRatio: ratio});
    invalidate();
  };

  interface Tween {
    from: number;
    to: number;
    start: number;
    seconds: number;
    ease: Easing;
    done: () => void;
  }
  const tweens = new Map<Numeric, Tween>();
  let frame = 0;
  let disposed = false;
  // Skip painting while the canvas is off-screen; tweens still run so promises resolve.
  let visible = true;
  let stale = false;
  // When a tween ends inside a frame, tweens started from its promise begin
  // where it ended, not a frame later — chained steps don't drift.
  let chainFrom = 0;
  let chaining = false;
  const invalidate = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(tick);
  };
  const tick = (now: number) => {
    frame = 0;
    const next: Partial<PlushiePose> = {};
    const finished: Tween[] = [];
    for (const [key, t] of tweens) {
      const u = t.seconds <= 0 ? 1 : Math.min(1, Math.max(0, (now - t.start) / 1000 / t.seconds));
      next[key] = t.from + (t.to - t.from) * t.ease(u);
      if (u >= 1) {
        tweens.delete(key);
        finished.push(t);
      }
    }
    plushie.set(next);
    if (visible) paint(shared, scene, camera, context, canvas.width, canvas.height);
    else stale = true;
    if (finished.length) {
      chainFrom = Math.max(...finished.map(t => t.start + t.seconds * 1000));
      chaining = true;
      // Promise continuations run before this timer: only they chain.
      setTimeout(() => (chaining = false));
      for (const t of finished) t.done();
    }
    if (tweens.size) invalidate();
  };

  const settle = (key?: Numeric) => {
    for (const [k, t] of tweens) {
      if (key !== undefined && k !== key) continue;
      tweens.delete(k);
      t.done();
    }
  };

  const to: PlushieViewer['to'] = (pose, seconds = 0.4, ease = easeInOut) => {
    if (disposed) return Promise.resolve();
    const start = chaining ? chainFrom : performance.now();
    const keys = (Object.keys(pose) as Numeric[]).filter(k => NUMERIC.includes(k) && Number.isFinite(pose[k]));
    const done = Promise.all(
      keys.map(
        key =>
          new Promise<void>(resolve => {
            settle(key);
            tweens.set(key, {
              from: plushie.pose[key],
              to: pose[key]!,
              start,
              seconds: Number.isFinite(seconds) ? seconds : 0,
              ease,
              done: resolve,
            });
          }),
      ),
    ).then(() => undefined);
    invalidate();
    return done;
  };
  const wait = (seconds: number) => new Promise(r => setTimeout(r, seconds * 1000));

  let idling = false;
  let idleRun = 0;
  const idleLoop = async (run: number) => {
    const glances: [number, number][] = [[-0.8, 0], [0.7, -0.3], [0, 0.2], [0.4, 0.5], [0, 0]];
    const alive = () => !disposed && idleRun === run;
    for (let i = 0; alive(); i++) {
      await viewer.blink();
      if (!alive()) break;
      await to({squash: 0.08, float: 1.12}, 1.1);
      if (!alive()) break;
      await to({squash: 0, float: 1}, 1.1);
      // Don't fight the pointer while someone is moving it.
      if (alive() && performance.now() - pointerAt > 2000) {
        const [x, y] = glances[i % glances.length];
        await viewer.look(x, y, 0.4);
      }
      await wait(0.6 + ((i * 7) % 5) * 0.25);
    }
  };

  const rebuild = () => {
    const {fur, ...pose} = plushie.pose;
    plushie.dispose();
    plushie = createPlushie(three, {...look, ...pose, fur, renderer} as PlushieOptions & Partial<PlushiePose>);
    world.add(plushie.object);
    invalidate();
  };
  const restore = () => {
    resetEnvironment(renderer);
    rebuild();
  };

  const viewer: PlushieViewer = {
    get plushie() {
      return plushie;
    },
    canvas,
    get options() {
      return {...look} as ViewerLook;
    },
    set(pose) {
      if (disposed) return;
      // Settle replaced tweens so whoever awaits them (the idle loop) carries on.
      for (const key of Object.keys(pose)) settle(key as Numeric);
      plushie.set(pose);
      invalidate();
    },
    to,
    look: (x, y = 0, seconds = 0.35) => to({lookX: x, lookY: y}, seconds),
    async blink(seconds = 0.22) {
      await to({blink: 1}, seconds * 0.45, easeIn);
      await to({blink: 0}, seconds * 0.55, easeOut);
    },
    async hop(jump, seconds = 1.1) {
      const height = jump ?? Math.min(90, plushie.pose.height * 0.2);
      await to({squash: 0.45}, seconds * 0.2, easeOut);
      void to({squash: -0.35}, seconds * 0.15, easeOut);
      await to({hop: height}, seconds * 0.3, easeOut);
      void to({squash: 0}, seconds * 0.2);
      await to({hop: 0}, seconds * 0.25, easeIn);
      await to({squash: 0.4}, seconds * 0.08, easeOut);
      await to({squash: 0}, seconds * 0.22, easeOut);
    },
    async squish(amount = 0.6, seconds = 1) {
      await to({squash: amount, float: 1.25}, seconds * 0.35, easeOut);
      await to({squash: -amount * 0.3, float: 0.9}, seconds * 0.25, easeInOut);
      await to({squash: 0, float: 1}, seconds * 0.4, easeOut);
    },
    restyle(change) {
      if (disposed) return;
      const {fur, ...rest} = change as ViewerLook & Partial<PlushiePose> & {renderer?: unknown};
      delete rest.renderer;
      // Pose fields passed along (a new colour) win over the current pose.
      const posed: Partial<PlushiePose> = {};
      for (const [key, value] of Object.entries(rest)) {
        if ((POSE_KEYS as string[]).includes(key)) {
          if (value !== undefined) (posed as Record<string, unknown>)[key] = value;
        } else if (value === undefined) delete look[key];
        else look[key] = value;
      }
      for (const key of Object.keys(posed)) settle(key as Numeric);
      const {fur: _fur, ...pose} = plushie.pose;
      plushie.dispose();
      plushie = createPlushie(three, {...look, ...pose, ...posed, ...(fur !== undefined && {fur}), renderer} as PlushieOptions &
        Partial<PlushiePose>);
      world.add(plushie.object);
      invalidate();
    },
    stop() {
      settle();
    },
    setIdle(on) {
      if (disposed || on === idling) return;
      idling = on;
      idleRun++;
      if (on) void idleLoop(idleRun);
    },
    setFollowPointer(on) {
      window.removeEventListener('pointermove', onPointer);
      if (on && !disposed) window.addEventListener('pointermove', onPointer);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      idling = false;
      idleRun++;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      observer.disconnect();
      visibility?.disconnect();
      unwatchRatio();
      window.removeEventListener('pointermove', onPointer);
      // Whoever awaits a tween carries on instead of hanging.
      settle();
      plushie.dispose();
      releaseRenderer(three, shared, user);
      canvas.remove();
    },
  };

  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  if (container.clientWidth > 0 && container.clientHeight === 0 && getComputedStyle(container).display !== 'none') {
    console.warn('plushies: mountPlushie container has no height; give it one (the canvas fills it)');
  }

  const visibility =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(entries => {
          visible = entries[entries.length - 1].isIntersecting;
          if (visible && stale) {
            stale = false;
            invalidate();
          }
        });
  visibility?.observe(canvas);

  // Zooming or moving to another screen changes the pixel ratio without resizing the container.
  let ratioQuery: MediaQueryList | null = null;
  const watchRatio = () => {
    ratioQuery?.removeEventListener('change', onRatio);
    ratioQuery = typeof matchMedia === 'undefined' ? null : matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
    ratioQuery?.addEventListener('change', onRatio);
  };
  const onRatio = () => {
    resize();
    watchRatio();
  };
  const unwatchRatio = () => ratioQuery?.removeEventListener('change', onRatio);
  watchRatio();

  let pointerAt = 0;
  const onPointer = (event: PointerEvent) => {
    if (!visible) return;
    const box = canvas.getBoundingClientRect();
    const x = (event.clientX - (box.left + box.width / 2)) / (window.innerWidth / 2);
    const y = (event.clientY - (box.top + box.height / 2)) / (window.innerHeight / 2);
    pointerAt = performance.now();
    void to({lookX: Math.max(-1, Math.min(1, x)), lookY: Math.max(-1, Math.min(1, y))}, 0.25, easeOut);
  };
  if (followPointer) viewer.setFollowPointer(true);

  if (idle) viewer.setIdle(true);

  return viewer;
}
