/** A node-based render pipeline: nodes on a grid, wires between their ports, a render to babysit. */
import {$, $$, htmlTask, other, rand, type Scene} from './kit';

const pipe = $('#pipe');
const svg = $<SVGSVGElement>('#pipe-wires');
const state = {viaMix: true};

/** Which ports are wired: audio goes through the mix node, or straight to the encoder. */
const edges = () => [
  ['#n-src .out', '#n-grade .in'],
  ['#n-grade .out', '#n-caps .in'],
  ['#n-caps .out', '#n-encode .in.a'],
  ...(state.viaMix ? [['#n-audio .out', '#n-mix .in'], ['#n-mix .out', '#n-encode .in.b']] : [['#n-audio .out', '#n-encode .in.b']]),
  ['#n-encode .out', '#n-out .in'],
];

function draw() {
  const root = pipe.getBoundingClientRect();
  if (!root.width) return;
  svg.innerHTML = edges()
    .map(([from, to]) => {
      const a = $(from).getBoundingClientRect();
      const b = $(to).getBoundingClientRect();
      const x1 = a.left + a.width / 2 - root.left;
      const y1 = a.top + a.height / 2 - root.top;
      const x2 = b.left + b.width / 2 - root.left;
      const y2 = b.top + b.height / 2 - root.top;
      const dx = Math.max(40, (x2 - x1) / 2);
      const color = getComputedStyle($(from).parentElement!).getPropertyValue('--c');
      return `<path d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}" style="--c:${color}"/>`;
    })
    .join('');
  $('#n-mix').classList.toggle('off', !state.viaMix);
}
const sizes = new ResizeObserver(draw);
sizes.observe(pipe);
for (const node of $$('.node', pipe)) sizes.observe(node);
draw();

const encodes = ['H.265 · 1080p · 12 Mb/s', 'H.265 · 2160p · 45 Mb/s', 'AV1 · 2160p · 30 Mb/s'];
const captions = ['Burn-in · en', 'Burn-in · en, de', 'Sidecar · en, de, fr'];

export const pipeline: Scene = {
  id: 'pipeline',
  label: 'Render pipeline',
  note: 'A node-based render pipeline: the helpers tune nodes, rewire the audio path, change the encode and babysit a preview render.',
  tasks: [
    htmlTask('#n-grade', {
      text: 'Warming the colour grade',
      steps: ['Sampling skin tones', 'Nudging the warmth'],
      finish: 'Grade warmed',
      apply: () => {
        const warmth = Math.round(rand(0, 30));
        $('#pipe-warmth').textContent = `+${warmth}`;
        $('#pipe-warmth-bar').style.setProperty('--p', `${Math.round((warmth / 30) * 100)}%`);
      },
    }),
    htmlTask('#n-mix', {
      text: 'Rewiring the audio',
      steps: ['Checking the mix node', 'Reconnecting the wire'],
      finish: 'Audio rewired',
      apply: () => {
        state.viaMix = !state.viaMix;
        draw();
      },
    }),
    htmlTask('#n-encode', {
      text: 'Changing the encode settings',
      steps: ['Checking the source is 4K', 'Raising the bitrate'],
      finish: 'Encode settings updated',
      click: true,
      apply: () => {
        const el = $('#pipe-encode');
        el.textContent = other(encodes, el.textContent);
      },
    }),
    htmlTask('#n-caps', {
      text: 'Updating the caption languages',
      steps: ['Translating to German', 'Timing the lines'],
      finish: 'Captions updated',
      apply: () => {
        const el = $('#pipe-caps');
        el.textContent = other(captions, el.textContent);
      },
    }),
    htmlTask('#n-src', {
      text: 'Trimming the source',
      steps: ['Finding the first downbeat', 'Setting in and out points'],
      finish: 'Source trimmed',
      apply: () => {
        const a = Math.round(rand(0, 4));
        const b = Math.round(rand(10, 16));
        $('#pipe-src').textContent = `intro.mp4 · 00:0${a} – 00:${String(b).padStart(2, '0')}`;
      },
    }),
    htmlTask('#n-out', {
      text: 'Rendering a preview',
      steps: ['Warming the encoder', 'Rendering 12 s', 'Checking the first frame'],
      finish: 'Preview rendered',
      click: true,
      apply: () => {
        const bar = $('#pipe-render');
        bar.style.transition = 'none';
        bar.style.setProperty('--p', '0%');
        void bar.offsetWidth;
        bar.style.transition = 'width 1.6s ease';
        bar.style.setProperty('--p', '100%');
        $('#pipe-out').textContent = `Preview · 12 s · ${Math.round(rand(38, 56))} MB`;
      },
    }),
  ],
};
