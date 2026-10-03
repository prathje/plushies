/**
 * @plushies/cursors — a plushie that floats along with its own pointer: an AI
 * helper's presence on a page, with its name and a live status box.
 *
 *   import * as THREE from 'three';
 *   import {createPlushieCursor} from '@plushies/cursors';
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
 * content). Moves are springs: `moveTo`/`pointAt` resolve with how the move
 * ended. Three designs: 'live' (VideoZero's live editor cursors), 'buddy' (a
 * plushie on a string with a sewn-on name tag and speech bubble) and 'island'
 * (a compact capsule that grows into a status card).
 */
import type {ThreeModule} from 'plushies';
import {easeInOut, easeOut, mountPlushie, type PlushieViewer, type ViewerOptions} from 'plushies/viewer';
import type {CursorDesign, CursorStatus, CursorView, Design, Motion} from './design';
import {buddyDesign} from './designs/buddy';
import {islandDesign} from './designs/island';
import {liveDesign} from './designs/live';
import {el, inks, injectStyle, injectStyles, reducedMotion, styleRootOf, toHex, type StyleRoot} from './dom';

export type {CursorDesign, CursorStatus} from './design';
export {fromCanvas, paintHighlight, type CanvasBox, type PaintHighlightOptions} from './canvas';
export const CURSOR_DESIGNS: readonly CursorDesign[] = ['live', 'buddy', 'island'];

/** A box in the container's pixels. `{x, y, width, height}` works too. */
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Anything with a viewport-space bounding box, like an element (e.g. what `fromCanvas` returns). */
export interface VirtualElement {
  getBoundingClientRect(): {left: number; top: number; width: number; height: number} | null;
}

type AnyBox = Box | {x: number; y: number; width: number; height: number};

/**
 * Something to point at, followed as it moves: an element (or anything with
 * `getBoundingClientRect`, in viewport pixels), a box in container pixels, or
 * a function returning one every frame. Not a selector string. A function
 * that throws counts as the target going away.
 */
export type Target = Element | VirtualElement | AnyBox | (() => AnyBox | null);

/**
 * How a move ended: it got there; a newer move took over; the target went
 * away (removed from the page, or returned null — the cursor stops following
 * it and stays put); the cursor was disposed.
 */
export type MoveResult = 'arrived' | 'superseded' | 'lost' | 'disposed';

/** The plushie's look (any plushies option). */
export type CursorLook = Omit<ViewerOptions, 'idle' | 'followPointer'>;

