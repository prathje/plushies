/**
 * 'island' — a classic pointer with a dark glass capsule: the plushie sits on
 * a round seat ringed by its progress, next to its name. While it works the
 * capsule grows into a small status card (shimmering line, step chip, detail)
 * and shrinks back to a pill when it's done.
 */
import type {CursorView, Design} from '../design';
import {CHECK_ICON, clearText, el, injectStyle, morph, svg, swapText, type StyleRoot} from '../dom';

const SIZE = 40;
const SEAT = 34;
const RING_R = 19;
const RING = 2 * Math.PI * RING_R;

const CSS = `
.pc-island .pc-part > svg { margin: -2px 0 0 -3px; }
.pc-island .pc-cap { position: absolute; left: 0; top: 0; }
.pc-flip-x .pc-island .pc-cap { left: auto; right: 0; }
.pc-flip-y .pc-island .pc-cap { top: auto; bottom: 0; }
.pc-island .pc-box { box-sizing: border-box; overflow: hidden; color: #fff; font: 500 12px/16px var(--pc-font);
  background: rgba(22, 22, 27, .86); -webkit-backdrop-filter: blur(14px) saturate(1.6); backdrop-filter: blur(14px) saturate(1.6);
  border-radius: 24px; padding: 5px 13px 5px 5px;
  box-shadow: 0 10px 28px rgba(0,0,0,.28), 0 1px 3px rgba(0,0,0,.2), inset 0 0 0 1px rgba(255,255,255,.09);
  transition: width .46s cubic-bezier(.32, 1.04, .45, 1), height .46s cubic-bezier(.32, 1.04, .45, 1), border-radius .3s, padding .3s; }
.pc-island .pc-box.is-open { border-radius: 20px; padding: 7px 14px 8px 7px; }
.pc-bare .pc-island .pc-seat { display: none; }
.pc-bare .pc-island .pc-box { padding-left: 12px; }
.pc-bare .pc-island .pc-box.is-open { padding-left: 14px; }
.pc-bare .pc-island .pc-col { min-height: 0; }
.pc-island .pc-inner { display: flex; align-items: center; gap: 9px; width: max-content; }
.pc-island .is-open .pc-inner { align-items: flex-start; }
.pc-island .pc-seat { position: relative; flex: none; width: ${SEAT}px; height: ${SEAT}px; border-radius: 50%;
  background: radial-gradient(circle at 50% 28%, color-mix(in srgb, var(--pc) 38%, #3a3a44) 0%, color-mix(in srgb, var(--pc) 16%, #17171c) 100%); }
.pc-island .pc-plush { z-index: 0; left: ${(SEAT - SIZE) / 2}px; top: ${(SEAT - SIZE) / 2 - 1}px; width: ${SIZE}px; height: ${SIZE}px; }
.pc-island .pc-ring { position: absolute; left: -5px; top: -5px; width: ${SEAT + 10}px; height: ${SEAT + 10}px; overflow: visible; rotate: -90deg; pointer-events: none; z-index: 1; }
.pc-island .pc-ring circle { fill: none; stroke-width: 2.5; }
.pc-island .pc-ring .pc-track { stroke: rgba(255,255,255,.12); opacity: 0; transition: opacity .3s; }
.pc-island .pc-ring .pc-arc { stroke: var(--pc); stroke-linecap: round; stroke-dasharray: ${RING.toFixed(2)}; stroke-dashoffset: ${RING.toFixed(2)};
  transition: stroke-dashoffset .5s cubic-bezier(.3, .8, .3, 1), opacity .3s; opacity: 0; transform-origin: 50% 50%; }
.pc-island .is-progress .pc-track, .pc-island .is-progress .pc-arc, .pc-island .is-spin .pc-track, .pc-island .is-spin .pc-arc { opacity: 1; }
.pc-island .is-spin .pc-arc { stroke-dashoffset: ${(RING * 0.74).toFixed(2)}; animation: pc-spin 1s linear infinite; }
.pc-island .is-finished .pc-arc { opacity: 1; stroke: #34c759; stroke-dashoffset: 0; }
@keyframes pc-spin { to { transform: rotate(360deg) } }
.pc-island .pc-col { display: flex; flex-direction: column; justify-content: center; min-height: ${SEAT}px; max-width: min(230px, 60vw); }
.pc-island .pc-head { display: flex; align-items: center; gap: 7px; }
.pc-island .pc-name { font-weight: 650; font-size: 13px; letter-spacing: -.005em; white-space: nowrap; min-width: 0; max-width: 150px; overflow: hidden; text-overflow: ellipsis; }
.pc-island .pc-chip { display: none; padding: 1px 6px; border-radius: 6px; font: 600 10.5px/15px var(--pc-font); font-variant-numeric: tabular-nums;
  background: rgba(255,255,255,.12); color: rgba(255,255,255,.85); }
.pc-island .pc-chip.has { display: inline-block; }
.pc-island .pc-chip.is-done { background: #34c759; color: #fff; padding: 1px 4px; }
.pc-island .pc-chip .pc-check { margin: 0; vertical-align: -.17em; }
.pc-island .pc-line { position: relative; display: none; color: rgba(255,255,255,.74); white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 1px; }
.pc-island .is-open .pc-line { display: block; }
.pc-island .is-busy .pc-line .pc-t:not(.pc-t-out) { color: #fff;
  -webkit-mask-image: linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.55) 35%, #000 50%, rgba(0,0,0,.55) 65%, rgba(0,0,0,.55) 100%);
  mask-image: linear-gradient(90deg, rgba(0,0,0,.55) 0%, rgba(0,0,0,.55) 35%, #000 50%, rgba(0,0,0,.55) 65%, rgba(0,0,0,.55) 100%);
  -webkit-mask-size: 250% 100%; mask-size: 250% 100%;
  animation: pc-t-in .32s cubic-bezier(.2, .8, .3, 1) both, pc-shimmer 1.8s linear infinite; }
@keyframes pc-shimmer { from { -webkit-mask-position: 100% 0; mask-position: 100% 0 } to { -webkit-mask-position: -150% 0; mask-position: -150% 0 } }
.pc-island .pc-said { color: #fff; }
.pc-island .pc-detail { display: none; color: rgba(255,255,255,.48); font-size: 11px; line-height: 15px; margin-top: 2px; white-space: pre-wrap; overflow-wrap: anywhere; }
.pc-island .is-open .pc-detail.has { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
/* Without the seat (no plushie) the progress shows as a bar. */
.pc-island .pc-pbar { display: none; height: 3px; margin-top: 6px; border-radius: 2px; background: rgba(255,255,255,.14); overflow: hidden; }
.pc-bare .pc-island .is-open .pc-pbar.has { display: block; }
.pc-island .pc-pbar > i { display: block; height: 100%; width: calc(var(--p, 0) * 100%); border-radius: inherit; background: var(--pc); transition: width .45s cubic-bezier(.3, .8, .3, 1); }
`;

