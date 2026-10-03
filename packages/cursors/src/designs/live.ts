/**
 * 'live' — VideoZero's live editor cursor, with the plushie where the agent
 * sparkle sat: the tail-less rounded arrow, a name pill nested in the V at
 * its back that grows into a chat bubble (squared corner toward the tip)
 * while it works, and the sparkle's twinkling glints beside the plushie.
 */
import type {CursorView, Design} from '../design';
import {CHECK_ICON, clearText, el, injectStyle, morph, roundedPath, svg, swapText, type StyleRoot} from '../dom';

/** The editor's pointer: an arrowhead with no tail, back corners rounded to match the pill. */
const ARROW = roundedPath([
  [2, 2, 2.2],
  [19, 8.5, 5],
  [10.5, 10.5, 2.5],
  [8.5, 19, 5],
]);
const SPARKLE = 'M6 0 Q6.9 5.1 12 6 Q6.9 6.9 6 12 Q5.1 6.9 0 6 Q5.1 5.1 6 0 Z';
const SIZE = 46;

const CSS = `
.pc-live .pc-part > svg { margin: -2px 0 0 -2px; }
.pc-live .pc-plush { left: ${-SIZE / 2}px; top: ${-SIZE / 2}px; width: ${SIZE}px; height: ${SIZE}px; }
.pc-live .pc-glint { position: absolute; display: block; overflow: visible; opacity: 0; }
.pc-live .pc-glint path { fill: #fff; }
.pc-live.is-busy .pc-glint { animation: pc-glint .9s cubic-bezier(.45, 0, .55, 1) infinite; }
.pc-live.is-busy .pc-glint + .pc-glint { animation-delay: .45s; }
@keyframes pc-glint { 0% { opacity: 0; transform: scale(.2) rotate(0deg) } 40% { opacity: 1; transform: scale(1) rotate(45deg) } 80%, 100% { opacity: 0; transform: scale(.2) rotate(90deg) } }

.pc-live .pc-label { position: absolute; left: 10px; top: 10px; }
.pc-flip-x .pc-live .pc-label { left: auto; right: 10px; }
.pc-flip-y .pc-live .pc-label { top: auto; bottom: 10px; }
.pc-live .pc-box { box-sizing: border-box; overflow: hidden; background: var(--pc); color: var(--pc-ink);
  border-radius: 10px; padding: 2px 7px; font: 600 11px/16px var(--pc-font); white-space: nowrap;
  box-shadow: 0 1px 3px rgba(0,0,0,.25);
  transition: width .38s cubic-bezier(.3, 1.04, .5, 1), height .38s cubic-bezier(.3, 1.04, .5, 1), border-radius .25s, padding .25s; }
.pc-live .pc-box.is-open { border-radius: 2px 12px 12px 12px; padding: 5px 9px 6px; }
.pc-flip-x .pc-live .pc-box.is-open { border-radius: 12px 2px 12px 12px; }
.pc-flip-y .pc-live .pc-box.is-open { border-radius: 12px 12px 12px 2px; }
.pc-flip-x.pc-flip-y .pc-live .pc-box.is-open { border-radius: 12px 12px 2px 12px; }
.pc-live .pc-inner { width: max-content; max-width: min(240px, 62vw); }
.pc-live .pc-name { display: flex; white-space: nowrap; transition: font-size .25s, opacity .25s; }
.pc-live .pc-name > span:first-child { min-width: 0; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
.pc-live .is-open .pc-name { font-size: 10px; line-height: 14px; opacity: .8; }
.pc-live .pc-step { margin-left: 4px; font-variant-numeric: tabular-nums; }
.pc-live .pc-text { position: relative; display: none; font-size: 13px; line-height: 18px; font-weight: 500; white-space: pre-wrap; overflow-wrap: anywhere; max-width: min(240px, 62vw); }
.pc-live .is-open .pc-text { display: block; }
.pc-live .pc-detail { display: none; font-size: 11px; line-height: 15px; font-weight: 500; opacity: .78; white-space: pre-wrap; overflow-wrap: anywhere; max-width: min(240px, 62vw); }
.pc-live .is-open .pc-detail.has { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.pc-live .pc-bar { display: none; height: 3px; margin-top: 5px; border-radius: 2px; background: color-mix(in srgb, currentColor 25%, transparent); overflow: hidden; }
.pc-live .is-open .pc-bar.has { display: block; }
.pc-live .pc-bar > i { display: block; height: 100%; width: calc(var(--p, 0) * 100%); border-radius: inherit; background: currentColor; transition: width .45s cubic-bezier(.3, .8, .3, 1); }
.pc-live .pc-pop { animation: pc-live-pop .5s cubic-bezier(.3, .7, .4, 1); }
@keyframes pc-live-pop { 35% { transform: scale(1.05) } }
`;