export interface PlushieCursorOptions {
  /** Shown on the name tag. */
  name: string;
  /** The plushie (any plushies option). */
  look?: CursorLook;
  /** Accent for the pointer, tag and highlight, any CSS colour. (default: the plushie's colour, else one from a palette) */
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
  /** Stacking of the container's cursor layer. (default: 2147483000) */
  zIndex?: number;
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
  /** Glide to x, y (container pixels). */
  moveTo(x: number, y: number): Promise<MoveResult>;
  /**
   * Glide to a corner of `target` that leaves room for the label, and stay
   * on it while it moves (until `release`, another move, or it goes away).
   * Null (or not a target) lets go of the current one, stays put and
   * resolves 'lost'.
   */
  pointAt(target: Target | null | undefined): Promise<MoveResult>;
  /** Stop following the pointed-at target (stay where it is). */
  release(): void;
  /** What it's working on (a string, or details); null or '' clears it. Either ends a `done` message still showing. */
  status(status: string | CursorStatus | null): void;
  /** Update only the progress (0..1, null for none); starts a "Working…" status if there is none. */
  progress(value: number | null, step?: [number, number]): void;
  /** Say something for `seconds` (default 2.6). */
  say(text: string, seconds?: number): void;
  /** Press: pointer dips, a ripple at the tip, the plushie squishes. Resolves when the squish is over. */
  click(): Promise<void>;
  /**
   * Finish: clears the status, hops and shows `text` with a check mark for
   * `seconds` (default 1.8), then just the name. Resolves when the hop lands,
   * before the message goes away.
   */
  done(text?: string, seconds?: number): Promise<void>;
  /**
   * Glow round an element or box in the cursor's colour (the editor's
   * "working on this" mark). Separate from pointing: you decide what glows
   * and for how long — e.g. a canvas app passes its own boxes each frame.
   * Cleared with the cursor on `dispose`.
   */
  highlight(target: Target, options?: HighlightOptions): Highlight;
  setDesign(design: CursorDesign): void;
  setName(name: string): void;
  /** Change the accent colour (any CSS colour). */
  setColor(color: string): void;
  /** Change the plushie's look; merged into the current one. */
  setLook(look: CursorLook): void;
  /** Show or drop the plushie (the pointer and label stay). */
  setPlushie(on: boolean): void;
  /** Hide or show it; hidden, it stops animating. */
  show(on: boolean): void;
  /** Remove the cursor and its highlights. Pending moves resolve 'disposed'; later calls do nothing. */
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
.pc-part > svg { transition: transform .14s cubic-bezier(.3, 1.05, .5, 1); }
.pc-arrive { animation: pc-arrive .4s cubic-bezier(.3, 1.05, .5, 1); transform-origin: 0 0; }
@keyframes pc-arrive { from { opacity: 0; transform: scale(.5) } to { opacity: 1; transform: scale(1) } }
.pc-sr { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

.pc-t { display: block; }
.pc-t:not(.pc-t-out) { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; }
.pc-t-in { animation: pc-t-in .32s cubic-bezier(.2, .8, .3, 1) both; }
.pc-t-out { position: absolute; left: 0; top: 0; width: max-content; max-width: inherit; animation: pc-t-out .28s ease-in both; }
@keyframes pc-t-in { from { opacity: 0; transform: translateY(.55em); filter: blur(2px) } }
@keyframes pc-t-out { to { opacity: 0; transform: translateY(-.55em); filter: blur(2px) } }
.pc-unrevealed { visibility: hidden; }
.pc-check { width: 1em; height: 1em; vertical-align: -.14em; margin-right: .3em; }

.pc-ripple { position: absolute; left: 0; top: 0; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
  border: 2.5px solid var(--pc); background: color-mix(in srgb, var(--pc) 22%, transparent);
  animation: pc-ripple .55s cubic-bezier(.2, .7, .3, 1) forwards; }
@keyframes pc-ripple { from { transform: scale(.2); opacity: 1 } to { transform: scale(1); opacity: 0 } }

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
@media (prefers-reduced-motion: reduce) {
  .pc-layer *, .pc-layer *::before, .pc-layer *::after { animation-duration: 0s !important; animation-iteration-count: 1 !important; transition-duration: 0s !important; }
  .pc-mark.pc-busy > svg { opacity: 0; }
}
`;

interface Layer {
  element: HTMLElement;
  container: HTMLElement;
  styles: StyleRoot;
  cursors: Set<CursorState>;
  /** The container's inline position before the layer made it a containing block. */
  position: string | null;
  /** Styles and position are set up (once the container is in a document). */
  ready: boolean;
  /** The container is (near) the viewport: off-screen cursors stop bobbing and marks stop following. */
  visible: boolean;
  observers: {disconnect(): void}[];
}

const layers = new WeakMap<HTMLElement, Layer>();

function joinLayer(container: HTMLElement, cursor: CursorState, zIndex?: number): Layer {
  let layer = layers.get(container);
  if (!layer) {
    const element = el('div', 'pc-layer', container);
    const made: Layer = {element, container, styles: document, cursors: new Set(), position: null, ready: false, visible: true, observers: []};
    // Layout changes that aren't window resizes or scrolls (a sidebar
    // toggling, the container resizing) and coming into view wake its cursors.
    const wakeLayer = () => {
      made.cursors.forEach(wake);
      if (made.visible && marks.size) schedule();
    };
    if (typeof ResizeObserver !== 'undefined') {
      const resize = new ResizeObserver(wakeLayer);
      resize.observe(container);
      made.observers.push(resize);
    }
    const page = container === document.body || container === document.documentElement;
    if (!page && typeof IntersectionObserver !== 'undefined') {
      const view = new IntersectionObserver(
        entries => {
          made.visible = entries[entries.length - 1].isIntersecting;
          wakeLayer();
        },
        {rootMargin: '100px'},
      );
      view.observe(container);
      made.observers.push(view);
    }
    layers.set(container, (layer = made));
  } else if (layer.element.parentNode !== container) {
    // The container's content was replaced (innerHTML): put the layer back.
    container.append(layer.element);
  }
  layer.cursors.add(cursor);
  setUp(layer);
  if (zIndex !== undefined) layer.element.style.zIndex = String(zIndex);
  return layer;
}

/**
 * Styles into the container's root and the container made a containing
 * block, as soon as it is in a document (a container still being built
 * has no root or computed position yet).
 */
function setUp(layer: Layer) {
  if (layer.ready || !layer.container.isConnected) return;
  layer.ready = true;
  const {container} = layer;
  layer.styles = styleRootOf(container);
  injectStyle('layer', LAYER_CSS, layer.styles);
  // Designs mounted before the container was attached went to the page.
  injectStyles(layer.styles);
  if (container !== document.body && getComputedStyle(container).position === 'static') {
    layer.position = container.style.position;
    container.style.position = 'relative';
  }
}

function leaveLayer(layer: Layer, cursor: CursorState) {
  layer.cursors.delete(cursor);
  if (layer.cursors.size) return;
  layer.element.remove();
  layer.observers.forEach(o => o.disconnect());
  if (layer.position !== null) layer.container.style.position = layer.position;
  if (layers.get(layer.container) === layer) layers.delete(layer.container);
}

/**
 * How client (viewport) pixels map into the layer — its origin and scale, so
 * a container under a CSS `scale()` or zoom works — and the visible part of
 * the container in layer pixels (where labels must fit).
 */
interface Frame {
  left: number;
  top: number;
  sx: number;
  sy: number;
  bounds: Bounds;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

function frameOf(layer: Layer): Frame {
  setUp(layer);
  const origin = layer.element.getBoundingClientRect();
  const sx = (layer.element.offsetWidth && origin.width / layer.element.offsetWidth) || 1;
  const sy = (layer.element.offsetHeight && origin.height / layer.element.offsetHeight) || 1;
  const page = layer.container === document.body || layer.container === document.documentElement;
  const box = page ? {left: 0, top: 0, right: innerWidth, bottom: innerHeight} : layer.container.getBoundingClientRect();
  return {
    left: origin.left,
    top: origin.top,
    sx,
    sy,
    bounds: {
      left: (Math.max(box.left, 0) - origin.left) / sx,
      top: (Math.max(box.top, 0) - origin.top) / sy,
      right: (Math.min(box.right, innerWidth) - origin.left) / sx,
      bottom: (Math.min(box.bottom, innerHeight) - origin.top) / sy,
    },
  };
}

const finite = (...values: unknown[]) => values.every(v => typeof v === 'number' && Number.isFinite(v));

const warned = new Set<string>();
function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(`@plushies/cursors: ${message}`);
}

/** Whether `target` is something `pointAt`/`highlight` can follow (its box is checked each frame). */
function isTarget(target: unknown): target is Target {
  return typeof target === 'function' || (typeof target === 'object' && target !== null);
}

const describe = (v: unknown) => (typeof v === 'string' ? JSON.stringify(v) : typeof v);

/** A box in either shape, or null if it isn't a usable one. */
function asBox(b: AnyBox | null | undefined): Box | null {
  if (!b) return null;
  if (typeof b !== 'object') {
    warnOnce(`ignoring a target that isn't a box: ${describe(b)}`);
    return null;
  }
  const box = 'left' in b ? b : {left: b.x, top: b.y, width: b.width, height: b.height};
  if (!finite(box.left, box.top, box.width, box.height)) {
    warnOnce(`ignoring a box that isn't numbers: ${JSON.stringify(b)}`);
    return null;
  }
  return box;
}

