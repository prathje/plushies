/**
 * plushie-cursors — a plushie that floats along with its own pointer: an AI
 * helper's presence on a page, with its name and a live status box.
 *
 *   import * as THREE from 'three';
 *   import {createPlushieCursor} from 'plushie-cursors';
 *
 *   const pip = createPlushieCursor(THREE, {name: 'Pip', look: {kind: 'star', color: '#f5c518'}});
 *   await pip.pointAt(document.querySelector('#title'));
 *   pip.status({text: 'Rewriting the headline', progress: 0.3});
 *   await pip.click();
 *   await pip.done('Headline updated');
 *
 * The plushie is optional, per cursor: `plushie: false` (or setPlushie)
 * leaves the pointer and its label; with `three` null it never loads.
 *
 * Positions are pixels in the container (its padding box, scrolling with its
 * content). Moves are springs: `moveTo`/`pointAt` resolve on arrival. Three
 * designs: 'live' (VideoZero's live editor cursors), 'buddy' (a plushie on a
 * string with a sewn-on name tag and speech bubble) and 'island' (a compact
 * capsule that grows into a status card).
 */
import type {ThreeModule} from 'plushies';
import {easeInOut, easeOut, mountPlushie, type PlushieViewer, type ViewerOptions} from 'plushies/viewer';
import type {CursorDesign, CursorStatus, CursorView, Design} from './design';
import {buddyDesign} from './designs/buddy';
import {islandDesign} from './designs/island';
import {liveDesign} from './designs/live';
import {el, inks, injectStyle} from './dom';

export type {CursorDesign, CursorStatus} from './design';
export {fromCanvas, paintHighlight, type CanvasBox, type PaintHighlightOptions} from './canvas';
export const CURSOR_DESIGNS: readonly CursorDesign[] = ['live', 'buddy', 'island'];

/** A box in the container's pixels. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Something to point at: an element (tracked as it moves) or a box. */
export type Target = Element | Box | (() => Box | null);

export interface PlushieCursorOptions {
  /** Shown on the name tag. */
  name: string;
  /** The plushie (any plushies option). */
  look?: Omit<ViewerOptions, 'renderer' | 'idle' | 'followPointer'>;
  /** Accent for the pointer, tag and highlight. (default: the plushie's colour) */
  color?: string;
  /** (default: 'live') */
  design?: CursorDesign;
  /** Where the cursor lives; positions are in its pixels. (default: document.body) */
  container?: HTMLElement;
  /** Start here (default: the container's centre). */
  x?: number;
  y?: number;
  /** The plushie blinks, breathes and glances around between moves. (default: true) */
  idle?: boolean;
  /** Float a plushie with the pointer. False: just the pointer and its label. (default: true) */
  plushie?: boolean;
}

export interface HighlightOptions {
  /** Breathe and run a light round the border, as while working. (default: true) */
  busy?: boolean;
  /** Corner radius in px. (default: 6) */
  radius?: number;
}

export interface Highlight {
  /** Move it to a new target (or update the busy look). */
  update(target: Target, options?: HighlightOptions): void;
  /** Fade it out (after `delay` seconds) and remove it. */
  clear(delay?: number): void;
}

