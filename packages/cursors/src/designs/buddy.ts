/**
 * 'buddy' — the plushie floats like a balloon on a string tied to a felt
 * pointer, trailing behind and swaying when it moves. Its name is a sewn-on
 * fabric tag; what it's doing comes as a speech bubble typed out letter by
 * letter, with thinking dots while it works and a stitched progress seam.
 */
import type {CursorView, Design} from '../design.js';
import {CHECK_ICON, clearText, el, finalSize, injectStyle, morph, roundedPath, svg, typeText, type StyleRoot} from '../dom.js';

const SIZE = 66;
const ARROW = roundedPath([
  [2, 2, 3],
  [24, 10.5, 7],
  [13, 13, 3.2],
  [10.5, 24, 7],
]);
/** Where the string is tied: the pointer's back notch. */
const KNOT = {x: 12.5, y: 12.5};

const CSS = `
.pc-buddy .pc-part > svg { margin: -2px 0 0 -2px; }
.pc-buddy .pc-string { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: visible; }
.pc-buddy .pc-string path { fill: none; stroke: var(--pc-deep); stroke-width: 1.6; stroke-linecap: round; opacity: .75; }
.pc-buddy .pc-plush { left: ${-SIZE / 2}px; top: ${-SIZE / 2}px; width: ${SIZE}px; height: ${SIZE}px; }

.pc-buddy .pc-tag { position: absolute; left: 6px; top: 20px; transform-origin: 3px 2px; rotate: var(--swing, -7deg);
  background: #fffaf1; color: var(--pc-deep); font: 600 12px/1 var(--pc-font-round); letter-spacing: .01em; white-space: nowrap;
  max-width: 140px; overflow: hidden; text-overflow: ellipsis;
  padding: 5px 9px 5px 13px; border-radius: 3px 6px 6px 3px;
  outline: 1.5px dashed color-mix(in srgb, var(--pc) 65%, white); outline-offset: -3.5px;
  box-shadow: 0 1px 0 rgba(0,0,0,.06), 0 3px 8px rgba(40,25,10,.18); }
.pc-buddy .pc-tag::before { content: ''; position: absolute; left: 4px; top: 50%; width: 4px; height: 4px; margin-top: -2px; border-radius: 50%;
  background: color-mix(in srgb, var(--pc) 70%, #3a2a1a); }
.pc-flip-x .pc-buddy .pc-tag { left: auto; right: 6px; transform-origin: calc(100% - 3px) 2px; rotate: calc(-1 * var(--swing, -7deg));
  padding: 5px 13px 5px 9px; border-radius: 6px 3px 3px 6px; }
.pc-flip-x .pc-buddy .pc-tag::before { left: auto; right: 4px; }

.pc-buddy .pc-bubble { position: absolute; left: 28px; bottom: 6px; transform-origin: 0 100%;
  transition: opacity .14s, scale .36s cubic-bezier(.3, 1.05, .5, 1); scale: .7; opacity: 0; }
.pc-buddy .pc-bubble.is-open { scale: 1; opacity: 1; }
.pc-flip-x .pc-buddy .pc-bubble { left: auto; right: 28px; transform-origin: 100% 100%; }
.pc-buddy .pc-box { box-sizing: border-box; overflow: hidden; background: #fff; color: #2b221c; border-radius: 16px;
  border: 2px solid color-mix(in srgb, var(--pc) 55%, white);
  padding: 7px 12px 8px; font: 600 13px/18px var(--pc-font-round);
  box-shadow: 0 8px 20px rgba(40,25,10,.16), 0 1px 2px rgba(40,25,10,.12);
  transition: width .42s cubic-bezier(.3, 1.04, .5, 1), height .42s cubic-bezier(.3, 1.04, .5, 1); }
.pc-buddy .pc-tail { position: absolute; left: -6px; bottom: 10px; width: 12px; height: 12px; background: #fff; rotate: 45deg;
  border-left: 2px solid color-mix(in srgb, var(--pc) 55%, white); border-bottom: 2px solid color-mix(in srgb, var(--pc) 55%, white); border-radius: 0 0 0 3px; }
.pc-flip-x .pc-buddy .pc-tail { left: auto; right: -6px; rotate: -135deg; }
.pc-buddy .pc-inner { width: max-content; max-width: min(230px, 60vw); }
.pc-buddy .pc-text { position: relative; white-space: pre-wrap; overflow-wrap: anywhere; }
.pc-buddy .pc-text:empty { display: none; }
.pc-buddy .pc-detail { font: 500 11.5px/16px var(--pc-font-round); color: #8a7a6c; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.pc-buddy .pc-detail:empty { display: none; }
.pc-buddy .pc-meta { display: none; align-items: center; gap: 8px; margin-top: 6px; }
.pc-buddy .pc-meta.has { display: flex; }
.pc-buddy .pc-seam { flex: 1; min-width: 90px; height: 4px; border-radius: 3px; background: repeating-linear-gradient(90deg, #e8dfd5 0 6px, transparent 6px 9px); position: relative; overflow: hidden; }
.pc-buddy .pc-seam > i { position: absolute; inset: 0; width: calc(var(--p, 0) * 100%); background: repeating-linear-gradient(90deg, var(--pc) 0 6px, transparent 6px 9px); transition: width .45s cubic-bezier(.3, .8, .3, 1); }
.pc-buddy .pc-count { font: 600 11px/1 var(--pc-font-round); color: #8a7a6c; font-variant-numeric: tabular-nums; }
.pc-buddy .pc-dots { display: inline-flex; gap: 3px; margin-left: 4px; vertical-align: 2px; }
.pc-buddy .pc-dots:only-child { margin: 5px 2px; }
.pc-buddy .pc-dots i { width: 5px; height: 5px; border-radius: 50%; background: var(--pc); animation: pc-dot 1.1s ease-in-out infinite; }
.pc-buddy .pc-dots i:nth-child(2) { animation-delay: .15s; }
.pc-buddy .pc-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes pc-dot { 0%, 60%, 100% { transform: translateY(0); opacity: .45 } 30% { transform: translateY(-4px); opacity: 1 } }
.pc-buddy .pc-done { color: #2f9e57; }
`;

