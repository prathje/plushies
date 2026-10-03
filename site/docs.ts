import {CDN, THREE_CDN, highlight} from './code';
import {GROUPS, resolveDefault, type Field} from './schema';
import {copyText, tabs} from './ui';

type Lang = 'js' | 'html' | 'sh';

const INSTALL: {id: string; label: string; intro: string; blocks: [Lang, string][]}[] = [
  {
    id: 'npm',
    label: 'npm',
    intro: 'Your app already uses three.js (or will). plushies takes your copy of three as an argument, so there is only ever one on the page.',
    blocks: [
      ['sh', 'npm i plushies three'],
      [
        'js',
        `import * as THREE from 'three';
import {mountPlushie} from 'plushies/viewer';

const view = mountPlushie(document.querySelector('#hero'), THREE, {
  kind: 'star',
  color: '#ffb35c',
  hat: 'party',
  idle: true,
  followPointer: true,
});`,
      ],
    ],
  },
  {
    id: 'script',
    label: 'Script tag',
    intro: 'No build step and no three.js of your own: the global build has three bundled in and puts everything on window.Plushies. (CDN links work once the package is published to npm.)',
    blocks: [
      [
        'html',
        `<div id="hero" style="width: 360px; height: 360px"></div>
<script src="${CDN}/plushies.global.js"></script>
<script>
  const view = Plushies.mountPlushie(document.getElementById('hero'), {
    kind: 'heart',
    color: '#f47c9a',
    idle: true,
  });
</script>`,
      ],
    ],
  },
  {
    id: 'esm',
    label: 'ES modules',
    intro: 'Modules straight from a CDN (once the package is published to npm). Map three yourself and use the small build, or import the bundled one that brings its own three.',
    blocks: [
      [
        'html',
        `<script type="importmap">
  {"imports": {"three": "${THREE_CDN}"}}
</script>
<script type="module">
  import * as THREE from 'three';
  import {mountPlushie} from '${CDN}/viewer.js';
  mountPlushie(document.querySelector('#hero'), THREE, {kind: 'cloud'});
</script>`,
      ],
      [
        'js',
        `// …or with three bundled in (no import map needed):
import {mountPlushie} from '${CDN}/plushies.bundled.js';
mountPlushie(document.querySelector('#hero'), {kind: 'cloud'});`,
      ],
    ],
  },
];

const VIEWER_API: [string, string][] = [
  ['mountPlushie(el, THREE, options)', 'Fill <code>el</code> with a transparent canvas and a plushie. Give the element a size. Renders only while something moves; all viewers share one WebGL context.'],
  ['view.set(pose)', 'Set pose fields right away: <code>lookX</code>, <code>blink</code>, <code>squash</code>, <code>color</code>…'],
  ['view.to(pose, seconds, ease)', 'Tween numeric pose fields. Resolves when done.'],
  ['view.look(x, y)', 'Point the eyes, −1..1 each.'],
  ['view.hop(height) · view.squish() · view.blink()', 'Little performances with anticipation and settle. All return promises. <code>hop()</code> jumps as high as fits the container: a fifth of its height, at most 90 px.'],
  ['view.stop()', 'Halt everything where it is: tweens, hop/squish/blink and the current idle gesture. Their promises resolve; the idle loop resumes after its pause.'],
  ['view.restyle(options)', 'Change the look in place (new shape, fabric, hat…), keeping the pose. Merged into the current look: pass <code>undefined</code> to reset an option. Fur length resets to the new fabric\'s unless given.'],
  ['view.options', 'The current look: the mount options merged with every <code>restyle</code>.'],
  ['view.setIdle(on) · view.setFollowPointer(on)', 'Turn the idle loop and pointer-following on or off. Off-screen viewers pause rendering.'],
  ['view.dispose()', 'Remove the canvas and free the GPU. Pending promises resolve; safe to call twice.'],
  ['createPlushie(THREE, options)', 'Just the object, for your own scene: <code>{object, pose, set, dispose}</code>.'],
  ['plushieOutline(kind, options)', 'The flat silhouette as points — handy for icons.'],
];

