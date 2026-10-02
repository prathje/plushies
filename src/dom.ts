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

const injected = new Set<string>();

/** Add a stylesheet once per page. */
export function injectStyle(id: string, css: string) {
  if (injected.has(id) || typeof document === 'undefined') return;
  injected.add(id);
  const style = document.createElement('style');
  style.dataset.plushieCursors = id;
  style.textContent = css;
  document.head.append(style);
}

/**
 * Change a box's content and animate its size from what it was to what the
 * new content needs. The box clips (`overflow: hidden`) and transitions
 * `width` and `height`; its content should size itself (`width: max-content`)
 * so text doesn't rewrap mid-way. Interrupting a morph starts the next one
 * from wherever the box is now.
 */
export function morph(box: HTMLElement, change: () => void, ms = 420) {
  const w0 = box.offsetWidth;
  const h0 = box.offsetHeight;
  box.style.width = '';
  box.style.height = '';
  change();
  const w1 = box.offsetWidth;
  const h1 = box.offsetHeight;
  if (!w0 || !h0 || (Math.abs(w0 - w1) < 0.5 && Math.abs(h0 - h1) < 0.5)) return;
  box.style.width = `${w0}px`;
  box.style.height = `${h0}px`;
  void box.offsetWidth;
  box.style.width = `${w1}px`;
  box.style.height = `${h1}px`;
  const token = String(Math.random());
  box.dataset.morph = token;
  setTimeout(() => {
    if (box.dataset.morph !== token) return;
    box.style.width = '';
    box.style.height = '';
    delete box.dataset.morph;
  }, ms + 60);
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

/** Reveal a line letter by letter (its full width is laid out from the start). */
export function typeText(holder: HTMLElement, text: string, msPerChar = 22) {
  const span = swapText(holder, text);
  if (span.dataset.typed === text) return;
  span.dataset.typed = text;
  span.textContent = '';
  const shown = el('span', '', span);
  const hidden = el('span', 'pc-unrevealed', span);
  hidden.textContent = text;
  const total = Math.min(1100, text.length * msPerChar);
  const start = performance.now();
  const step = (now: number) => {
    if (!span.isConnected) return;
    const n = Math.round(text.length * Math.min(1, (now - start) / total));
    shown.textContent = text.slice(0, n);
    hidden.textContent = text.slice(n);
    if (n < text.length) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Text that reads on `hex` (dark ink on a pale colour, white otherwise), and a deeper shade of it for text on white. */
export function inks(hex: string): {ink: string; deep: string} {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return {ink: '#fff', deep: hex};
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16) / 255);
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  // Darken toward a readable shade on white (contrast ≈ 4.5).
  let k = 1;
  const shade = (f: number) => [r, g, b].map(c => Math.round(c * f * 255));
  const lum = (f: number) => {
    const [sr, sg, sb] = shade(f).map(c => lin(c / 255));
    return 0.2126 * sr + 0.7152 * sg + 0.0722 * sb;
  };
  while (k > 0.2 && 1.05 / (lum(k) + 0.05) < 4.5) k -= 0.05;
  const [dr, dg, db] = shade(k);
  return {
    ink: luminance > 0.42 ? '#241c16' : '#fff',
    deep: `rgb(${dr}, ${dg}, ${db})`,
  };
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
