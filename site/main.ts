import * as THREE from 'three';
import {createPlushieCursor, fromCanvas, paintHighlight, type CursorDesign, type Highlight, type PlushieCursor, type Target} from '../src/index';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

const workspace = $('#workspace');

// ---------------------------------------------------------------------------
// The canvas timeline: clips drawn on a <canvas>, glowing where a helper works.

const canvas = $<HTMLCanvasElement>('#timeline');
const ctx = canvas.getContext('2d')!;
interface Clip {
  track: number;
  start: number;
  length: number;
  color: string;
  label: string;
}
const clips: Clip[] = [
  {track: 0, start: 0, length: 3.2, color: '#7c3aed', label: 'Intro'},
  {track: 0, start: 3.4, length: 4.1, color: '#5b8def', label: 'Headline'},
  {track: 0, start: 7.7, length: 3.6, color: '#3e9b7a', label: 'Chart'},
  {track: 1, start: 0.6, length: 5.2, color: '#f47c9a', label: 'Voice-over'},
  {track: 1, start: 6.2, length: 4.4, color: '#f2b33d', label: 'Music'},
];
const SECONDS = 12;
const view = {
  get width() {
    return canvas.clientWidth;
  },
  get height() {
    return canvas.clientHeight;
  },
};
/** A clip's box in the canvas's CSS pixels (what the drawing below uses too). */
const clipBox = (clip: Clip) => {
  const left = 64;
  const scale = (view.width - left - 14) / SECONDS;
  return {x: left + clip.start * scale, y: 16 + clip.track * 46, width: clip.length * scale, height: 36};
};
const canvasGlows = new Map<Clip, {color: string; busy: boolean}>();

function drawTimeline(now: number) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = view.width;
  const h = view.height;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  ctx.font = '600 11px Inter, sans-serif';
  ctx.textBaseline = 'middle';
  ['Video', 'Audio'].forEach((name, i) => {
    ctx.fillStyle = dark ? '#a59a90' : '#7d7064';
    ctx.fillText(name, 14, 34 + i * 46);
  });
  for (const clip of clips) {
    const b = clipBox(clip);
    ctx.fillStyle = clip.color;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.width, b.height, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.fillText(clip.label, b.x + 10, b.y + b.height / 2);
  }
  // The glow, painted into the canvas by the app (paintHighlight).
  for (const [clip, glow] of canvasGlows) paintHighlight(ctx, inflate(clipBox(clip), 3), glow.color, {busy: glow.busy, now, radius: 9});
  const t = ((now / 1000) % SECONDS) / SECONDS;
  const x = 64 + t * (w - 78);
  ctx.fillStyle = dark ? '#f1ece6' : '#241c16';
  ctx.fillRect(x - 1, 6, 2, h - 12);
  requestAnimationFrame(drawTimeline);
}
const inflate = (b: {x: number; y: number; width: number; height: number}, d: number) => ({x: b.x - d, y: b.y - d, width: b.width + 2 * d, height: b.height + 2 * d});
requestAnimationFrame(drawTimeline);

// ---------------------------------------------------------------------------
// The helpers.

interface Helper {
  name: string;
  color: string;
  mixed: CursorDesign;
  cursor: PlushieCursor;
  manual: boolean;
  busyWith: string | null;
}

const LOOKS = [
  {name: 'Pip', color: '#f5c518', mixed: 'live' as const, look: {kind: 'star', color: '#f5c518', eyes: 'happy', mouth: 'grin', cheeks: true, hat: 'cap'} as const},
  {name: 'Biscuit', color: '#f47c9a', mixed: 'buddy' as const, look: {kind: 'heart', color: '#f47c9a', eyes: 'oval', mouth: 'smile', cheeks: true, glasses: 'round'} as const},
  {name: 'Moss', color: '#6fbf8e', mixed: 'island' as const, look: {kind: 'cloud', color: '#8fd19e', fabric: 'fleece', eyes: 'dot', mouth: 'smile', hat: 'beanie', hatColor: '#1f5f5b'} as const},
];

const start = [
  [0.18, 0.2],
  [0.5, 0.75],
  [0.8, 0.3],
];
const helpers: Helper[] = LOOKS.map((h, i) => ({
  name: h.name,
  color: h.color,
  mixed: h.mixed,
  manual: false,
  busyWith: null,
  cursor: createPlushieCursor(THREE, {
    name: h.name,
    look: h.look,
    color: h.color,
    container: workspace,
    design: 'live',
    x: workspace.clientWidth * start[i][0],
    y: workspace.clientHeight * start[i][1],
  }),
}));