function codeBlock(lang: Lang, code: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'code-wrap';
  wrap.innerHTML = `<pre class="code" tabindex="0" data-lang="${lang === 'sh' ? 'shell' : lang}"><code>${highlight(code, lang)}</code></pre>`;
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'copy-btn code-copy';
  copy.textContent = 'Copy';
  copy.addEventListener('click', () => copyText(copy, code));
  wrap.append(copy);
  return wrap;
}

const describe = (field: Field) => {
  if (field.type === 'choice' || field.type === 'shape') return field.options.map(o => `<code>${o}</code>`).join(' ');
  if (field.type === 'range') return `${field.min} … ${field.max}`;
  if (field.type === 'toggle') return 'true / false';
  return 'CSS colour';
};
const defaultText = (field: Field) => {
  if (typeof field.default === 'function') return '<span class="muted">auto</span>';
  const d = resolveDefault(field, {});
  return `<code>${typeof d === 'string' && field.type !== 'color' ? `'${d}'` : d}</code>`;
};

export function renderDocs(root: HTMLElement) {
  // Install tabs.
  const install = document.createElement('div');
  install.className = 'doc-card';
  const list = document.createElement('div');
  list.className = 'tabs';
  const panel = document.createElement('div');
  panel.className = 'tab-panel';
  install.append(list, panel);
  tabs(list, INSTALL, id => {
    const item = INSTALL.find(i => i.id === id)!;
    panel.replaceChildren(Object.assign(document.createElement('p'), {textContent: item.intro}), ...item.blocks.map(([lang, code]) => codeBlock(lang, code)));
  });

  const sizes = document.createElement('div');
  sizes.className = 'callout';
  sizes.innerHTML = `<p><strong>three external or bundled?</strong> The core is about <strong>22 kB</strong> gzipped and uses the three.js you pass in (r160 or newer). The bundled builds (<code>plushies/bundled</code>, <code>plushies.global.js</code>) carry their own three and weigh about <strong>200 kB</strong> gzipped. If your page already has three, use the small one — two copies of three don't mix.</p>`;

  const scene = document.createElement('div');
  scene.className = 'doc-card';
  scene.innerHTML = `<h3>In your own three.js scene</h3><p>The plushie is laid out in pixels (it fits a <code>width × height</code> box, centred, y up), so scale it into your world. Pass your renderer so the beads and glasses get studio reflections; pass <code>lights: false</code> to light it yourself.</p>`;
  scene.append(
    codeBlock(
      'js',
      `import * as THREE from 'three';
import {createPlushie} from 'plushies';

const plush = createPlushie(THREE, {kind: 'ghost', fabric: 'felt', finish: 'felt', renderer});
const world = new THREE.Group();
world.scale.setScalar(1 / 100);
world.add(plush.object);
scene.add(world);

renderer.setAnimationLoop(time => {
  plush.set({lookX: Math.sin(time / 900), squash: Math.sin(time / 300) * 0.15});
  renderer.render(scene, camera);
});`,
    ),
  );

  const api = document.createElement('div');
  api.className = 'doc-card';
  api.innerHTML = `<h3>API at a glance</h3><dl class="api">${VIEWER_API.map(([sig, text]) => `<dt><code>${sig}</code></dt><dd>${text}</dd>`).join('')}</dl>`;

  const options = document.createElement('div');
  options.className = 'doc-card';
  options.innerHTML = `<h3>Every option</h3><p>Look options are fixed when the plushie is built (<code>restyle</code> to change them); pose fields are cheap to set every frame. Colours take any CSS colour (hex, names, <code>rgb()</code>/<code>hsl()</code>, <code>oklch()</code>…). An invalid value warns once in the console and falls back to its default.</p>
    <div class="table-wrap"><table class="options">
      <thead><tr><th>option</th><th>values</th><th>default</th><th>what it does</th></tr></thead>
      <tbody>${GROUPS.map(
        g => `<tr class="options-group"><th colspan="4">${g.title}${g.id === 'pose' ? ' <span class="muted">(pose)</span>' : ''}</th></tr>` +
          g.fields.map(f => `<tr><td><code>${f.key}</code></td><td>${describe(f)}</td><td>${defaultText(f)}</td><td>${f.doc}</td></tr>`).join(''),
      ).join('')}</tbody>
    </table></div>`;

  root.append(install, sizes, scene, api, options);
}