function resolveBox(target: Target, frame: Frame): Box | null {
  if (typeof target === 'function') return asBox(target());
  if (!isTarget(target)) return null;
  if (typeof (target as VirtualElement).getBoundingClientRect === 'function') {
    if (target instanceof Element && !target.isConnected) return null;
    const r = (target as VirtualElement).getBoundingClientRect();
    if (!r || !finite(r.left, r.top, r.width, r.height)) return null;
    return {
      left: (r.left - frame.left) / frame.sx,
      top: (r.top - frame.top) / frame.sy,
      width: r.width / frame.sx,
      height: r.height / frame.sy,
    };
  }
  return asBox(target as AnyBox);
}

// ---------------------------------------------------------------------------
// Placement: which way the cursor hangs, ported from the live editor.

export interface Flip {
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
 * area, then mirrored; when neither side fits, whichever has more room.
 * Pointing at a box, the tip goes on whichever corner leaves room —
 * bottom-right first. The tip itself stays inside the visible area, so a
 * cursor whose target scrolls away waits at the edge.
 */
export function place(
  at: {x: number; y: number} | null,
  box: Box | null,
  bounds: Bounds,
  room: {x: number; y: number; up?: number},
  vertical: 1 | -1,
  was: Flip | undefined,
): Flip {
  const up = room.up ?? 0;
  const slack = (flipped: boolean | undefined) => (flipped ? HYSTERESIS : 0);
  const inside = (v: number, lo: number, hi: number) => (lo + 2 <= hi - 2 ? Math.min(hi - 2, Math.max(lo + 2, v)) : v);
  // Hanging right / left of x.
  const fitsRight = (x: number) => x + room.x <= bounds.right - slack(was?.flipX);
  const fitsLeft = (x: number) => x - room.x >= bounds.left;
  // Hanging the design's way (below for vertical 1) / the other way.
  const fitsAway = (y: number) =>
    vertical === 1
      ? y + room.y <= bounds.bottom - slack(was?.flipY) && y - up >= bounds.top
      : y - room.y >= bounds.top + slack(was?.flipY) && y + up <= bounds.bottom;
  const fitsBack = (y: number) =>
    vertical === 1 ? y - room.y >= bounds.top && y + up <= bounds.bottom : y + room.y <= bounds.bottom && y - up >= bounds.top;
  const moreRoomBack = (y: number) => (vertical === 1 ? y - bounds.top > bounds.bottom - y : bounds.bottom - y > y - bounds.top);

  if (!box) {
    const x = inside(at!.x, bounds.left, bounds.right);
    const y = inside(at!.y, bounds.top, bounds.bottom);
    return {
      x,
      y,
      flipX: !fitsRight(x) && (fitsLeft(x) || x - bounds.left > bounds.right - x),
      flipY: !fitsAway(y) && (fitsBack(y) || moreRoomBack(y)),
    };
  }
  const left = Math.max(box.left, bounds.left);
  const right = Math.min(box.left + box.width, bounds.right);
  const top = Math.max(box.top, bounds.top);
  const bottom = Math.min(box.top + box.height, bounds.bottom);

  let x = inside(right - INSET, bounds.left, bounds.right);
  let flipX = false;
  if (!fitsRight(x)) {
    const xl = inside(left + INSET, bounds.left, bounds.right);
    if (fitsLeft(xl) || xl - bounds.left > bounds.right - x) {
      flipX = true;
      x = xl;
    }
  }
  let y = inside(bottom - INSET, bounds.top, bounds.bottom);
  let flipY = false;
  if (!fitsAway(y)) {
    // Hanging below a box that's too low: go to its top corner and hang up.
    const yb = vertical === 1 ? inside(top + INSET, bounds.top, bounds.bottom) : y;
    if (fitsBack(yb) || moreRoomBack(yb)) {
      flipY = true;
      y = yb;
    }
  }
  return {x, y, flipX, flipY};
}

// ---------------------------------------------------------------------------
// One ticker for every cursor and highlight: it reads every layout first,
// then writes, and sleeps once everything has settled. Bobbing designs and
// held targets keep it going, but only while their container is in view
// and the cursor shown (browsers pause it in background tabs).

const all = new Set<CursorState>();
const awake = new Set<CursorState>();
const marks = new Set<Mark>();
let raf = 0;
let last = 0;
/** Run one cursor's or mark's part of a frame; a throw there mustn't stop the others (or the ticker). */
function guard(run: () => void) {
  try {
    run();
  } catch (error) {
    warnOnce(`a cursor update failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}
/** Marks whose container is off-screen stop following until it scrolls back. */
const shownMarks = () => [...marks].filter(mark => mark.layer.visible);
function tick(now: number) {
  raf = 0;
  const dt = Math.min(0.064, (now - last) / 1000 || 0.016);
  last = now;
  const cursors = [...awake];
  const shown = shownMarks();
  for (const cursor of cursors) guard(() => cursor.measure());
  for (const mark of shown) guard(() => mark.measure());
  for (const cursor of cursors) guard(() => cursor.step(dt, now));
  for (const mark of shown) guard(() => mark.apply());
  for (const cursor of cursors) guard(() => cursor.resting() && awake.delete(cursor));
  if (!raf && (awake.size || shownMarks().length)) raf = requestAnimationFrame(tick);
}
function schedule() {
  if (raf) return;
  last = performance.now();
  raf = requestAnimationFrame(tick);
}
function wake(cursor: CursorState) {
  awake.add(cursor);
  schedule();
}
let listening = false;
function listen() {
  if (listening) return;
  listening = true;
  // The visible area changed: labels may need to flip.
  const wakeAll = () => all.forEach(wake);
  addEventListener('resize', wakeAll);
  addEventListener('scroll', wakeAll, {passive: true, capture: true});
}

const DESIGNS: Record<CursorDesign, (styles: StyleRoot) => Design> = {live: liveDesign, buddy: buddyDesign, island: islandDesign};

/** Accents for cursors given neither a colour nor a plushie colour, in turn. */
const PALETTE = ['#7c3aed', '#e8574f', '#2b7de9', '#2f9e57', '#f5a524', '#d6409f', '#0f9fb5'];
let paletteNext = 0;

export interface Spring {
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

/** A cursor's motion state: the point it eases toward, its tip and the floating body (null before its first frame). */
export interface MotionState {
  aim: Spring;
  tip: Spring;
  goal: {x: number; y: number};
  body: Spring | null;
}

/**
 * NaN never heals by itself: every spring step keeps it, the browser drops
 * the transforms and the cursor freezes with its plushie on the tip. If any
 * of the motion has gone non-finite, put it back at rest where the tip was
 * (else where it was going, else the middle of `bounds`, else the origin)
 * and say so; finite motion is left alone.
 */
export function recoverMotion(m: MotionState, bounds: Bounds | null): boolean {
  const {aim, tip, goal, body} = m;
  if (finite(tip.x, tip.y, tip.vx, tip.vy, aim.x, aim.y, aim.vx, aim.vy, goal.x, goal.y) && (!body || finite(body.x, body.y, body.vx, body.vy))) return false;
  const at = finite(tip.x, tip.y) ? tip : finite(goal.x, goal.y) ? goal : bounds && finite(bounds.left, bounds.right, bounds.top, bounds.bottom) ? {x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2} : {x: 0, y: 0};
  m.aim = {x: at.x, y: at.y, vx: 0, vy: 0};
  m.tip = {x: at.x, y: at.y, vx: 0, vy: 0};
  m.goal = {x: at.x, y: at.y};
  m.body = null;
  return true;
}

/** The longest label morph in the designs (ms), plus a frame or two. */
const MORPH_MS = 520;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** A highlight: an overlay following its target, updated by the ticker. */
class Mark {
  readonly element: HTMLElement;
  private box: Box | null = null;
  private written = '';
  cleared = false;

  constructor(
    readonly layer: Layer,
    public target: Target,
    color: string,
  ) {
    this.element = el('div', 'pc-mark');
    layer.element.prepend(this.element);
    this.element.innerHTML = '<svg aria-hidden="true"><rect pathLength="100"/></svg>';
    this.setColor(color);
  }

  setColor(color: string) {
    this.element.style.setProperty('--pc', color);
  }

  measure() {
    try {
      this.box = this.layer.element.isConnected ? resolveBox(this.target, frameOf(this.layer)) : null;
    } catch (error) {
      warnOnce(`a highlight's target threw, hiding it: ${error instanceof Error ? error.message : String(error)}`);
      this.box = null;
    }
  }

  apply() {
    const box = this.box;
    const key = box ? `${box.left}|${box.top}|${box.width}|${box.height}` : 'none';
    if (key === this.written) return;
    this.written = key;
    this.element.style.display = box ? '' : 'none';
    if (box) {
      // left/top, not transform: the entrance animation scales with transform.
      this.element.style.left = `${box.left - 1}px`;
      this.element.style.top = `${box.top - 1}px`;
      this.element.style.width = `${box.width + 2}px`;
      this.element.style.height = `${box.height + 2}px`;
    }
  }

  remove() {
    this.cleared = true;
    marks.delete(this);
    this.element.remove();
  }
}

/** Raised on every update, so the cursor that changed last is on top. */
let stacking = 1;

class CursorState {
  readonly element: HTMLElement;
  design!: Design;
  viewer: PlushieViewer | null = null;
  disposed = false;
  private layer: Layer;
  /** The point the pointer eases toward (it chases `goal`, so moves start gently). */
  private aim: Spring;
  private tip: Spring;
  private body: Spring | null = null;
  private goal: {x: number; y: number};
  private target: Target | null = null;
  private targetBox: Box | null = null;
  private frame: Frame | null = null;
  private room = {x: 0, y: 0, up: 0};
  private flip: Flip | undefined;
  private move: ((result: MoveResult) => void) | null = null;
  private view: CursorView;
  private sayTimer = 0;
  private doneTimer = 0;
  /** Running gestures per viewer: its idle loop resumes when its count drops to 0. */
  private gestures = new WeakMap<PlushieViewer, number>();
  private plushSize = 0;
  private lastPose = {lookX: 0, lookY: 0, lean: 0, turn: 0};
  private written = {tip: '', body: ''};
  private highlights = new Set<Mark>();
  private announcer: HTMLElement;
  private color = '';
  private colorFromLook = false;
  private hidden = false;
  /** Keep ticking until then (ms): a label's size morph is still running, and placement must see where it ends. */
  private until = 0;