export function liveDesign(styles: StyleRoot): Design {
  injectStyle('live', CSS, styles);
  const root = el('div', 'pc-live');
  const part = el('div', 'pc-part', root);
  svg(`<svg width="22" height="22" viewBox="0 0 22 22"><path d="${ARROW}" fill="var(--pc)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`, 'pc-arrive', part);
  const body = el('div', 'pc-body', root);
  const plushHost = el('div', 'pc-plush', body);
  // The editor sparkle's two glints, twinkling out of step beside the plushie while it works.
  for (const [x, y, s] of [[17, -27, 11], [21, 6, 8]]) {
    const g = svg(`<svg width="${s}" height="${s}" viewBox="0 0 12 12"><path d="${SPARKLE}"/></svg>`, 'pc-glint', body);
    g.style.left = `${x}px`;
    g.style.top = `${y}px`;
  }
  const label = el('div', 'pc-label', root);
  const box = el('div', 'pc-box', label);
  const inner = el('div', 'pc-inner', box);
  const nameRow = el('div', 'pc-name', inner);
  const name = el('span', '', nameRow);
  const step = el('span', 'pc-step', nameRow);
  const text = el('div', 'pc-text', inner);
  const detail = el('div', 'pc-detail', inner);
  const bar = el('div', 'pc-bar', inner);
  const fill = el('i', '', bar);

  let lastDone: string | null = null;
  return {
    kind: 'live',
    root,
    body,
    plushHost,
    // Where the sparkle was: just above and right of the pointer's back.
    anchor: {x: 32, y: -15},
    motion: {tip: 16, body: 13, damping: 0.68, bob: 1.5, hop: 14, leash: 24},
    vertical: 1,
    // The plushie floats above the tip, the label hangs below it.
    room: bare => ({x: 10 + box.offsetWidth + 6, y: 10 + box.offsetHeight + 6, up: bare ? 4 : 15 + SIZE / 2 + 2}),
    render(view: CursorView) {
      const s = view.status;
      const message = view.said ?? view.done ?? s?.text ?? null;
      const busy = !view.said && !view.done && !!s && s.busy !== false;
      root.classList.toggle('is-busy', busy);
      morph(box, () => {
        box.classList.toggle('is-open', message !== null);
        name.textContent = view.name;
        step.textContent = !view.said && !view.done && s?.step ? `· ${s.step[0]}/${s.step[1]}` : '';
        if (message !== null) {
          const line = swapText(text, view.done ?? message);
          if (view.done && !line.querySelector('.pc-check')) line.insertAdjacentHTML('afterbegin', CHECK_ICON);
        } else clearText(text);
        const d = !view.said && !view.done ? s?.detail ?? '' : '';
        detail.textContent = d;
        detail.classList.toggle('has', !!d);
        const p = !view.said && !view.done ? s?.progress : null;
        bar.classList.toggle('has', p != null);
        if (p != null) fill.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
      });
      if (view.done && view.done !== lastDone) {
        box.classList.remove('pc-pop');
        void box.offsetWidth;
        box.classList.add('pc-pop');
      }
      lastDone = view.done;
    },
    dispose: () => root.remove(),
  };
}
