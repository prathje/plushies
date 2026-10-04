# Plushies: cute and stuffed AI helpers

Soft 3D plush characters for the web, and floating cursors that let AI helpers work *visibly* inside your app. A plushie glides to the thing it is changing, says what it is doing, shows its progress, and hops when it is done.

**[▶ Live demo and editor](https://prathje.github.io/plushies/)** · [`plushies` on npm](https://www.npmjs.com/package/plushies) · [`@plushies/cursors` on npm](https://www.npmjs.com/package/@plushies/cursors) · [MIT licensed](LICENSE)

> **Alpha / proof of concept.** This is an early, exploratory release. APIs will change, edges are rough, and nothing here is production-hardened yet. Feedback and issues are very welcome.
>
> **Built with AI agents.** This version was developed with heavy support from AI coding agents (Claude Code), from the fur shader to the e2e tests. Treat it as a PoC of what that workflow produces, not as a reference implementation.

## Demo

Three plushie helpers at work in a video editor, a design file, a website and a document. The GIF is an excerpt: **[watch the full demo video](https://github.com/user-attachments/assets/dfabee43-7ea4-497a-9c52-6a3e59263173)** (also in [`docs/plushies-demo.mp4`](docs/plushies-demo.mp4)), or play with the live version at **[prathje.github.io/plushies](https://prathje.github.io/plushies/)**.

<p align="center">
  <a href="https://github.com/user-attachments/assets/dfabee43-7ea4-497a-9c52-6a3e59263173">
    <img src="docs/plushies-demo.gif" alt="Three plushie helpers, Pip, Moss and Biscuit, working in a mock video editor and a design file: each floats next to the element it is editing with a status bubble and a progress bar." width="800" />
  </a>
</p>

## What is in the box

| package | npm | |
|---|---|---|
| [`packages/plushies`](packages/plushies) | `plushies` | The characters: 17 silhouettes inflated into stuffed pillows, shell-textured fur, floating eyes, glasses, hats, squash & stretch, and a drop-in viewer for [three.js](https://threejs.org). |
| [`packages/cursors`](packages/cursors) | `@plushies/cursors` | Floating cursors for AI helpers: a plushie with its own pointer, name tag, live status box, progress and highlights. Three designs (`live`, `buddy`, `island`). |

Both are published separately. `@plushies/cursors` depends on `plushies`; use it with your own copy of three.js, or drop three.js entirely for pointer-only cursors.

## Use cases

- **Agents that work in your editor.** Show an AI helper editing a document, a design file, a spreadsheet, a timeline or a node graph. The cursor points at the element being changed, glows it, narrates the step, and the user keeps their own mouse.
- **Multi-agent dashboards.** Several helpers with distinct names and colours work at once; cursors keep their labels off each other and stay on screen when their target scrolls away.
- **Collaborative editing.** Treat agents as peers in a live document, with the same presence cursors humans get, just cuter (see [implementation ideas](#implementation-ideas) below).
- **Mascots and empty states.** Mount a single plushie as a hero, a loading state or an easter egg: it blinks, breathes, follows the pointer and hops on click.
- **Your own three.js scene.** `createPlushie` gives you a plain `THREE.Object3D` whose pose (look direction, blink, squash, lean, turn) is a set of numbers you drive every frame.

## How to use

### A plushie cursor for an AI helper

```sh
npm i @plushies/cursors plushies three
```

```ts
import * as THREE from 'three';
import {createPlushieCursor} from '@plushies/cursors';

const editor = document.querySelector<HTMLElement>('#editor')!;
const headline = document.querySelector('#headline')!;

const pip = createPlushieCursor(THREE, {
  name: 'Pip',
  look: {kind: 'star', color: '#f5c518', eyes: 'happy', hat: 'cap'},
  design: 'live', // 'live' | 'buddy' | 'island'
  container: editor,
});

await pip.pointAt(headline);             // glide there and keep following it as it moves
const glow = pip.highlight(headline);    // the "working on this" mark
pip.status({text: 'Rewriting the headline', detail: 'Trying a few options', progress: 0.3, step: [1, 3]});
pip.progress(0.8);
await pip.click();
await pip.done('Headline is punchier');
glow.clear(0.8);
```

Targets can be DOM elements, boxes in container pixels, functions returning a box every frame, or shapes on a `<canvas>` via `fromCanvas`. The full API (designs, options, highlights, canvas targets, accessibility, performance) is in the [cursors README](packages/cursors/README.md).

### A plushie on its own

```sh
npm i plushies three
```

```html
<div id="hero" style="width: 360px; height: 360px"></div>
<script type="module">
  import * as THREE from 'three';
  import {mountPlushie} from 'plushies/viewer';

  const view = mountPlushie(document.querySelector('#hero'), THREE, {
    kind: 'heart',
    color: '#f47c9a',
    mouth: 'smile',
    glasses: 'round',
    idle: true,          // blink, breathe, glance around
    followPointer: true, // eyes follow the mouse
  });
  view.canvas.addEventListener('click', () => view.hop());
</script>
```

No bundler? `dist/plushies.global.js` exposes `window.Plushies` with three.js bundled in. Every look option (kinds, fabrics, eyes, hats, pins, colours), the per-frame pose and the three.js integration are in the [plushies README](packages/plushies/README.md). The [workbench on the site](https://prathje.github.io/plushies/) lets you configure a plushie and copy the code.

### Develop

```sh
bun install          # once, here at the root
bun run typecheck    # both packages
bun run test         # unit tests of both
bun run build        # dist/ of both
bun run site:build   # the GitHub Pages site: the cursor demo and the plushie workbench, one page
bun run test:e2e     # browser tests of both (Playwright; build and site:build first)
bun run vendor       # refresh the engine's vendored copy: ../engine/assets/vendor/plushies.js
```

The site is one page in `packages/plushies/site`: the cursor demo (three helpers in six kinds of app, with a design switch and one helper that follows you), then the gallery, the workbench and the docs. While developing, run `bun run site:dev` in `packages/plushies` and open <http://localhost:4517>.

## Implementation ideas

The cursors are deliberately dumb: they only know *where to point* and *what to say*. Wiring them to a real agent is up to your app. Some shapes that fit well:

- **Tiptap + Hocuspocus (Yjs).** In a [Tiptap](https://tiptap.dev) editor synced through [Hocuspocus](https://tiptap.dev/docs/hocuspocus), an agent can join the document as one more Yjs peer. It writes its edits into the shared `Y.Doc` and publishes its selection, name and status through the awareness protocol, exactly like a human collaborator. On the client, map the awareness state to a cursor: resolve the agent's selection to a DOM node with `view.domAtPos()` or to coordinates with `view.coordsAtPos()`, hand that to `cursor.pointAt(...)`, and feed the status text to `cursor.status(...)`. The plushie then replaces the plain collaboration-cursor label.
- **A plain WebSocket channel.** For apps without CRDT state, stream agent events (`{agent, target, status, progress}`) from your backend over a WebSocket. The client keeps one cursor per agent, resolves `target` to an element or canvas box, and calls `pointAt`, `highlight`, `status`, `progress` and `done` as events arrive. The demo's scenes in `packages/plushies/site/scenes/` are small scripts of exactly these calls, so they double as a reference for the event vocabulary.
- **Tool-call hooks.** If your agent runs through a tool-use loop (edit a cell, rename a layer, move a clip), emit a cursor event before and after each tool call: point and glow before, `done` after. That gives a faithful, low-effort trace of what the model actually touched.

## License

[MIT](LICENSE) © 2026 Patrick Rathje. Use it in anything, commercial or not, and keep the notice.