  constructor(
    private three: ThreeModule | null,
    private options: PlushieCursorOptions,
  ) {
    this.layer = joinLayer(options.container ?? document.body, this, options.zIndex);
    const {bounds} = frameOf(this.layer);
    const x = finite(options.x) ? options.x! : (bounds.left + bounds.right) / 2;
    const y = finite(options.y) ? options.y! : (bounds.top + bounds.bottom) / 2;
    this.aim = {x, y, vx: 0, vy: 0};
    this.tip = {x, y, vx: 0, vy: 0};
    this.goal = {x, y};
    this.view = {name: options.name, status: null, said: null, done: null};
    this.element = el('div', 'pc-cursor', this.layer.element);
    this.element.dataset.cursor = options.name;
    this.announcer = el('div', 'pc-sr', this.element);
    this.announcer.setAttribute('role', 'status');
    this.announcer.setAttribute('aria-live', 'polite');

    // The accent: given, else the plushie's colour, else the next from the
    // palette (and then the plushie wears it too).
    const lookColor = options.look?.color !== undefined ? toHex(options.look.color as string | readonly number[]) : null;
    let color = options.color && toHex(options.color) ? options.color : null;
    if (options.color && !color) warnOnce(`unknown colour ${JSON.stringify(options.color)}`);
    this.colorFromLook = !color && !!lookColor;
    color ??= lookColor ?? PALETTE[paletteNext++ % PALETTE.length];
    if (!lookColor) this.options = {...options, look: {...options.look, color}};
    this.applyColor(color);
    this.mount(options.design ?? 'live');
    all.add(this);
    listen();
    wake(this);
  }

