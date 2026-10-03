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
  const theme = document.documentElement.dataset.theme;
  const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
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
  /** Driven by you (playground or "follows me"): its script waits. */
  manual: boolean;
  /** Taken over in the playground (until Resume), whatever "follows me" does. */
  played: boolean;
  /** Whether it floats a plushie (mirrors setPlushie). */
  plushie: boolean;
  /** Bumped to abort whatever the script is doing with this helper. */
  epoch: number;
  /** The task in hand: its claim and its glow, undone on abort. */
  job: {task: Task; glow: {clear(delay?: number): void} | null} | null;
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
  played: false,
  plushie: true,
  epoch: 0,
  job: null,
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
  /** Where the work happens, in viewport pixels (to keep helpers apart). */
  rect?: () => {x: number; y: number; width: number; height: number};
}

const htmlGlow = (element: Element) => (h: Helper) => h.cursor.highlight(element) as Highlight;
const clipGlow = (clip: Clip) => (h: Helper) => {
  const glow = {color: h.color, busy: true};
  canvasGlows.set(clip, glow);
  return {
    clear(delay = 0) {
      // Only this glow: someone else may have picked the clip up since.
      setTimeout(() => canvasGlows.get(clip) === glow && canvasGlows.delete(clip), delay * 1000);
    },
  };
};
const clipTarget = (clip: Clip) => () => fromCanvas(canvas, () => inflate(clipBox(clip), 3), view);
const clipRect = (clip: Clip) => () => {
  const r = canvas.getBoundingClientRect();
  const b = clipBox(clip);
  return {x: r.left + b.x, y: r.top + b.y, width: b.width, height: b.height};
};

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
      rect: clipRect(clip),
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
/** Thrown (and swallowed by run) when a helper's script is interrupted. */
const ABORT = Symbol('abort');

async function waitWhileHeld(h: Helper) {
  while (paused || h.manual) await sleep(250);
}

/** Where the cursor's tip is now, in workspace pixels (its padding box). */
function tipOf(h: Helper) {
  const tip = h.cursor.element.getBoundingClientRect();
  const r = workspace.getBoundingClientRect();
  return {x: tip.left - r.left - workspace.clientLeft, y: tip.top - r.top - workspace.clientTop};
}

/** Give up the task in hand: unclaim it, drop its glow and the script's status. */
function dropJob(h: Helper) {
  const job = h.job;
  if (!job) return;
  h.job = null;
  claimed.delete(job.task.id);
  job.glow?.clear(0);
  h.cursor.status(null);
}

/**
 * Stop the script's current step right now (pause, or you take the helper
 * over): the awaiting run sees a new epoch and bails, the task is released,
 * and with `freeze` the cursor stops where it is instead of finishing its move.
 */
function interrupt(h: Helper, freeze: boolean) {
  h.epoch++;
  dropJob(h);
  // Also a finished task's "done" message, still up after its job ended.
  h.cursor.status(null);
  h.cursor.release();
  if (freeze) {
    const {x, y} = tipOf(h);
    void h.cursor.moveTo(x, y);
  }
}

// Picking: keep helpers apart, so their boxes don't cover each other or the
// clips they work on. One helper on the timeline at a time, and only targets
// well away from where the others are working (or being driven).
const rectOf = (t: Task) => t.rect?.() ?? (t.target() as Element).getBoundingClientRect();
const centreOf = (r: {x: number; y: number; width: number; height: number}) => ({x: r.x + r.width / 2, y: r.y + r.height / 2});
const onTimeline = (t: Task) => !!t.rect;

function pickTask(h: Helper): Task | null {
  const free = TASKS.filter(t => !claimed.has(t.id));
  if (!free.length) return null;
  const others = helpers.filter(o => o !== h);
  const busyOnTimeline = others.some(o => o.job && onTimeline(o.job.task));
  // Others' spots: what they work on, or where you're driving them.
  const ws = workspace.getBoundingClientRect();
  const spots = others.flatMap(o => {
    if (o.job) return [centreOf(rectOf(o.job.task))];
    if (o.manual) {
      const p = tipOf(o);
      return [{x: ws.left + workspace.clientLeft + p.x, y: ws.top + workspace.clientTop + p.y}];
    }
    return [];
  });
  // About a status box's width: closer than this and the boxes collide.
  const room = 260;
  const scored = free.map(t => {
    const c = centreOf(rectOf(t));
    const near = spots.reduce((m, s) => Math.min(m, Math.hypot(c.x - s.x, c.y - s.y)), Infinity);
    return {t, near: busyOnTimeline && onTimeline(t) ? 0 : near};
  });
  const apart = scored.filter(s => s.near >= room);
  // Nothing far enough (a narrow screen, everyone busy): wait for a gap
  // rather than pile on top of someone.
  return apart.length ? pick(apart).t : null;
}