// ---------------------------------------------------------------------------
// Tasks: an HTML element or a canvas clip, a few steps, a change at the end.

interface Task {
  id: string;
  text: string;
  steps: string[];
  finish: string;
  click?: boolean;
  target: () => Target;
  glow: (h: Helper) => {clear(delay?: number): void};
  apply: () => void;
}

const htmlGlow = (element: Element) => (h: Helper) => h.cursor.highlight(element) as Highlight;
const clipGlow = (clip: Clip) => (h: Helper) => {
  canvasGlows.set(clip, {color: h.color, busy: true});
  return {
    clear(delay = 0) {
      setTimeout(() => canvasGlows.delete(clip), delay * 1000);
    },
  };
};
const clipTarget = (clip: Clip) => () => fromCanvas(canvas, () => inflate(clipBox(clip), 3), view);

const headlines = ['Soft things, made to last.', 'Hug-tested. Kid-approved.', 'Stuffed with care.', 'Made for squeezing.'];
const ctaColors = ['#f5c518', '#f47c9a', '#8fd19e', '#7cc4f4'];
let logoTurn = 0;

const TASKS: Task[] = [
  {
    id: 'headline',
    text: 'Rewriting the headline',
    steps: ['Reading the brief', 'Trying a few options', 'Checking it fits on two lines'],
    finish: 'Headline is punchier',
    target: () => $('#headline'),
    glow: htmlGlow($('#headline')),
    apply: () => {
      const el = $('#headline');
      el.textContent = pick(headlines.filter(t => t !== el.textContent));
    },
  },
  {
    id: 'subtitle',
    text: 'Fixing a typo',
    steps: ['“stiched” → “stitched”'],
    finish: 'Typo fixed',
    target: () => $('#subtitle'),
    glow: htmlGlow($('#subtitle')),
    apply: () => {
      const el = $('#subtitle');
      el.textContent = el.textContent!.includes('stiched') ? 'Every plushie is hand-stitched from recycled felt.' : 'Every plushie is hand-stiched from recycled felt.';
    },
  },
  {
    id: 'chart',
    text: 'Animating the bars',
    steps: ['Loading Q3 numbers', 'Easing each bar in', 'Staggering by 80 ms'],
    finish: 'Bars now grow in',
    target: () => $('#chart'),
    glow: htmlGlow($('#chart')),
    apply: () => {
      for (const bar of document.querySelectorAll<HTMLElement>('#chart i')) bar.style.setProperty('--h', rand(0.25, 0.95).toFixed(2));
    },
  },
  {
    id: 'cta',
    text: 'Trying a warmer button colour',
    steps: ['Checking contrast', 'Pressing it to test'],
    finish: 'Button recoloured',
    click: true,
    target: () => $('#cta'),
    glow: htmlGlow($('#cta')),
    apply: () => {
      const el = $('#cta');
      el.style.background = pick(ctaColors.filter(c => c !== el.style.background));
    },
  },
  {
    id: 'logo',
    text: 'Nudging the logo onto the grid',
    steps: ['Measuring margins'],
    finish: 'Logo aligned',
    click: true,
    target: () => $('#logo'),
    glow: htmlGlow($('#logo')),
    apply: () => {
      logoTurn += 360;
      $('#logo').style.transform = `rotate(${logoTurn}deg)`;
    },
  },
  ...clips.map(
    (clip): Task => ({
      id: `clip-${clip.label}`,
      text: clip.track ? `Levelling the ${clip.label.toLowerCase()}` : `Trimming “${clip.label}” to the beat`,
      steps: clip.track ? ['Measuring loudness', 'Ducking under the voice'] : ['Finding the downbeat', 'Trimming 0.4 s'],
      finish: clip.track ? `${clip.label} at −14 LUFS` : `${clip.label} on the beat`,
      click: !clip.track,
      target: clipTarget(clip),
      glow: clipGlow(clip),
      apply: () => {
        if (!clip.track) clip.length = Math.max(2.4, Math.min(4.4, clip.length + rand(-0.5, 0.5)));
      },
    }),
  ),
];

const QUIPS = ['Ooh, nice colours!', 'Hmm…', 'On it!', 'Back in a sec', 'This is fun', '✨'];

let paused = false;
const claimed = new Set<string>();

async function waitWhileHeld(h: Helper) {
  while (paused || h.manual) await sleep(250);
}