  private applyColor(color: string) {
    this.color = color;
    const {ink, deep} = inks(color);
    this.element.style.setProperty('--pc', color);
    this.element.style.setProperty('--pc-ink', ink);
    this.element.style.setProperty('--pc-deep', deep);
    for (const mark of this.highlights) mark.setColor(color);
  }

  mount(kind: CursorDesign) {
    if (!DESIGNS[kind]) {
      warnOnce(`unknown design ${JSON.stringify(kind)}, using 'live'`);
      kind = 'live';
    }
    this.viewer?.dispose();
    this.viewer = null;
    this.design?.dispose();
    this.design = DESIGNS[kind](this.layer.styles);
    this.element.dataset.design = kind;
    this.element.append(this.design.root);
    this.body = null;
    this.flip = undefined;
    this.written = {tip: '', body: ''};
    this.mountPlushie();
    this.render();
    wake(this);
  }

  get bare() {
    return !this.viewer;
  }

  /** The design's motion, calmer without a plushie (if it says so) and with reduced motion. */
  private get motion(): Motion {
    const base = this.design.motion;
    const motion = this.bare && this.design.bare?.motion ? {...base, ...this.design.bare.motion} : base;
    return reducedMotion() ? {...motion, damping: 1, bob: 0, hop: 0} : motion;
  }

