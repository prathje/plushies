/**
 * The opener: three plushies at work as AI-helper cursors (@plushies/cursors)
 * in a mock app. A "Use case" switch picks the app, a "Design" switch the
 * cursor design, and "Follow me" has one of them trail your pointer around
 * the whole page.
 */
import * as THREE from 'three';
import {createPlushieCursor, type CursorDesign, type PlushieCursor} from '@plushies/cursors';
import {design} from './scenes/design';
import {doc} from './scenes/doc';
import {$, pick, rand, sleep, type Scene, type Task, type Worker} from './scenes/kit';
import {pipeline} from './scenes/pipeline';
import {sheet} from './scenes/sheet';
import {video} from './scenes/video';
import {website} from './scenes/website';

const workspace = $('#workspace');

// ---------------------------------------------------------------------------
// The use cases: one mock app each, in the same workspace. One shows at a time
// and the helpers work its tasks.

const SCENES: Scene[] = [video, design, website, sheet, doc, pipeline];
let scene = SCENES[0];

// ---------------------------------------------------------------------------
// The helpers.

interface Helper extends Worker {
  name: string;
  color: string;
  mixed: CursorDesign;
  cursor: PlushieCursor;
  /** Driven by you (playground or "follow me"): its script waits. */
  manual: boolean;
  /** Taken over in the playground (until Resume), whatever "follow me" does. */
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

// The cursors live on the page (not in the workspace), so a helper that
// follows you can leave the mock app and come along to the gallery and the
// editor. Positions are page pixels; the helpers' own spots are in the
// workspace's part of the page.

/** A point in the workspace, by fractions of its width and height, in page pixels. */
function inWorkspace(fx: number, fy: number) {
  const r = workspace.getBoundingClientRect();
  return {x: r.left + scrollX + fx * r.width, y: r.top + scrollY + fy * r.height};
}

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
    container: document.body,
    // Over the page, under the sticky nav.
    zIndex: 10,
    design: 'live',
    ...inWorkspace(start[i][0], start[i][1]),
  }),
}));

// ---------------------------------------------------------------------------
// The script: each helper picks a free task of the current use case, works it
// and changes the page at the end.

const QUIPS = ['Ooh, nice colours!', 'Hmm…', 'On it!', 'Back in a sec', 'This is fun', '✨'];

let paused = false;
const claimed = new Set<string>();
/** Thrown (and swallowed by run) when a helper's script is interrupted. */
const ABORT = Symbol('abort');

async function waitWhileHeld(h: Helper) {
  while (paused || h.manual) await sleep(250);
}

/** Where the cursor's tip is now, in viewport pixels. */
function tipOf(h: Helper) {
  const tip = h.cursor.element.getBoundingClientRect();
  return {x: tip.left, y: tip.top};
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
    void h.cursor.moveTo(x + scrollX, y + scrollY);
  }
}

// Picking: keep helpers apart, so their boxes don't cover each other or the
// clips they work on. One helper on the canvas at a time, and only targets
// well away from where the others are working (or being driven).
const rectOf = (t: Task) => t.rect?.() ?? (t.target() as Element).getBoundingClientRect();
const centreOf = (r: {x: number; y: number; width: number; height: number}) => ({x: r.x + r.width / 2, y: r.y + r.height / 2});
const onCanvas = (t: Task) => !!t.rect;

function pickTask(h: Helper): Task | null {
  const free = scene.tasks.filter(t => !claimed.has(t.id));
  if (!free.length) return null;
  const others = helpers.filter(o => o !== h);
  const busyOnCanvas = others.some(o => o.job && onCanvas(o.job.task));
  // Others' spots (viewport pixels): what they work on, or where you're driving them.
  const spots = others.flatMap(o => {
    if (o.job) return [centreOf(rectOf(o.job.task))];
    if (o.manual) return [tipOf(o)];
    return [];
  });
  // About a status box's width: closer than this and the boxes collide.
  const room = 260;
  const scored = free.map(t => {
    const c = centreOf(rectOf(t));
    const near = spots.reduce((m, s) => Math.min(m, Math.hypot(c.x - s.x, c.y - s.y)), Infinity);
    return {t, near: busyOnCanvas && onCanvas(t) ? 0 : near};
  });
  const apart = scored.filter(s => s.near >= room);
  // Nothing far enough (a narrow screen, everyone busy): wait for a gap
  // rather than pile on top of someone.
  return apart.length ? pick(apart).t : null;
}

