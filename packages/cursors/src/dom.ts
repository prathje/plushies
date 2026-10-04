/** Small DOM helpers shared by the designs. */

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', parent?: Element): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  parent?.append(node);
  return node;
}

export function svg(markup: string, className = '', parent?: Element): SVGSVGElement {
  const holder = document.createElement('div');
  holder.innerHTML = markup.trim();
  const node = holder.firstElementChild as SVGSVGElement;
  if (className) node.setAttribute('class', className);
  parent?.append(node);
  return node;
}

/** Where stylesheets go: the page, or the shadow root a container lives in. */
export type StyleRoot = Document | ShadowRoot;

const injected = new WeakMap<StyleRoot, Set<string>>();
/** Every stylesheet injected so far, to copy into a root found later. */
const sheets = new Map<string, string>();

/** Add a stylesheet once per page (or shadow root). */
export function injectStyle(id: string, css: string, root: StyleRoot = document) {
  if (typeof document === 'undefined') return;
  sheets.set(id, css);
  let ids = injected.get(root);
  if (!ids) injected.set(root, (ids = new Set()));
  if (ids.has(id)) return;
  ids.add(id);
  const style = document.createElement('style');
  style.dataset.plushieCursors = id;
  style.textContent = css;
  (root instanceof Document ? root.head : root).append(style);
}

/** Add every stylesheet injected so far to `root` (a container that turned out to live in a shadow root). */
export function injectStyles(root: StyleRoot) {
  for (const [id, css] of sheets) injectStyle(id, css, root);
}

/** The style root an element renders in. */
export function styleRootOf(node: Node): StyleRoot {
  const root = node.getRootNode();
  return typeof ShadowRoot !== 'undefined' && root instanceof ShadowRoot ? root : document;
}