  private get anchor() {
    return (this.bare && this.design.bare?.anchor) || this.design.anchor;
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
      idle: this.options.idle !== false && !reducedMotion(),
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
    // The rest spot moves with the plushie (and so may the label's room).
    this.flip = undefined;
    wake(this);
  }

  setLook(look: CursorLook) {
    this.options = {...this.options, look: {...this.options.look, ...look}};
    this.viewer?.restyle(look);
    if (look.color !== undefined && this.colorFromLook) {
      const hex = toHex(look.color as string | readonly number[]);
      if (hex) this.applyColor(hex);
    }
  }

  setColor(color: string) {
    if (!toHex(color)) {
      warnOnce(`unknown colour ${JSON.stringify(color)}`);
      return;
    }
    this.colorFromLook = false;
    this.applyColor(color);
  }

  private render() {
    this.design.render(this.view);
    const message = this.view.said ?? this.view.done ?? this.view.status?.text ?? '';
    const text = message ? `${this.view.name}: ${message}` : '';
    if (this.announcer.textContent !== text) this.announcer.textContent = text;
    // The label morphs to its new size (≤ .46 s): stay awake to keep it on screen.
    this.until = performance.now() + MORPH_MS;
    wake(this);
  }

  /** Bring this cursor above the others in its layer. */
  private raise() {
    this.element.style.zIndex = String(++stacking);
  }

  /** Read phase: where things are. */
  measure() {
    if (this.disposed) return;
    this.frame = frameOf(this.layer);
    try {
      this.targetBox = this.target ? resolveBox(this.target, this.frame) : null;
    } catch (error) {
      // A target that throws is as good as gone (step lets go of it).
      warnOnce(`a target threw, letting go of it: ${error instanceof Error ? error.message : String(error)}`);
      this.targetBox = null;
    }
    this.room = this.design.room(this.bare);
  }

