import pkg from '../package.json';
import {lookDiff, poseDiff, type EditorState} from './schema';

/** The published version, so the CDN URLs match it: a range like `@0.1` doesn't match a prerelease. */
export const VERSION: string = pkg.version;
export const CDN = `https://cdn.jsdelivr.net/npm/plushies@${VERSION}/dist`;
export const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js';

export type Flavor = 'npm' | 'cdn' | 'three';
export const FLAVORS: {id: Flavor; label: string; lang: 'js' | 'html'}[] = [
  {id: 'npm', label: 'npm + three', lang: 'js'},
  {id: 'cdn', label: 'Script tag', lang: 'html'},
  {id: 'three', label: 'Your three.js scene', lang: 'js'},
];

const literal = (value: string | number | boolean) =>
  typeof value === 'string' ? `'${value}'` : typeof value === 'number' ? String(Math.round(value * 1000) / 1000) : String(value);

function objectLiteral(entries: [string, string | number | boolean][], indent: string): string {
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, v]) => `${indent}  ${k}: ${literal(v)},`).join('\n')}\n${indent}}`;
}

/** The code that reproduces the editor's plushie. */
export function snippet(flavor: Flavor, state: EditorState): string {
  const look = lookDiff(state.look);
  const pose = poseDiff(state.pose);
  const viewerExtras: [string, boolean][] = [];
  if (state.idle) viewerExtras.push(['idle', true]);
  if (state.follow) viewerExtras.push(['followPointer', true]);

  if (flavor === 'npm') {
    return `import * as THREE from 'three';
import {mountPlushie} from 'plushies/viewer';

// The container needs a size; the canvas fills it.
const view = mountPlushie(document.querySelector('#plushie'), THREE, ${objectLiteral([...look, ...pose, ...viewerExtras], '')});

view.canvas.addEventListener('click', () => view.hop());`;
  }
  if (flavor === 'cdn') {
    return `<div id="plushie" style="width: 360px; height: 360px"></div>

<!-- three.js is bundled in: nothing else to load -->
<script src="${CDN}/plushies.global.js"></script>
<script>
  const view = Plushies.mountPlushie(document.getElementById('plushie'), ${objectLiteral([...look, ...pose, ...viewerExtras], '  ')});
  view.canvas.addEventListener('click', () => view.hop());
</script>`;
  }
  return `import * as THREE from 'three';
import {createPlushie} from 'plushies';

const plush = createPlushie(THREE, ${objectLiteral([...look, ['renderer', '§renderer'] as [string, string]], '')});

// Laid out in pixels (fits width × height, y up): scale it into your world.
const world = new THREE.Group();
world.scale.setScalar(1 / 100);
world.add(plush.object);
scene.add(world);

// Every frame, or whenever something changes:
plush.set(${objectLiteral([['width', 600], ['height', 600], ...pose], '')});`.replace("'§renderer'", 'renderer');
}

// ---------------------------------------------------------------------------
// A tiny highlighter: enough for the snippets on this page.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const JS = new RegExp(
  [
    String.raw`(?<com>\/\/[^\n]*|\/\*[\s\S]*?\*\/)`,
    String.raw`(?<str>'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|\x60(?:\\.|[^\x60\\])*\x60)`,
    String.raw`(?<kw>\b(?:import|from|export|const|let|new|await|async|function|return|true|false|if|else)\b)`,
    String.raw`(?<num>\b\d+(?:\.\d+)?\b)`,
    String.raw`(?<key>\b[A-Za-z_$][\w$]*(?=\s*:))`,
    String.raw`(?<fn>\b[A-Za-z_$][\w$]*(?=\s*\())`,
  ].join('|'),
  'g',
);

function highlightJs(code: string): string {
  let out = '';
  let last = 0;
  for (const m of code.matchAll(JS)) {
    out += escape(code.slice(last, m.index));
    const kind = Object.entries(m.groups!).find(([, v]) => v !== undefined)![0];
    out += `<span class="tok-${kind}">${escape(m[0])}</span>`;
    last = m.index! + m[0].length;
  }
  return out + escape(code.slice(last));
}

function highlightHtml(code: string): string {
  // Script bodies are JS; everything else gets tags, attributes and comments.
  return code
    .split(/(<script[^>]*>[\s\S]*?<\/script>)/)
    .map(part => {
      const script = /^(<script[^>]*>)([\s\S]*?)(<\/script>)$/.exec(part);
      if (script) return markup(script[1]) + highlightJs(script[2]) + markup(script[3]);
      return markup(part);
    })
    .join('');
}

function markup(s: string): string {
  return s.replace(/(<!--[\s\S]*?-->)|(<\/?[\w-]+)([^>]*?)(\/?>)|([^<]+)/g, (_, com, open, attrs, close, text) => {
    if (com) return `<span class="tok-com">${escape(com)}</span>`;
    if (text) return escape(text);
    const a = escape(attrs).replace(/([\w-]+)(=)(&quot;|")([^"]*)(")/g, '<span class="tok-key">$1</span>$2<span class="tok-str">"$4"</span>');
    return `<span class="tok-kw">${escape(open)}</span>${a}<span class="tok-kw">${escape(close)}</span>`;
  });
}

export function highlight(code: string, lang: 'js' | 'html' | 'sh'): string {
  if (lang === 'html') return highlightHtml(code);
  if (lang === 'sh') return escape(code).replace(/^(\$ )?/gm, m => (m ? `<span class="tok-com">${m}</span>` : ''));
  return highlightJs(code);
}