/** Wander to a random spot in the workspace. */
function wander(h: Helper) {
  const {x, y} = inWorkspace(rand(0.1, 0.9), rand(0.15, 0.85));
  return h.cursor.moveTo(x, y);
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
    await wander(h);
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

/** You drive this helper now: its script stops mid-step and lets go of its task. */
const takeOver = (h: Helper) => {
  if (h.manual) return;
  h.manual = true;
  interrupt(h, true);
};

// Follow me: one helper trails your pointer, a little offset so it's beside
// it rather than on it, anywhere on the page. Scrolling moves it too, so it
// stays beside the pointer rather than scrolling away with the page.
let follower: Helper | null = null;
let pointer: {x: number; y: number} | null = null;
const trail = () => {
  if (!follower || !pointer) return;
  void follower.cursor.moveTo(pointer.x + scrollX + 26, pointer.y + scrollY + 22);
};
window.addEventListener(
  'pointermove',
  event => {
    pointer = {x: event.clientX, y: event.clientY};
    trail();
  },
  {passive: true},
);
window.addEventListener('scroll', trail, {passive: true});

// The helpers' own spots are in the workspace: when it scrolls out of view
// they hide (and stop animating); the one following you stays.
let workspaceInView = true;
const showHelpers = () => {
  for (const h of helpers) h.cursor.show(workspaceInView || h === follower);
};
new IntersectionObserver(
  entries => {
    workspaceInView = entries[entries.length - 1].isIntersecting;
    showHelpers();
  },
  {rootMargin: '160px'},
).observe(workspace);

/** Remember a choice in the URL (keeping the editor's share params), so a reload or a shared link comes back to it. */
let ready = false;
const remember = (key: string, value: string) => {
  if (!ready) return;
  const params = new URLSearchParams(location.search);
  params.set(key, value);
  history.replaceState(null, '', `?${params}${location.hash}`);
};

/** A radiogroup of buttons: one tab stop, arrows move the selection, `attr` names the value. */
function radiogroup(group: HTMLElement, attr: string, onPick: (value: string) => void) {
  const buttons = [...group.querySelectorAll<HTMLButtonElement>('button')];
  const select = (value: string) => {
    for (const b of buttons) {
      const on = b.dataset[attr] === value;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    }
    onPick(value);
  };
  for (const b of buttons) b.addEventListener('click', () => select(b.dataset[attr]!));
  group.addEventListener('keydown', event => {
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const n = buttons.length;
    const next = {ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1}[event.key];
    if (next === undefined) return;
    event.preventDefault();
    const b = buttons[(next + n) % n];
    select(b.dataset[attr]!);
    b.focus();
  });
  return {select, has: (value: string | null) => buttons.some(b => b.dataset[attr] === value)};
}

const params = new URLSearchParams(location.search);

// The design: all helpers at once, or each in its own ("mixed").
const designs = radiogroup($('#designs'), 'design', design => {
  for (const h of helpers) h.cursor.setDesign(design === 'mixed' ? h.mixed : (design as CursorDesign));
  remember('design', design);
});

// The use case: show its mock app, and the helpers drop what they were doing
// and scatter into it to pick up its tasks.
const scenes = radiogroup($('#scenes'), 'scene', id => {
  const next = SCENES.find(s => s.id === id)!;
  const change = ready && next !== scene;
  scene = next;
  for (const s of SCENES) $(`.scene[data-scene="${s.id}"]`).hidden = s !== next;
  workspace.setAttribute('aria-label', next.note);
  $('#scene-note').textContent = next.note;
  remember('scene', id);
  if (!change) return;
  for (const h of helpers) {
    if (h.manual) continue;
    interrupt(h, false);
    void wander(h);
  }
});

// Follow me: the chosen helper comes along; the one before goes back to its
// script (unless the playground has it).
const follows = radiogroup($('#follow'), 'follow', name => {
  const next = helpers.find(h => h.name === name) ?? null;
  if (next === follower) return;
  const before = follower;
  follower = next;
  if (before && !before.played) before.manual = false;
  if (next) {
    takeOver(next);
    next.cursor.say(pick(['Right behind you!', 'Lead the way!', 'Where to?']));
    trail();
  }
  showHelpers();
});

// Start where the URL says, else live + video; only picks made here go into the URL.
const initialDesign = params.get('design');
const initialScene = params.get('scene');
designs.select(designs.has(initialDesign) ? initialDesign! : 'live');
scenes.select(scenes.has(initialScene) ? initialScene! : SCENES[0].id);
ready = true;

// Pause stops the scripts mid-step: the cursors stop where they are and drop
// what they were doing (a "done" message too). Play lets each script pick a
// fresh task; helpers you drive stay yours.
const pauseButton = $('#pause');
pauseButton.addEventListener('click', () => {
  paused = !paused;
  pauseButton.setAttribute('aria-pressed', String(paused));
  pauseButton.textContent = paused ? 'Play' : 'Pause';
  if (paused) for (const h of helpers) if (!h.manual) interrupt(h, true);
});

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
// The site's range tracks fill up to --p.
const showProgress = () => {
  progress.style.setProperty('--p', `${progress.value}%`);
  $('#pv').textContent = `${progress.value}%`;
};
showProgress();
progress.addEventListener('input', () => {
  showProgress();
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
    if (h !== follower) h.manual = false;
  }
});

Object.assign(window, {helpers, scenes: SCENES, follows});
