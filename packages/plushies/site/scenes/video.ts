/** A video editor: an HTML stage and a timeline drawn on a canvas, so helpers glow on both. */
import {fromCanvas, paintHighlight} from '@plushies/cursors';
import {$, $$, htmlTask, inflate, other, rand, type Scene, type Task, type Worker} from './kit';

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
  requestAnimationFrame(drawTimeline);
  const w = view.width;
  const h = view.height;
  // Another use case is showing: nothing to draw.
  if (!w || !h) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
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
}
requestAnimationFrame(drawTimeline);

const clipGlow = (clip: Clip) => (h: Worker) => {
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

export const video: Scene = {
  id: 'video',
  label: 'Video editor',
  note: 'A video editor: an HTML slide above a timeline drawn on a canvas, so the helpers point at and glow on both.',
  tasks: [
    htmlTask('#headline', {
      text: 'Rewriting the headline',
      steps: ['Reading the brief', 'Trying a few options', 'Checking it fits on two lines'],
      finish: 'Headline is punchier',
      apply: () => {
        const el = $('#headline');
        el.textContent = other(headlines, el.textContent);
      },
    }),
    htmlTask('#subtitle', {
      text: 'Fixing a typo',
      steps: ['“stiched” → “stitched”'],
      finish: 'Typo fixed',
      apply: () => {
        const el = $('#subtitle');
        el.textContent = el.textContent!.includes('stiched') ? 'Every plushie is hand-stitched from recycled felt.' : 'Every plushie is hand-stiched from recycled felt.';
      },
    }),
    htmlTask('#chart', {
      text: 'Animating the bars',
      steps: ['Loading Q3 numbers', 'Easing each bar in', 'Staggering by 80 ms'],
      finish: 'Bars now grow in',
      apply: () => {
        for (const bar of $$('#chart i')) bar.style.setProperty('--h', rand(0.25, 0.95).toFixed(2));
      },
    }),
    htmlTask('#cta', {
      text: 'Trying a warmer button colour',
      steps: ['Checking contrast', 'Pressing it to test'],
      finish: 'Button recoloured',
      click: true,
      apply: () => {
        const el = $('#cta');
        el.style.background = other(ctaColors, el.style.background);
      },
    }),
    htmlTask('#logo', {
      text: 'Nudging the logo onto the grid',
      steps: ['Measuring margins'],
      finish: 'Logo aligned',
      click: true,
      apply: () => {
        logoTurn += 360;
        $('#logo').style.transform = `rotate(${logoTurn}deg)`;
      },
    }),
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
  ],
};