/** Whether the page asks for less motion. */
export function reducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Change a box's content and animate its size from what it was to what the
 * new content needs. The box clips (`overflow: hidden`) and transitions
 * `width` and `height`; its content should size itself (`width: max-content`)
 * so text doesn't rewrap mid-way. Interrupting a morph starts the next one
 * from wherever the box is now. While it runs, `finalSize` reports where it
 * ends (the box's own size is mid-way).
 */
export function morph(box: HTMLElement, change: () => void, ms = 420) {
  const w0 = box.offsetWidth;
  const h0 = box.offsetHeight;
  box.style.width = '';
  box.style.height = '';
  delete box.dataset.morphW;
  delete box.dataset.morphH;
  change();
  // The new content may start its own transitions (padding, font size);
  // measure the size they end at, then put them back where they were.
  const running = (box.getAnimations?.({subtree: true}) ?? []).filter(
    a => typeof CSSTransition !== 'undefined' && a instanceof CSSTransition && !(a.effect instanceof KeyframeEffect && a.effect.target === box && (a.transitionProperty === 'width' || a.transitionProperty === 'height')),
  );
  const at = running.map(a => a.currentTime ?? 0);
  for (const a of running) a.currentTime = a.effect?.getComputedTiming().endTime ?? 0;
  const w1 = box.offsetWidth;
  const h1 = box.offsetHeight;
  running.forEach((a, i) => (a.currentTime = at[i]));
  if (!w0 || !h0 || (Math.abs(w0 - w1) < 0.5 && Math.abs(h0 - h1) < 0.5)) return;
  box.style.width = `${w0}px`;
  box.style.height = `${h0}px`;
  void box.offsetWidth;
  box.style.width = `${w1}px`;
  box.style.height = `${h1}px`;
  box.dataset.morphW = String(w1);
  box.dataset.morphH = String(h1);
  const token = String(Math.random());
  box.dataset.morph = token;
  setTimeout(() => {
    if (box.dataset.morph !== token) return;
    box.style.width = '';
    box.style.height = '';
    delete box.dataset.morph;
    delete box.dataset.morphW;
    delete box.dataset.morphH;
  }, ms + 60);
}

/**
 * The size a morphing box ends at — its own size otherwise. Placement reads
 * this: a label must flip for the room it will take, not the room it has
 * part-way through growing.
 */
export function finalSize(box: HTMLElement): {width: number; height: number} {
  const {morphW, morphH} = box.dataset;
  return {width: morphW ? Number(morphW) : box.offsetWidth, height: morphH ? Number(morphH) : box.offsetHeight};
}

/** Replace a line's text: the old one slides up and fades while the new one comes in from below. */
export function swapText(holder: HTMLElement, text: string) {
  const current = holder.querySelector<HTMLElement>(':scope > .pc-t:not(.pc-t-out)');
  if (current?.dataset.text === text) return current;
  if (current) {
    current.classList.add('pc-t-out');
    setTimeout(() => current.remove(), 320);
  }
  const span = el('span', current ? 'pc-t pc-t-in' : 'pc-t', holder);
  span.dataset.text = text;
  span.textContent = text;
  return span;
}

/** Empty a line (when its box closes), so reopening doesn't slide the old text out. */
export function clearText(holder: HTMLElement) {
  holder.replaceChildren();
}

/** Reveal a line letter by letter (its full width is laid out from the start). */
export function typeText(holder: HTMLElement, text: string, msPerChar = 22) {
  const span = swapText(holder, text);
  if (span.dataset.typed === text) return;
  span.dataset.typed = text;
  span.textContent = '';
  const shown = el('span', '', span);
  const hidden = el('span', 'pc-unrevealed', span);
  hidden.textContent = text;
  const total = reducedMotion() ? 0 : Math.min(1100, text.length * msPerChar);
  const start = performance.now();
  const step = (now: number) => {
    if (!span.isConnected) return;
    const n = total ? Math.round(text.length * Math.min(1, (now - start) / total)) : text.length;
    shown.textContent = text.slice(0, n);
    hidden.textContent = text.slice(n);
    if (n < text.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** sRGB 0..255. */
export type Rgb = [number, number, number];

const parsed = new Map<string, Rgb | null>();
let probe: CanvasRenderingContext2D | null | undefined;

/**
 * Any CSS colour (hex, names, rgb()/hsl() in either syntax, oklch(), …) as
 * sRGB, or null if it isn't one. Hex is decoded here; everything else is
 * resolved by the browser.
 */
export function parseColor(color: string): Rgb | null {
  const key = color.trim().toLowerCase();
  if (parsed.has(key)) return parsed.get(key)!;
  let rgb: Rgb | null = null;
  const hex = /^#([0-9a-f]{3,8})$/.exec(key);
  if (hex && (hex[1].length === 3 || hex[1].length === 4)) rgb = [0, 1, 2].map(i => parseInt(hex[1][i] + hex[1][i], 16)) as Rgb;
  else if (hex && (hex[1].length === 6 || hex[1].length === 8)) rgb = [0, 2, 4].map(i => parseInt(hex[1].slice(i, i + 2), 16)) as Rgb;
  else if (!hex) rgb = browserColor(key);
  if (parsed.size > 256) parsed.clear();
  parsed.set(key, rgb);
  return rgb;
}

function browserColor(color: string): Rgb | null {
  if (typeof CSS === 'undefined' || typeof document === 'undefined' || !CSS.supports('color', color)) return null;
  if (probe === undefined) {
    const canvas = Object.assign(document.createElement('canvas'), {width: 1, height: 1});
    probe = canvas.getContext('2d', {willReadFrequently: true});
  }
  if (!probe) return null;
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = '#000';
  probe.fillStyle = color;
  probe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data;
  const alpha = a / 255 || 1;
  return [r, g, b].map(v => Math.min(255, Math.round(v / alpha))) as Rgb;
}

/** `#rrggbb` for any colour `parseColor` understands (or an 0..1 triple). */
export function toHex(color: string | readonly number[]): string | null {
  const rgb = typeof color === 'string' ? parseColor(color) : color.length >= 3 ? (color.slice(0, 3).map(v => Math.round(Math.max(0, Math.min(1, v)) * 255)) as Rgb) : null;
  if (!rgb || rgb.some(v => !Number.isFinite(v))) return null;
  return '#' + rgb.map(v => v.toString(16).padStart(2, '0')).join('');
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** WCAG relative luminance of sRGB 0..255. */
export function luminance([r, g, b]: Rgb): number {
  return 0.2126 * linear(r / 255) + 0.7152 * linear(g / 255) + 0.0722 * linear(b / 255);
}
const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

const DARK_INK = '#241c16';
const DARK_INK_LUMINANCE = luminance([0x24, 0x1c, 0x16]);

/**
 * Text that reads on `color` (white or a dark ink, whichever contrasts more)
 * and a deeper shade of the colour for text on white.
 */
export function inks(color: string): {ink: string; deep: string} {
  const rgb = parseColor(color);
  if (!rgb) return {ink: '#fff', deep: color};
  const lum = luminance(rgb);
  // Darken toward a readable shade on white (contrast ≈ 4.5).
  let k = 1;
  const shade = (f: number) => rgb.map(c => Math.round(c * f)) as Rgb;
  while (k > 0.2 && contrast(1, luminance(shade(k))) < 4.5) k -= 0.05;
  const [dr, dg, db] = shade(k);
  return {
    ink: contrast(1, lum) >= contrast(DARK_INK_LUMINANCE, lum) ? '#fff' : DARK_INK,
    deep: `rgb(${dr}, ${dg}, ${db})`,
  };
}

/** `color` mixed toward white by `w` (0..1). */
export function mixWhite(color: string, w: number): string {
  const rgb = parseColor(color);
  if (!rgb) return color;
  const [r, g, b] = rgb.map(c => Math.round(c + (255 - c) * w));
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * A closed shape through `points` with each corner rounded by its radius
 * (quadratic curves through the corner, starting `radius` along each edge).
 */
export function roundedPath(points: [number, number, number][]): string {
  const at = (i: number) => points[(i + points.length) % points.length];
  const toward = ([x, y]: number[], [tx, ty]: number[], d: number) => {
    const len = Math.hypot(tx - x, ty - y);
    return [x + ((tx - x) / len) * d, y + ((ty - y) / len) * d];
  };
  let d = '';
  points.forEach((corner, i) => {
    const r = corner[2];
    const [ax, ay] = toward(corner, at(i - 1), r);
    const [bx, by] = toward(corner, at(i + 1), r);
    d += `${i ? 'L' : 'M'}${ax.toFixed(2)} ${ay.toFixed(2)} Q${corner[0]} ${corner[1]} ${bx.toFixed(2)} ${by.toFixed(2)} `;
  });
  return d + 'Z';
}

export const CHECK_ICON = '<svg class="pc-check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.4 5 8.8 9.6 3.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