async function work(h: Helper, check: () => void) {
  const task = pickTask(h);
  if (!task) return sleep(rand(600, 1200));
  const job: NonNullable<Helper['job']> = {task, glow: null};
  claimed.add(task.id);
  h.job = job;
  let finished = false;
  try {
    await h.cursor.pointAt(task.target());
    check();
    await sleep(250);
    check();
    job.glow = task.glow(h);
    for (let i = 0; i < task.steps.length; i++) {
      h.cursor.status({text: task.text, progress: i / task.steps.length, step: [i + 1, task.steps.length], detail: task.steps[i]});
      const ticks = 3;
      for (let k = 1; k <= ticks; k++) {
        await sleep(rand(350, 650));
        check();
        h.cursor.progress((i + k / ticks) / task.steps.length, [i + 1, task.steps.length]);
      }
    }
    if (task.click) {
      await h.cursor.click();
      check();
    }
    task.apply();
    await h.cursor.done(task.finish);
    check();
    job.glow.clear(0.8);
    job.glow = null;
    finished = true;
  } finally {
    if (h.job === job) {
      if (finished) {
        h.job = null;
        claimed.delete(task.id);
      } else dropJob(h);
    }
  }
  await sleep(rand(900, 1700));
  check();
  if (Math.random() < 0.35) {
    const r = workspace.getBoundingClientRect();
    await h.cursor.moveTo(rand(0.1, 0.9) * r.width, rand(0.1, 0.9) * r.height);
    check();
    if (Math.random() < 0.6) h.cursor.say(pick(QUIPS));
    await sleep(rand(700, 1400));
  }
}

async function run(h: Helper, delay: number) {
  await sleep(delay);
  for (;;) {
    await waitWhileHeld(h);
    const epoch = h.epoch;
    // After every await: still ours to drive? (Pause and takeover bump the epoch.)
    const check = () => {
      if (h.epoch !== epoch || paused || h.manual) throw ABORT;
    };
    try {
      await work(h, check);
    } catch (error) {
      if (error !== ABORT) throw error;
    }
  }
}
helpers.forEach((h, i) => void run(h, 600 + i * 900));

// ---------------------------------------------------------------------------
// Controls.

// The design radiogroup: one tab stop, arrows move the selection.
const designGroup = $('#designs');
const designButtons = [...designGroup.querySelectorAll<HTMLButtonElement>('button')];
const setDesign = (design: string, remember = true) => {
  for (const b of designButtons) {
    const on = b.dataset.design === design;
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
  }
  for (const h of helpers) h.cursor.setDesign(design === 'mixed' ? h.mixed : (design as CursorDesign));
  if (remember) history.replaceState(null, '', `?design=${design}`);
};
for (const b of designButtons) b.addEventListener('click', () => setDesign(b.dataset.design!));
designGroup.addEventListener('keydown', event => {
  const i = designButtons.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  const n = designButtons.length;
  const next = {ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1}[event.key];
  if (next === undefined) return;
  event.preventDefault();
  const b = designButtons[(next + n) % n];
  setDesign(b.dataset.design!);
  b.focus();
});
const initial = new URLSearchParams(location.search).get('design');
setDesign(designButtons.some(b => b.dataset.design === initial) ? initial! : 'live', !!initial);

// Pause stops the scripts mid-step: the cursors stop where they are and drop
// what they were doing (a "done" message too). Play lets each script pick a
// fresh task; helpers you drive stay yours.
const pauseButton = $('#pause');
pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.setAttribute('aria-pressed', String(paused));
  if (paused) for (const h of helpers) if (!h.manual) interrupt(h, true);
});

/** You drive this helper now: its script stops mid-step and lets go of its task. */
const takeOver = (h: Helper) => {
  if (h.manual) return;
  h.manual = true;
  interrupt(h, true);
};

// Plushies are optional, per cursor. The global box is on when all are,
// mixed (indeterminate) when only some are; the playground's box shows the
// chosen helper's own.
const plushies = $<HTMLInputElement>('#plushies');
const who = $<HTMLSelectElement>('#who');
const ownPlushie = $<HTMLInputElement>('#own-plushie');
const chosen = () => helpers[Number(who.value)];
const setPlushie = (h: Helper, on: boolean) => {
  h.plushie = on;
  h.cursor.setPlushie(on);
};
const syncPlushieBoxes = () => {
  const on = helpers.filter(h => h.plushie).length;
  plushies.checked = on === helpers.length;
  plushies.indeterminate = on > 0 && on < helpers.length;
  ownPlushie.checked = chosen().plushie;
};
plushies.addEventListener('change', () => {
  for (const h of helpers) setPlushie(h, plushies.checked);
  syncPlushieBoxes();
});

// Pip follows the mouse: offset a little, so it's beside your pointer rather than on it.
const follow = $<HTMLInputElement>('#follow');
const onMove = (event: PointerEvent) => {
  const r = workspace.getBoundingClientRect();
  void helpers[0].cursor.moveTo(event.clientX - r.left + 26, event.clientY - r.top + 22);
};
follow.addEventListener('change', () => {
  if (follow.checked) {
    takeOver(helpers[0]);
    helpers[0].cursor.status(null);
    workspace.addEventListener('pointermove', onMove);
  } else {
    workspace.removeEventListener('pointermove', onMove);
    // Back to its script, unless the playground has it.
    if (!helpers[0].played) helpers[0].manual = false;
  }
});

// Playground.
helpers.forEach((h, i) => who.add(new Option(h.name, String(i))));
who.addEventListener('change', syncPlushieBoxes);
ownPlushie.addEventListener('change', () => {
  setPlushie(chosen(), ownPlushie.checked);
  syncPlushieBoxes();
});
const held = () => {
  const h = chosen();
  takeOver(h);
  h.played = true;
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
$('#b-say').addEventListener('click', () => held().say(`Hi! I'm ${chosen().name} 👋`));
$('#b-click').addEventListener('click', () => void held().click());
$('#b-done').addEventListener('click', () => void held().done('All done'));
$('#b-resume').addEventListener('click', () => {
  for (const h of helpers) {
    h.played = false;
    if (h === helpers[0] && follow.checked) continue;
    h.manual = false;
  }
});

Object.assign(window, {helpers});