async function run(h: Helper, delay: number) {
  await sleep(delay);
  for (;;) {
    await waitWhileHeld(h);
    const free = TASKS.filter(t => !claimed.has(t.id));
    const task = pick(free);
    claimed.add(task.id);
    h.busyWith = task.id;
    try {
      await h.cursor.pointAt(task.target());
      await sleep(250);
      const glow = task.glow(h);
      h.cursor.status({text: task.text, progress: 0, step: [1, task.steps.length], detail: task.steps[0]});
      for (let i = 0; i < task.steps.length; i++) {
        h.cursor.status({text: task.text, progress: i / task.steps.length, step: [i + 1, task.steps.length], detail: task.steps[i]});
        const ticks = 3;
        for (let k = 1; k <= ticks; k++) {
          await sleep(rand(350, 650));
          await waitWhileHeld(h);
          h.cursor.progress((i + k / ticks) / task.steps.length, [i + 1, task.steps.length]);
        }
      }
      if (task.click) await h.cursor.click();
      task.apply();
      await h.cursor.done(task.finish);
      glow.clear(0.8);
    } finally {
      claimed.delete(task.id);
      h.busyWith = null;
    }
    await sleep(rand(900, 1700));
    if (Math.random() < 0.35 && !h.manual) {
      const r = workspace.getBoundingClientRect();
      await h.cursor.moveTo(rand(0.1, 0.9) * r.width, rand(0.1, 0.9) * r.height);
      if (Math.random() < 0.6) h.cursor.say(pick(QUIPS));
      await sleep(rand(700, 1400));
    }
  }
}
helpers.forEach((h, i) => void run(h, 600 + i * 900));

// ---------------------------------------------------------------------------
// Controls.

const designButtons = [...document.querySelectorAll<HTMLButtonElement>('#designs button')];
const setDesign = (design: string) => {
  for (const b of designButtons) b.setAttribute('aria-checked', String(b.dataset.design === design));
  for (const h of helpers) h.cursor.setDesign(design === 'mixed' ? h.mixed : (design as CursorDesign));
  history.replaceState(null, '', `?design=${design}`);
};
for (const b of designButtons) b.addEventListener('click', () => setDesign(b.dataset.design!));
const initial = new URLSearchParams(location.search).get('design');
if (initial) setDesign(initial);

$('#pause').addEventListener('click', event => {
  paused = !paused;
  (event.currentTarget as HTMLButtonElement).textContent = paused ? 'Play' : 'Pause';
});

// Plushies are optional: without them it's just the pointer and its label.
const plushies = $<HTMLInputElement>('#plushies');
plushies.addEventListener('change', () => {
  for (const h of helpers) h.cursor.setPlushie(plushies.checked);
});

// Pip follows the mouse: offset a little, so it's beside your pointer rather than on it.
const follow = $<HTMLInputElement>('#follow');
const onMove = (event: PointerEvent) => {
  const r = workspace.getBoundingClientRect();
  void helpers[0].cursor.moveTo(event.clientX - r.left + 26, event.clientY - r.top + 22);
};
follow.addEventListener('change', () => {
  helpers[0].manual = follow.checked;
  if (follow.checked) {
    helpers[0].cursor.release();
    helpers[0].cursor.status(null);
    workspace.addEventListener('pointermove', onMove);
  } else workspace.removeEventListener('pointermove', onMove);
});

// Playground.
const who = $<HTMLSelectElement>('#who');
helpers.forEach((h, i) => who.add(new Option(h.name, String(i))));
// Per cursor: this helper alone with or without its plushie.
const ownPlushie = $<HTMLInputElement>('#own-plushie');
who.addEventListener('change', () => (ownPlushie.checked = !!helpers[Number(who.value)].cursor.element.querySelector('canvas')));
ownPlushie.addEventListener('change', () => helpers[Number(who.value)].cursor.setPlushie(ownPlushie.checked));
const held = () => {
  const h = helpers[Number(who.value)];
  h.manual = true;
  return h.cursor;
};
const progress = $<HTMLInputElement>('#progress');
progress.addEventListener('input', () => {
  $('#pv').textContent = `${progress.value}%`;
  held().progress(Number(progress.value) / 100);
});
$('#b-status').addEventListener('click', () =>
  held().status({text: $<HTMLInputElement>('#text').value, detail: $<HTMLInputElement>('#detail').value || undefined, progress: Number(progress.value) / 100}),
);
$('#b-clear').addEventListener('click', () => held().status(null));
$('#b-say').addEventListener('click', () => held().say(`Hi! I'm ${helpers[Number(who.value)].name} 👋`));
$('#b-click').addEventListener('click', () => void held().click());
$('#b-done').addEventListener('click', () => void held().done('All done'));
$('#b-resume').addEventListener('click', () => {
  for (const h of helpers) {
    if (h === helpers[0] && follow.checked) continue;
    h.manual = false;
  }
});

Object.assign(window, {helpers});