export function buddyDesign(styles: StyleRoot): Design {
  injectStyle('buddy', CSS, styles);
  const root = el('div', 'pc-buddy');
  const string = svg('<svg class="pc-string"><path/></svg>', 'pc-string', root);
  const path = string.querySelector('path')!;
  const part = el('div', 'pc-part', root);
  svg(
    `<svg width="27" height="27" viewBox="0 0 27 27"><path d="${ARROW}" fill="var(--pc)" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>` +
      `<path d="${ARROW}" fill="none" stroke="rgba(255,255,255,.85)" stroke-width="1.1" stroke-dasharray="2 2.2" stroke-linecap="round" transform="translate(9.4 9.4) scale(.58) translate(-9.4 -9.4)" vector-effect="non-scaling-stroke"/></svg>`,
    'pc-arrive',
    part,
  );
  const body = el('div', 'pc-body', root);
  const plushHost = el('div', 'pc-plush', body);
  const tag = el('div', 'pc-tag', body);
  const bubble = el('div', 'pc-bubble', body);
  const box = el('div', 'pc-box', bubble);
  el('div', 'pc-tail', bubble);
  const inner = el('div', 'pc-inner', box);
  const text = el('div', 'pc-text', inner);
  const detail = el('div', 'pc-detail', inner);
  const meta = el('div', 'pc-meta', inner);
  const seam = el('div', 'pc-seam', meta);
  const fill = el('i', '', seam);
  const count = el('span', 'pc-count', meta);
  const dots = el('span', 'pc-dots');
  dots.innerHTML = '<i></i><i></i><i></i>';

  let closing = 0;
  return {
    kind: 'buddy',
    root,
    body,
    plushHost,
    anchor: {x: 40, y: -58},
    motion: {tip: 11, body: 6, damping: 0.6, bob: 3.5, hop: 20, leash: 30},
    vertical: -1,
    // Without the balloon there is nothing to tie the string to: the tag and
    // bubble sit right by the pointer and follow it closely.
    bare: {anchor: {x: 22, y: -6}, motion: {body: 14, damping: 0.8, bob: 0, leash: 12}},
    room(bare) {
      const open = bubble.classList.contains('is-open');
      const {width, height} = finalSize(box);
      if (bare) {
        return {
          x: 22 + Math.max(6 + tag.offsetWidth, open ? 28 + width : 0) + 10,
          y: 6 + (open ? 6 + height : 0) + 8,
          up: 14 + tag.offsetHeight + 6,
        };
      }
      return {
        x: 40 + Math.max(SIZE / 2 + tag.offsetWidth * 0.4, open ? 28 + width : 0) + 10,
        y: 58 + Math.max(SIZE / 2, open ? height + 6 : 0) + 8,
        up: 4,
      };
    },
    render(view: CursorView) {
      tag.textContent = view.name;
      const s = view.status;
      const note = view.said ?? view.done;
      const message = note ?? s?.text ?? null;
      const busy = !note && !!s && s.busy !== false;
      bubble.classList.toggle('is-open', message !== null);
      clearTimeout(closing);
      if (message === null) {
        // Empty it once it has faded, so reopening starts fresh.
        closing = window.setTimeout(() => clearText(text), 200);
        return;
      }
      morph(box, () => {
        if (message) typeText(text, message);
        else text.textContent = '';
        text.classList.toggle('pc-done', !!view.done);
        const line = text.querySelector('.pc-t:not(.pc-t-out)');
        if (view.done && line && !line.querySelector('.pc-check')) line.insertAdjacentHTML('afterbegin', CHECK_ICON);
        // Thinking dots trail the text while it works.
        if (busy) (message ? text.querySelector('.pc-t:not(.pc-t-out)') ?? text : inner).append(dots);
        else dots.remove();
        detail.textContent = !note ? s?.detail ?? '' : '';
        const p = !note ? s?.progress : null;
        const st = !note ? s?.step : undefined;
        meta.classList.toggle('has', p != null || !!st);
        seam.style.display = p != null ? '' : 'none';
        if (p != null) fill.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
        count.textContent = st ? `${st[0]} of ${st[1]}` : '';
      });
    },
    frame(b, flip) {
      // The string: from the knot at the pointer's back to the plushie's
      // bottom, sagging when the plushie drifts closer and dragged by its motion.
      const knot = {x: flip.x ? -KNOT.x : KNOT.x, y: flip.y ? -KNOT.y : KNOT.y};
      const end = {x: b.x, y: b.y + (flip.y ? -1 : 1) * SIZE * 0.36};
      const rest = Math.hypot(40 - KNOT.x, 58 - SIZE * 0.36 + KNOT.y);
      const length = Math.hypot(end.x - knot.x, end.y - knot.y);
      const slack = Math.max(0, rest - length);
      const cx = (knot.x + end.x) / 2 - b.vx * 0.025;
      const cy = (knot.y + end.y) / 2 + slack * 0.7 + 4 - b.vy * 0.015;
      path.setAttribute('d', `M${knot.x.toFixed(1)} ${knot.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${end.x.toFixed(1)} ${end.y.toFixed(1)}`);
      // The tag swings with the motion.
      tag.style.setProperty('--swing', `${(-7 + Math.max(-14, Math.min(14, -b.vx * 0.04))).toFixed(2)}deg`);
    },
    dispose: () => root.remove(),
  };
}