  /** Write phase. */
  step(dt: number, now: number) {
    if (this.disposed || !this.frame) return;
    if (this.target && !this.targetBox) {
      // The target is gone: stop following and stay put.
      this.target = null;
      this.finish('lost');
    }
    const box = this.targetBox;
    const next = place(box ? null : this.goal, box, this.frame.bounds, this.room, this.design.vertical, this.flip);
    if (!this.flip || next.flipX !== this.flip.flipX || next.flipY !== this.flip.flipY) {
      this.element.classList.toggle('pc-flip-x', next.flipX);
      this.element.classList.toggle('pc-flip-y', next.flipY);
    }
    this.flip = next;
    this.goal = {x: next.x, y: next.y};

    const motion = this.motion;
    // Two critically damped springs in a row: the pointer accelerates from
    // rest instead of leaping, and still lands without overshoot.
    spring(this.aim, this.goal.x, this.goal.y, motion.tip * 1.6, 1, dt);
    spring(this.tip, this.aim.x, this.aim.y, motion.tip * 1.2, 1, dt);
    const anchor = this.anchor;
    const rest = {x: this.tip.x + (next.flipX ? -anchor.x : anchor.x), y: this.tip.y + (next.flipY ? -anchor.y : anchor.y)};
    if (!this.body) this.body = {...rest, vx: 0, vy: 0};
    spring(this.body, rest.x, rest.y, motion.body, motion.damping, dt);
    // On a leash: however fast the pointer flies, the plushie keeps up.
    const lx = this.body.x - rest.x;
    const ly = this.body.y - rest.y;
    const out = Math.hypot(lx, ly);
    if (out > motion.leash) {
      const nx = lx / out;
      const ny = ly / out;
      this.body.x = rest.x + nx * motion.leash;
      this.body.y = rest.y + ny * motion.leash;
      const away = this.body.vx * nx + this.body.vy * ny;
      if (away > 0) {
        this.body.vx -= away * nx;
        this.body.vy -= away * ny;
      }
    }

    if (!this.sane(dt, next)) return;

    const bob = motion.bob * Math.sin((now / 1000) * Math.PI * 0.9);
    const bx = this.body.x - this.tip.x;
    const by = this.body.y - this.tip.y + bob;
    const tip = `translate3d(${this.tip.x.toFixed(2)}px, ${this.tip.y.toFixed(2)}px, 0)`;
    const body = `translate3d(${bx.toFixed(2)}px, ${by.toFixed(2)}px, 0)`;
    if (tip !== this.written.tip) this.element.style.transform = this.written.tip = tip;
    if (body !== this.written.body) {
      this.design.body.style.transform = this.written.body = body;
      this.design.frame?.({x: bx, y: by, vx: this.body.vx, vy: this.body.vy}, {x: next.flipX, y: next.flipY});
    }

    this.pose(box, now);

    if (this.move && this.settled()) this.finish('arrived');
  }

  /** Motion gone non-finite (see recoverMotion): warn once with this frame's inputs, reset, and place everything afresh next frame. */
  private sane(dt: number, next: Flip) {
    const motion: MotionState = {aim: this.aim, tip: this.tip, goal: this.goal, body: this.body};
    const was = JSON.stringify(motion);
    if (!recoverMotion(motion, this.frame?.bounds ?? null)) return true;
    warnOnce(`the cursor's motion went non-finite, resetting it: ${was} with ${JSON.stringify({dt, next, frame: this.frame, room: this.room, box: this.targetBox, motion: this.motion, anchor: this.anchor, design: this.design.kind})}`);
    Object.assign(this, motion);
    this.written = {tip: '', body: ''};
    wake(this);
    return false;
  }

  private settled() {
    return Math.hypot(this.goal.x - this.tip.x, this.goal.y - this.tip.y) < 0.75 && Math.hypot(this.tip.vx, this.tip.vy) < 12;
  }