export function islandDesign(styles: StyleRoot): Design {
  injectStyle('island', CSS, styles);
  const root = el('div', 'pc-island');
  const part = el('div', 'pc-part', root);
  svg(
    '<svg width="20" height="24" viewBox="0 0 20 24"><path d="M3 2 L3 19.2 L7.5 15.2 L10.4 21.8 L13.5 20.4 L10.7 14 L16.8 14 Z" fill="#17171c" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>',
    'pc-arrive',
    part,
  );
  const body = el('div', 'pc-body', root);
  const cap = el('div', 'pc-cap', body);
  const box = el('div', 'pc-box', cap);
  const inner = el('div', 'pc-inner', box);
  const seat = el('div', 'pc-seat', inner);
  const ring = svg(
    `<svg viewBox="0 0 ${SEAT + 10} ${SEAT + 10}"><circle class="pc-track" cx="${SEAT / 2 + 5}" cy="${SEAT / 2 + 5}" r="${RING_R}"/><circle class="pc-arc" cx="${SEAT / 2 + 5}" cy="${SEAT / 2 + 5}" r="${RING_R}"/></svg>`,
    'pc-ring',
    seat,
  );
  const arc = ring.querySelector<SVGCircleElement>('.pc-arc')!;
  const plushHost = el('div', 'pc-plush', seat);
  const col = el('div', 'pc-col', inner);
  const head = el('div', 'pc-head', col);
  const name = el('span', 'pc-name', head);
  const chip = el('span', 'pc-chip', head);
  const line = el('div', 'pc-line', col);
  const detail = el('div', 'pc-detail', col);
  const pbar = el('div', 'pc-pbar', col);
  const pfill = el('i', '', pbar);

  return {
    kind: 'island',
    root,
    body,
    plushHost,
    anchor: {x: 13, y: 21},
    motion: {tip: 15, body: 17, damping: 0.72, bob: 0, hop: 0, leash: 22},
    vertical: 1,
    room: () => ({x: 13 + box.offsetWidth + 8, y: 21 + box.offsetHeight + 8, up: 4}),
    render(view: CursorView) {
      const s = view.status;
      const note = view.said ?? view.done;
      const message = note ?? s?.text ?? null;
      const busy = !note && !!s && s.busy !== false;
      const p = !note ? s?.progress : null;
      seat.classList.toggle('is-progress', p != null);
      seat.classList.toggle('is-spin', busy && p == null);
      seat.classList.toggle('is-finished', !!view.done);
      if (p != null) arc.style.strokeDashoffset = (RING * (1 - Math.max(0, Math.min(1, p)))).toFixed(2);
      else arc.style.strokeDashoffset = '';
      morph(box, () => {
        box.classList.toggle('is-open', message !== null);
        box.classList.toggle('is-busy', busy);
        name.textContent = view.name;
        const st = !note ? s?.step : undefined;
        chip.classList.toggle('has', !!st || !!view.done);
        chip.classList.toggle('is-done', !!view.done);
        if (view.done) chip.innerHTML = CHECK_ICON;
        else chip.textContent = st ? `${st[0]}/${st[1]}` : '';
        if (message !== null) swapText(line, view.said ? `“${message}”` : message);
        else clearText(line);
        line.classList.toggle('pc-said', !!view.said);
        const d = !note ? s?.detail ?? '' : '';
        detail.textContent = d;
        detail.classList.toggle('has', !!d);
        pbar.classList.toggle('has', p != null);
        if (p != null) pfill.style.setProperty('--p', String(Math.max(0, Math.min(1, p))));
      });
    },
    dispose: () => root.remove(),
  };
}