export interface PlushieCursor {
  readonly element: HTMLElement;
  /** The plushie's viewer: hop, squish, look, restyle, … (null without a plushie) */
  readonly viewer: PlushieViewer | null;
  readonly design: CursorDesign;
  /** Glide to x, y (container pixels). Resolves on arrival. */
  moveTo(x: number, y: number): Promise<void>;
  /** Glide to a corner of `target` that leaves room for the tag, and stay on it while it moves. */
  pointAt(target: Target): Promise<void>;
  /** Stop following the pointed-at target (stay where it is). */
  release(): void;
  /** What it's working on (a string, or details); null clears it. */
  status(status: string | CursorStatus | null): void;
  /** Update only the progress (0..1, null for none). */
  progress(value: number | null, step?: [number, number]): void;
  /** Say something for a moment. */
  say(text: string, seconds?: number): void;
  /** Press: pointer dips, a ripple at the tip, the plushie squishes. */
  click(): Promise<void>;
  /** Finish: a hop and a done message for a moment, then just the name. */
  done(text?: string, seconds?: number): Promise<void>;
  /**
   * Glow round an element or box in the cursor's colour (the editor's
   * "working on this" mark). Separate from pointing: you decide what glows
   * and for how long — e.g. a canvas app passes its own boxes each frame.
   */
  highlight(target: Target, options?: HighlightOptions): Highlight;
  setDesign(design: CursorDesign): void;
  setName(name: string): void;
  /** Show or drop the plushie (the pointer and label stay). */
  setPlushie(on: boolean): void;
  show(on: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Layer: one per container, holding every cursor and highlight in it.

const LAYER_CSS = `
.pc-layer { position: absolute; left: 0; top: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; z-index: 2147483000; contain: layout style; }
.pc-cursor { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform;
  --pc-font: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --pc-font-round: Fredoka, Nunito, ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
  transition: opacity .25s; }
.pc-cursor.pc-hidden { opacity: 0; }
.pc-body { position: absolute; left: 0; top: 0; width: 0; height: 0; will-change: transform; }
.pc-plush { position: absolute; }
.pc-plush > canvas { pointer-events: none; }
.pc-cursor.pc-bare .pc-plush, .pc-cursor.pc-bare .pc-glint, .pc-cursor.pc-bare .pc-string { display: none; }
.pc-part { position: absolute; left: 0; top: 0; transform-origin: 0 0; transition: scale .22s cubic-bezier(.65, 0, .35, 1), transform .12s; }
.pc-flip-x .pc-part { scale: -1 1; }
.pc-flip-y .pc-part { scale: 1 -1; }
.pc-flip-x.pc-flip-y .pc-part { scale: -1 -1; }
.pc-part > svg { display: block; overflow: visible; filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.35)); }
.pc-pressed .pc-part > svg { transform: scale(.82); transform-origin: 0 0; }
.pc-part > svg { transition: transform .14s cubic-bezier(.3, 1.4, .5, 1); }
.pc-arrive { animation: pc-arrive .4s cubic-bezier(.34, 1.3, .64, 1); transform-origin: 0 0; }
@keyframes pc-arrive { from { opacity: 0; transform: scale(.5) } to { opacity: 1; transform: scale(1) } }

.pc-t { display: block; }
.pc-t-in { animation: pc-t-in .32s cubic-bezier(.2, .8, .3, 1) both; }
.pc-t-out { position: absolute; left: 0; top: 0; width: max-content; max-width: inherit; animation: pc-t-out .28s ease-in both; }
@keyframes pc-t-in { from { opacity: 0; transform: translateY(.55em); filter: blur(2px) } }
@keyframes pc-t-out { to { opacity: 0; transform: translateY(-.55em); filter: blur(2px) } }
.pc-unrevealed { visibility: hidden; }
.pc-check { width: 1em; height: 1em; vertical-align: -.14em; margin-right: .3em; }

.pc-ripple { position: absolute; left: 0; top: 0; width: 34px; height: 34px; margin: -17px 0 0 -17px; border-radius: 50%;
  border: 2px solid var(--pc); animation: pc-ripple .5s cubic-bezier(.2, .7, .3, 1) forwards; }
@keyframes pc-ripple { from { transform: scale(.2); opacity: .9 } to { transform: scale(1); opacity: 0 } }

.pc-mark { position: absolute; left: 0; top: 0; box-sizing: border-box; border: 2px solid var(--pc); border-radius: var(--pc-r, 6px);
  background: color-mix(in srgb, var(--pc) 22%, transparent); animation: pc-mark-in .3s ease-out; transition: opacity .5s; }
.pc-mark.pc-busy { animation: pc-mark-in .3s ease-out, pc-breathe 2.4s ease-in-out infinite; }
.pc-mark.pc-out { opacity: 0; }
.pc-mark > svg { position: absolute; inset: -2px; width: calc(100% + 4px); height: calc(100% + 4px); overflow: visible; opacity: 0; transition: opacity .3s; }
.pc-mark.pc-busy > svg { opacity: 1; }
.pc-mark rect { x: 1px; y: 1px; width: calc(100% - 2px); height: calc(100% - 2px); rx: calc(var(--pc-r, 6px) - 1px); fill: none;
  stroke: color-mix(in srgb, var(--pc) 28%, white); stroke-width: 2px; stroke-dasharray: 26 74; stroke-linecap: round;
  animation: pc-light 2.2s cubic-bezier(.5, .1, .5, .9) infinite; filter: drop-shadow(0 0 3px color-mix(in srgb, var(--pc) 60%, white)); }
@keyframes pc-mark-in { from { opacity: 0; transform: scale(1.03) } }
@keyframes pc-breathe { 0%, 100% { background: color-mix(in srgb, var(--pc) 14%, transparent) } 50% { background: color-mix(in srgb, var(--pc) 28%, transparent) } }
@keyframes pc-light { from { stroke-dashoffset: 100 } to { stroke-dashoffset: 0 } }
@media (prefers-reduced-motion: reduce) { .pc-mark.pc-busy, .pc-mark rect { animation: none; } }
`;

interface Layer {
  element: HTMLElement;
  container: HTMLElement;
}

const layers = new WeakMap<HTMLElement, Layer>();

function layerOf(container: HTMLElement): Layer {
  let layer = layers.get(container);
  if (!layer) {
    injectStyle('layer', LAYER_CSS);
    if (container !== document.body && getComputedStyle(container).position === 'static') container.style.position = 'relative';
    const element = el('div', 'pc-layer', container);
    layer = {element, container};
    layers.set(container, layer);
  }
  return layer;
}

/** The visible part of the container, in layer pixels (where tags must fit). */
function boundsOf(layer: Layer) {
  const origin = layer.element.getBoundingClientRect();
  const page = layer.container === document.body || layer.container === document.documentElement;
  const box = page ? {left: 0, top: 0, right: innerWidth, bottom: innerHeight} : layer.container.getBoundingClientRect();
  return {
    origin,
    left: Math.max(box.left, 0) - origin.left,
    top: Math.max(box.top, 0) - origin.top,
    right: Math.min(box.right, innerWidth) - origin.left,
    bottom: Math.min(box.bottom, innerHeight) - origin.top,
  };
}

function resolveBox(target: Target, origin: DOMRect): Box | null {
  if (typeof target === 'function') return target();
  if (target instanceof Element) {
    if (!target.isConnected) return null;
    const r = target.getBoundingClientRect();
    return {left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height};
  }
  return target;
}

// ---------------------------------------------------------------------------
// Placement: which way the cursor hangs, ported from the live editor.

interface Flip {
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
}

/** Leave the flipped side only once this far back from the edge, not to flicker on it. */
const HYSTERESIS = 12;
const INSET = 6;

/**
 * Where the tip goes and which way the cursor hangs: right of the tip (and
 * below or above it, as the design hangs) unless that leaves the visible
 * area, then mirrored. Pointing at a box, the tip goes on whichever corner
 * leaves room — bottom-right first.
 */
function place(
  at: {x: number; y: number} | null,
  box: Box | null,
  bounds: {left: number; top: number; right: number; bottom: number},
  room: {x: number; y: number},
  vertical: 1 | -1,
  was: Flip | undefined,
): Flip {
  const slack = (flipped: boolean | undefined) => (flipped ? HYSTERESIS : 0);
  const fitsDown = (y: number, flipped: boolean | undefined) => y + room.y <= bounds.bottom - slack(flipped);
  const fitsUp = (y: number, flipped: boolean | undefined) => y - room.y >= bounds.top + slack(flipped);
  if (!box) {
    const {x, y} = at!;
    return {
      x,
      y,
      flipX: x + room.x > bounds.right - slack(was?.flipX),
      flipY: vertical === 1 ? !fitsDown(y, was?.flipY) : !fitsUp(y, was?.flipY),
    };
  }
  const left = Math.max(box.left, bounds.left);
  const right = Math.min(box.left + box.width, bounds.right);
  const top = Math.max(box.top, bounds.top);
  const bottom = Math.min(box.top + box.height, bounds.bottom);
  let x = right - INSET;
  let flipX = false;
  if (x + room.x > bounds.right - slack(was?.flipX)) {
    flipX = true;
    if (left + INSET - room.x >= bounds.left) x = left + INSET;
  }
  let y = bottom - INSET;
  let flipY: boolean;
  if (vertical === 1) {
    flipY = !fitsDown(y, was?.flipY);
    if (flipY && top + INSET - room.y >= bounds.top) y = top + INSET;
  } else {
    flipY = !fitsUp(y, was?.flipY);
  }
  return {x, y, flipX, flipY};
}

// ---------------------------------------------------------------------------
// One ticker for every cursor.

const live = new Set<CursorState>();
let raf = 0;
let last = 0;
function tick(now: number) {
  const dt = Math.min(0.064, (now - last) / 1000 || 0.016);
  last = now;
  for (const cursor of live) cursor.step(dt, now);
  raf = live.size ? requestAnimationFrame(tick) : 0;
}
function track(cursor: CursorState) {
  live.add(cursor);
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(tick);
  }
}

const DESIGNS: Record<CursorDesign, () => Design> = {live: liveDesign, buddy: buddyDesign, island: islandDesign};

interface Spring {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Advance a damped spring toward (tx, ty), in sub-steps so stiff springs stay stable. */
function spring(s: Spring, tx: number, ty: number, omega: number, zeta: number, dt: number) {
  const steps = Math.ceil(dt / (1 / 240));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    s.vx += (omega * omega * (tx - s.x) - 2 * zeta * omega * s.vx) * h;
    s.vy += (omega * omega * (ty - s.y) - 2 * zeta * omega * s.vy) * h;
    s.x += s.vx * h;
    s.y += s.vy * h;
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

class CursorState {
  readonly element: HTMLElement;
  design!: Design;
  viewer: PlushieViewer | null = null;
  private layer: Layer;
  private tip: Spring;
  private body: Spring | null = null;
  private goal: {x: number; y: number};
  private target: Target | null = null;
  private flip: Flip | undefined;
  private arrivals: (() => void)[] = [];
  private view: CursorView;
  private sayTimer = 0;
  private doneTimer = 0;
  private gestures = 0;
  private plushSize = 0;
  private lastPose = {lookX: 0, lookY: 0, lean: 0, turn: 0};
  private disposed = false;

  constructor(
    private three: ThreeModule | null,
    private options: PlushieCursorOptions,
  ) {
    this.layer = layerOf(options.container ?? document.body);
    const {origin, ...bounds} = boundsOf(this.layer);
    void origin;
    const x = options.x ?? (bounds.left + bounds.right) / 2;
    const y = options.y ?? (bounds.top + bounds.bottom) / 2;
    this.tip = {x, y, vx: 0, vy: 0};
    this.goal = {x, y};
    this.view = {name: options.name, status: null, said: null, done: null};
    this.element = el('div', 'pc-cursor', this.layer.element);
    this.element.dataset.cursor = options.name;
    const color = options.color ?? (typeof options.look?.color === 'string' ? options.look.color : '#7c3aed');
    const {ink, deep} = inks(color);
    this.element.style.setProperty('--pc', color);
    this.element.style.setProperty('--pc-ink', ink);
    this.element.style.setProperty('--pc-deep', deep);
    this.mount(options.design ?? 'live');
    track(this);
  }

  mount(kind: CursorDesign) {
    this.viewer?.dispose();
    this.viewer = null;
    this.design?.dispose();
    this.design = DESIGNS[kind]();
    this.element.dataset.design = kind;
    this.element.append(this.design.root);
    this.body = null;
    this.flip = undefined;
    this.mountPlushie();
    this.design.render(this.view);
  }

  /** The plushie: no ground shadow, little headroom — it floats. */
  private mountPlushie() {
    const on = this.options.plushie !== false && !!this.three;
    this.element.classList.toggle('pc-bare', !on);
    if (!on || !this.three || this.viewer) return;
    this.viewer = mountPlushie(this.design.plushHost, this.three, {
      shadow: false,
      headroom: 0.08,
      ...this.options.look,
      idle: this.options.idle !== false,
    });
    this.plushSize = this.design.plushHost.offsetWidth || 48;
  }

  setPlushie(on: boolean) {
    this.options = {...this.options, plushie: on};
    if (!on) {
      this.viewer?.dispose();
      this.viewer = null;
    }
    this.mountPlushie();
  }

  private render() {
    this.design.render(this.view);
  }

  get bodyOffset() {
    const {anchor} = this.design;
    return {x: this.flip?.flipX ? -anchor.x : anchor.x, y: this.flip?.flipY ? -anchor.y : anchor.y};
  }

  step(dt: number, now: number) {
    if (this.disposed) return;
    const bounds = boundsOf(this.layer);
    const box = this.target ? resolveBox(this.target, bounds.origin) : null;
    const room = this.design.room();
    const next = place(box ? null : this.goal, box, bounds, room, this.design.vertical, this.flip);
    if (!this.flip || next.flipX !== this.flip.flipX || next.flipY !== this.flip.flipY) {
      this.element.classList.toggle('pc-flip-x', next.flipX);
      this.element.classList.toggle('pc-flip-y', next.flipY);
    }
    this.flip = next;
    if (box) this.goal = {x: next.x, y: next.y};

    const {motion} = this.design;
    spring(this.tip, this.goal.x, this.goal.y, motion.tip, 1, dt);
    const offset = this.bodyOffset;
    if (!this.body) this.body = {x: this.tip.x + offset.x, y: this.tip.y + offset.y, vx: 0, vy: 0};
    spring(this.body, this.tip.x + offset.x, this.tip.y + offset.y, motion.body, motion.damping, dt);

    const bob = motion.bob * Math.sin((now / 1000) * Math.PI * 0.9);
    const bx = this.body.x - this.tip.x;
    const by = this.body.y - this.tip.y + bob;
    this.element.style.transform = `translate3d(${this.tip.x.toFixed(2)}px, ${this.tip.y.toFixed(2)}px, 0)`;
    this.design.body.style.transform = `translate3d(${bx.toFixed(2)}px, ${by.toFixed(2)}px, 0)`;
    this.design.frame?.({x: bx, y: by, vx: this.body.vx, vy: this.body.vy}, {x: next.flipX, y: next.flipY});

    this.pose(box, now);

    const settled = Math.hypot(this.goal.x - this.tip.x, this.goal.y - this.tip.y) < 0.75 && Math.hypot(this.tip.vx, this.tip.vy) < 12;
    if (settled && this.arrivals.length) {
      const arrivals = this.arrivals;
      this.arrivals = [];
      for (const resolve of arrivals) resolve();
    }
  }

  /**
   * The plushie leans into its motion and turns toward where it's going,
   * looks at what it points at, and wobbles while it works.
   */
  private pose(box: Box | null, now: number) {
    if (!this.viewer) return;
    const body = this.body!;
    const size = this.plushSize;
    const busy = !!this.view.status && this.view.status.busy !== false;
    const wobble = busy ? 5 * Math.sin(now / 160) : 0;
    const lean = clamp(body.vx * 0.022, -16, 16) + wobble;
    const turn = clamp(body.vx * 0.04, -32, 32);
    const focus = box ? {x: box.left + box.width / 2, y: box.top + box.height / 2} : this.goal;
    const dx = focus.x - body.x;
    const dy = focus.y - body.y;
    const moving = Math.hypot(body.vx, body.vy) > 30;
    const pose: Partial<typeof this.lastPose> = {};
    if (Math.abs(lean - this.lastPose.lean) > 0.05) pose.lean = this.lastPose.lean = lean;
    if (Math.abs(turn - this.lastPose.turn) > 0.1) pose.turn = this.lastPose.turn = turn;
    // At rest with nothing to look at, the idle loop glances around.
    if (box || moving || busy) {
      const reach = size * 2.2;
      const lookX = clamp(dx / reach, -1, 1);
      const lookY = clamp(dy / reach, -1, 1);
      if (Math.abs(lookX - this.viewer.plushie.pose.lookX) > 0.02 || Math.abs(lookY - this.viewer.plushie.pose.lookY) > 0.02) {
        pose.lookX = lookX;
        pose.lookY = lookY;
      }
    }
    if (Object.keys(pose).length) this.viewer.set(pose);
  }

  arrive(): Promise<void> {
    return new Promise(resolve => this.arrivals.push(resolve));
  }

  moveTo(x: number, y: number) {
    this.target = null;
    this.goal = {x, y};
    return this.arrive();
  }

  pointAt(target: Target) {
    this.target = target;
    return this.arrive();
  }

  release() {
    this.target = null;
  }

  status(status: string | CursorStatus | null) {
    this.view.status = typeof status === 'string' ? {text: status} : status;
    if (status) this.view.done = null;
    this.render();
  }

  progress(value: number | null, step?: [number, number]) {
    if (!this.view.status) return;
    this.view.status = {...this.view.status, progress: value, ...(step ? {step} : {})};
    this.render();
  }

  say(text: string, seconds = 2.6) {
    clearTimeout(this.sayTimer);
    this.view.said = text;
    this.render();
    this.sayTimer = window.setTimeout(() => {
      this.view.said = null;
      this.render();
    }, seconds * 1000);
  }

  /** Run a squash-and-stretch gesture with the idle loop out of its way. */
  private async gesture(run: (viewer: PlushieViewer) => Promise<void>) {
    const viewer = this.viewer;
    if (!viewer) return;
    this.gestures++;
    viewer.setIdle(false);
    try {
      await run(viewer);
    } finally {
      if (--this.gestures === 0 && this.viewer === viewer && this.options.idle !== false) viewer.setIdle(true);
    }
  }

  async click() {
    this.element.classList.add('pc-pressed');
    this.design.press?.();
    const ripple = el('div', 'pc-ripple', this.layer.element);
    ripple.style.setProperty('--pc', this.element.style.getPropertyValue('--pc'));
    ripple.style.left = `${this.tip.x}px`;
    ripple.style.top = `${this.tip.y}px`;
    setTimeout(() => ripple.remove(), 600);
    setTimeout(() => this.element.classList.remove('pc-pressed'), 140);
    await this.gesture(viewer => viewer.squish(0.35, 0.5));
  }

  async done(text = 'Done', seconds = 1.8) {
    clearTimeout(this.doneTimer);
    this.view.status = null;
    this.view.done = text;
    this.render();
    this.doneTimer = window.setTimeout(() => {
      this.view.done = null;
      this.render();
    }, seconds * 1000);
    await this.gesture(viewer => this.jump(viewer, this.design.motion.hop));
  }

  /**
   * A happy jump. The plushie's own hop would leave its small canvas, so the
   * canvas jumps instead (in CSS) while the plushie squashes and stretches.
   */
  private async jump(viewer: PlushieViewer, height: number) {
    const host = this.design.plushHost;
    const to = viewer.to;
    await to({squash: 0.4}, 0.16, easeOut);
    if (height) {
      host.animate(
        [
          {translate: '0 0', easing: 'cubic-bezier(.2, .7, .35, 1)'},
          {translate: `0 ${-height}px`, offset: 0.45, easing: 'cubic-bezier(.6, 0, .8, .4)'},
          {translate: '0 0'},
        ],
        {duration: 560},
      );
    }
    await to({squash: -0.3}, 0.14, easeOut);
    await to({squash: 0}, height ? 0.26 : 0.2, easeInOut);
    if (height) await to({squash: 0.3}, 0.08, easeOut);
    await to({squash: 0}, 0.22, easeOut);
  }

  highlight(target: Target, options: HighlightOptions = {}): Highlight {
    const mark = el('div', 'pc-mark');
    this.layer.element.prepend(mark);
    mark.innerHTML = '<svg aria-hidden="true"><rect pathLength="100"/></svg>';
    mark.style.setProperty('--pc', this.element.style.getPropertyValue('--pc'));
    let current = target;
    let cleared = false;
    const apply = (opts: HighlightOptions) => {
      mark.classList.toggle('pc-busy', opts.busy !== false);
      mark.style.setProperty('--pc-r', `${opts.radius ?? 6}px`);
    };
    apply(options);
    // Elements move: follow them every frame until cleared.
    const follow = () => {
      if (cleared || !mark.isConnected) return;
      const box = resolveBox(current, this.layer.element.getBoundingClientRect());
      mark.style.display = box ? '' : 'none';
      if (box) {
        mark.style.transform = `translate(${box.left - 1}px, ${box.top - 1}px)`;
        mark.style.width = `${box.width + 2}px`;
        mark.style.height = `${box.height + 2}px`;
      }
      requestAnimationFrame(follow);
    };
    follow();
    return {
      update(next, opts) {
        current = next;
        if (opts) apply(opts);
      },
      clear(delay = 0) {
        setTimeout(() => {
          mark.classList.add('pc-out');
          setTimeout(() => {
            cleared = true;
            mark.remove();
          }, 520);
        }, delay * 1000);
      },
    };
  }

  setName(name: string) {
    this.view.name = name;
    this.element.dataset.cursor = name;
    this.render();
  }

  dispose() {
    this.disposed = true;
    live.delete(this);
    clearTimeout(this.sayTimer);
    clearTimeout(this.doneTimer);
    this.viewer?.dispose();
    this.design.dispose();
    this.element.remove();
  }
}

/**
 * Create a plushie cursor in `options.container` (default: the page). Pass
 * `null` for `three` to use only the pointer and label, without three.js.
 */
export function createPlushieCursor(three: ThreeModule | null, options: PlushieCursorOptions): PlushieCursor {
  const state = new CursorState(three, options);
  return {
    element: state.element,
    get viewer() {
      return state.viewer;
    },
    get design() {
      return state.design.kind;
    },
    moveTo: (x, y) => state.moveTo(x, y),
    pointAt: target => state.pointAt(target),
    release: () => state.release(),
    status: status => state.status(status),
    progress: (value, step) => state.progress(value, step),
    say: (text, seconds) => state.say(text, seconds),
    click: () => state.click(),
    done: (text, seconds) => state.done(text, seconds),
    highlight: (target, options) => state.highlight(target, options),
    setDesign: kind => {
      if (kind !== state.design.kind) state.mount(kind);
    },
    setName: name => state.setName(name),
    setPlushie: on => state.setPlushie(on),
    show: on => state.element.classList.toggle('pc-hidden', !on),
    dispose: () => state.dispose(),
  };
}