  /** Nothing left to animate: the ticker can stop calling this cursor until something changes. */
  resting() {
    if (this.disposed) return true;
    if (this.move || performance.now() < this.until) return false;
    // Bobbing, a busy plushie's wobble and following a target only while it
    // can be seen; showing it again or scrolling it into view wakes it.
    if (!this.hidden && this.layer.visible) {
      if (this.target || this.motion.bob) return false;
      if (this.viewer && this.view.status && this.view.status.busy !== false) return false;
    }
    const body = this.body;
    return this.settled() && Math.hypot(this.aim.vx, this.aim.vy) < 1 && (!body || Math.hypot(body.vx, body.vy) < 1);
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
    const wobble = busy && !reducedMotion() ? 5 * Math.sin(now / 160) : 0;
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

  private finish(result: MoveResult) {
    const move = this.move;
    this.move = null;
    move?.(result);
  }

  private start(): Promise<MoveResult> {
    this.finish('superseded');
    this.raise();
    wake(this);
    return new Promise(resolve => (this.move = resolve));
  }

  moveTo(x: number, y: number): Promise<MoveResult> {
    if (this.disposed) return Promise.resolve('disposed');
    if (!finite(x, y)) {
      warnOnce(`moveTo needs numbers, got ${x}, ${y}`);
      return Promise.resolve('lost');
    }
    this.target = null;
    this.goal = {x, y};
    return this.start();
  }

  pointAt(target: Target | null | undefined): Promise<MoveResult> {
    if (this.disposed) return Promise.resolve('disposed');
    if (!isTarget(target)) {
      if (target != null) warnOnce(`pointAt takes an element, a box or a function, not ${describe(target)} (use querySelector for selectors)`);
      // Nothing to point at: let go of the old target and stay put.
      this.finish('superseded');
      this.target = null;
      this.goal = {x: this.tip.x, y: this.tip.y};
      wake(this);
      return Promise.resolve('lost');
    }
    this.target = target;
    return this.start();
  }

  release() {
    this.target = null;
  }

  status(status: string | CursorStatus | null) {
    if (this.disposed) return;
    let next = typeof status === 'string' ? {text: status} : status;
    if (next && !next.text?.trim() && !next.detail && next.progress == null) next = null;
    if (next?.step) {
      const [n, m] = next.step;
      next = finite(n, m) && m >= 1 ? {...next, step: [clamp(Math.round(n), 1, Math.round(m)), Math.round(m)]} : {...next, step: undefined};
    }
    if (next && next.progress != null && !finite(next.progress)) next = {...next, progress: null};
    this.view.status = next;
    // A new status (or clearing it) ends a finished message still showing.
    this.view.done = null;
    clearTimeout(this.doneTimer);
    if (next) this.raise();
    this.render();
  }

  progress(value: number | null, step?: [number, number]) {
    if (this.disposed) return;
    const current = this.view.status ?? {text: 'Working…'};
    this.status({...current, progress: value, ...(step ? {step} : {})});
  }

  say(text: string, seconds = 2.6) {
    if (this.disposed) return;
    clearTimeout(this.sayTimer);
    this.view.said = text;
    this.raise();
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
    this.gestures.set(viewer, (this.gestures.get(viewer) ?? 0) + 1);
    viewer.setIdle(false);
    try {
      await run(viewer);
    } finally {
      const left = (this.gestures.get(viewer) ?? 1) - 1;
      this.gestures.set(viewer, left);
      if (left === 0 && this.viewer === viewer && this.options.idle !== false && !reducedMotion()) viewer.setIdle(true);
    }
  }

  async click() {
    if (this.disposed) return;
    this.raise();
    this.element.classList.add('pc-pressed');
    this.design.press?.();
    const ripple = el('div', 'pc-ripple', this.layer.element);
    ripple.style.setProperty('--pc', this.color);
    ripple.style.left = `${this.tip.x}px`;
    ripple.style.top = `${this.tip.y}px`;
    setTimeout(() => ripple.remove(), 650);
    setTimeout(() => this.element.classList.remove('pc-pressed'), 140);
    await this.gesture(viewer => viewer.squish(0.35, 0.5));
  }

  async done(text = 'Done', seconds = 1.8) {
    if (this.disposed) return;
    clearTimeout(this.doneTimer);
    // The finish wins over whatever was being said.
    clearTimeout(this.sayTimer);
    this.view.said = null;
    this.view.status = null;
    this.view.done = text;
    this.raise();
    this.render();
    wake(this);
    this.doneTimer = window.setTimeout(() => {
      this.view.done = null;
      this.render();
    }, seconds * 1000);
    await this.gesture(viewer => this.jump(viewer, this.motion.hop));
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
    if (this.disposed) return {update() {}, clear() {}};
    const mark = new Mark(this.layer, target, this.color);
    const apply = (opts: HighlightOptions) => {
      mark.element.classList.toggle('pc-busy', opts.busy !== false);
      mark.element.style.setProperty('--pc-r', `${opts.radius ?? 6}px`);
    };
    apply(options);
    this.highlights.add(mark);
    marks.add(mark);
    mark.measure();
    mark.apply();
    schedule();
    let timer = 0;
    return {
      update(next, opts) {
        if (mark.cleared) return;
        mark.target = next;
        if (opts) apply(opts);
      },
      clear: (delay = 0) => {
        if (mark.cleared) return;
        clearTimeout(timer);
        timer = window.setTimeout(() => {
          mark.element.classList.add('pc-out');
          timer = window.setTimeout(() => {
            mark.remove();
            this.highlights.delete(mark);
          }, 520);
        }, delay * 1000);
      },
    };
  }

  show(on: boolean) {
    this.hidden = !on;
    this.element.classList.toggle('pc-hidden', !on);
    wake(this);
  }

  setName(name: string) {
    if (this.disposed) return;
    this.view.name = name;
    this.element.dataset.cursor = name;
    this.render();
    wake(this);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.finish('disposed');
    all.delete(this);
    awake.delete(this);
    clearTimeout(this.sayTimer);
    clearTimeout(this.doneTimer);
    for (const mark of this.highlights) mark.remove();
    this.highlights.clear();
    this.viewer?.dispose();
    this.viewer = null;
    this.design.dispose();
    this.element.remove();
    leaveLayer(this.layer, this);
  }
}

/**
 * Create a plushie cursor in `options.container` (default: the page). Pass
 * `null` for `three` to use only the pointer and label, without three.js.
 */
export function createPlushieCursor(three: ThreeModule | null, options: PlushieCursorOptions): PlushieCursor {
  const state = new CursorState(three, options);
  const unlessDisposed = (run: () => void) => {
    if (!state.disposed) run();
  };
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
    setDesign: kind => unlessDisposed(() => kind !== state.design.kind && state.mount(kind)),
    setName: name => state.setName(name),
    setColor: color => unlessDisposed(() => state.setColor(color)),
    setLook: look => unlessDisposed(() => state.setLook(look)),
    setPlushie: on => unlessDisposed(() => state.setPlushie(on)),
    show: on => unlessDisposed(() => state.show(on)),
    dispose: () => state.dispose(),
  };
}
