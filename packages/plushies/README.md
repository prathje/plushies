# plushies

Soft 3D plush characters for [three.js](https://threejs.org). A flat silhouette
(circle, heart, star, … 17 kinds) is inflated into a stuffed pillow with a
rolled seam and covered in real shell-textured fur. Eyes, mouth, moustache,
glasses, hats (top hat to fez to halo), pins and neckwear float in front of the
body as separate pieces. Everything that
moves — eye direction, blink, squash & stretch, hop, lean, turn — is a plain
number you can set every frame.

**Demo and editor:** run `bun install` at the repo root, then `bun run site:dev` in `packages/plushies`, and open
<http://localhost:4517>. The page opens with the [cursor demo](../cursors) (three plushie helpers at work) and goes on to the gallery and the workbench: configure a plushie and copy the code.

## Install

Three builds, depending on what your page already has:

| you have | use | size (gzip) |
|---|---|---|
| a bundler and three.js | `plushies` / `plushies/viewer` (three is a peer dependency) | ~26 kB (`index.js` ~22 + `viewer.js` ~4.5) |
| a bundler, no three.js | `plushies/bundled` (three included) | ~210 kB |
| a plain HTML page | `dist/plushies.global.js` → `window.Plushies` (three included) | ~210 kB |

Sizes are gzip of the files in `dist/` (what a CDN serves). Only use one copy
of three per page: if your app already imports three, or anything in it will,
use the small build and pass your copy in. `plushies/bundled` is for pages that
never load three themselves; in a bundled app it is the second copy.

```sh
npm i plushies three
npm i -D @types/three   # TypeScript: the types for `import * as THREE from 'three'`
```

### From a CDN, without a build step

The global build, three included, on `window.Plushies`:

```html
<div id="hero" style="width: 360px; height: 360px"></div>
<script src="https://cdn.jsdelivr.net/npm/plushies@0.1.0-alpha.1/dist/plushies.global.js"></script>
<script>
  Plushies.mountPlushie(document.getElementById('hero'), {kind: 'heart', idle: true});
</script>
```

Pin the exact version as above: this is a prerelease, so a range like `@0.1`
does not match it. The unversioned `https://cdn.jsdelivr.net/npm/plushies/dist/plushies.global.js`
gives the latest release (unpkg works the same way).

The ES modules, with your own three, need an import map for the bare
specifiers; map `three`, `plushies` and `plushies/viewer` to the files in
`dist/` and the page's `<script type="module">` reads like a bundled one:

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
      "plushies": "https://cdn.jsdelivr.net/npm/plushies@0.1.0-alpha.1/dist/index.js",
      "plushies/viewer": "https://cdn.jsdelivr.net/npm/plushies@0.1.0-alpha.1/dist/viewer.js"
    }
  }
</script>
<div id="hero" style="width: 360px; height: 360px"></div>
<script type="module">
  import * as THREE from 'three';
  import {mountPlushie} from 'plushies/viewer';

  const view = mountPlushie(document.querySelector('#hero'), THREE, {kind: 'cloud', idle: true});
</script>
```

Use the plain `dist/` URLs, not jsDelivr's `/+esm` rewrites: those bundle the
core into `index.js` and `viewer.js` separately, so the two entries stop
sharing their state. (esm.sh resolves the package's own imports and works too.)

`plushies/bundled` is the single-URL module route, no import map and no three
of your own:

```js
import {mountPlushie} from 'https://cdn.jsdelivr.net/npm/plushies@0.1.0-alpha.1/dist/plushies.bundled.js';
mountPlushie(document.querySelector('#hero'), {kind: 'cloud', idle: true});
```

`plushies/bundled` and the global build also export `THREE`, the copy of
three they carry (`Plushies.THREE` on the global): pass it to anything that
wants your three module, like `createPlushie` for your own scene or
`createPlushieCursor(Plushies.THREE, …)` from [`@plushies/cursors`](../cursors).

### Module formats

Everything is ESM. Only the root entry (`plushies`) also has a CommonJS build
(`dist/plushies.cjs`); `plushies/viewer` and `plushies/bundled` are ESM-only.
All three entries have a `default` export condition, so Node 22's
`require(esm)` loads them in CommonJS code too (Jest, ts-node, a `.cjs`
config). Importing the package has no side effects (nothing touches the DOM
until you call something), so the imports are fine in code that also runs on a
server; see [React and SSR](#react-and-ssr).

## Drop-in viewer

```html
<div id="hero" style="width: 360px; height: 360px"></div>
```

```ts
import * as THREE from 'three';
import {mountPlushie} from 'plushies/viewer';

const view = mountPlushie(document.querySelector<HTMLElement>('#hero')!, THREE, {
  kind: 'heart',
  color: '#f47c9a',
  mouth: 'smile',
  glasses: 'round',
  idle: true,          // blink, breathe, glance around
  followPointer: true, // eyes follow the mouse
});
view.canvas.addEventListener('click', () => view.hop());
```

The canvas is transparent and fills its container. The viewer only renders
while something changes, and stops painting while it is scrolled off-screen
(tweens keep running, so their promises still resolve; it repaints when it
scrolls back in). Every viewer on the page draws through one shared,
hidden WebGL context, so you can mount dozens without hitting the browser's
limit of about 16 contexts.

`mountPlushie` needs a browser: called where `document` is not defined (a
server render, a test without a DOM) it throws
`plushies: mountPlushie needs a browser (document is not defined). Call it after mount, e.g. in a 'use client' component's effect.`

The options (`ViewerOptions`) are every [look option](#options-the-look),
the viewer's own, and any initial [pose](#pose-per-frame) field except the
size ones (`color`, `fur`, `lookX`, `squash`, …):

| viewer option | | default |
|---|---|---|
| `idle` | blink, breathe and glance around on its own | false |
| `followPointer` | the eyes follow the mouse anywhere on the page | false |
| `maxPixelRatio` | cap for the device pixel ratio the canvas renders at | 2 |
| `quality` | `'auto'`, `'full'` or `'low'`. `'low'` caps the pixel ratio at 1, draws at most 6 fur shells and turns antialiasing off; `'auto'` is `'low'` when the browser only has software WebGL (see [Performance](#performance)) | 'auto' |

| method | |
|---|---|
| `view.set(pose)` | set pose fields right away |
| `view.to(pose, seconds, ease)` | tween numeric pose fields; resolves when done. `ease` is any `(t) => number`; `easeIn`, `easeOut` and `easeInOut` are exported from `plushies/viewer` (the default is `easeInOut`) |
| `view.look(x, y)` · `view.blink()` · `view.hop(height)` · `view.squish(amount)` | little performances, all promises; `hop()` defaults to a height that fits the container: min(90, 20% of its height) px |
| `view.stop()` | halt everything where it is: running tweens, `hop`/`squish`/`blink` sequences and the idle loop's current gesture. All their promises resolve; the idle loop, if on, carries on after its next pause (use `setIdle(false)` to end it) |
| `view.restyle(options)` | change the look in place, keeping the pose; it builds a new plushie. `options` is **merged** into the current look (pass `undefined` to reset a key); only the fur length resets, to the new fabric's, unless you give `fur` |
| `view.options` | the current look: the mount options merged with every `restyle`, typed `Readonly<ViewerLook & Partial<Pick<PlushiePose, 'color' \| 'fur'>>>` (so `view.options.color` type-checks) |
| `view.plushie` | the current `Plushie` (`object`, `pose`, `set`), replaced by every `restyle` |
| `view.canvas` | the canvas element |
| `view.setIdle(on)` · `view.setFollowPointer(on)` | toggle the idle loop / pointer following |
| `view.dispose()` | remove the canvas and free its GPU resources (the shared context goes with the last viewer); pending promises resolve, and calling it twice is fine |

With `plushies/bundled` or the global build, drop the `THREE` argument:
`mountPlushie(element, options)` / `createPlushie(options)`.

Types, from `plushies/viewer`: `ViewerOptions` (what `mountPlushie` takes),
`ViewerLook` (the look without `renderer`: what `restyle` takes and
`view.options` holds), `PlushieViewer` (what it returns) and `Easing`. From
`plushies`: `PlushieOptions`, `PlushiePose`, `Plushie` and `ThreeModule` (the
type of `import * as THREE from 'three'`). A look you share between plushies
and pass to `mountPlushie` is a `ViewerOptions`, not a `PlushieOptions`: the
latter has no `color` (that is a pose field).

### React and SSR

Mount in an effect, after the element exists, and dispose in its cleanup:

```tsx
'use client'; // Next.js App Router: this is all it takes

import {useEffect, useRef} from 'react';
import * as THREE from 'three';
import {mountPlushie, type ViewerOptions} from 'plushies/viewer';

export function Hero({look}: {look: ViewerOptions}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const view = mountPlushie(box.current!, THREE, {...look, idle: true});
    return () => view.dispose();
  }, []); // mount once; apply prop changes with restyle, below
  return <div ref={box} style={{width: 360, height: 360}} />;
}
```

StrictMode's mount, dispose, mount in development is safe and cheap: the
shared WebGL context survives it. For prop changes, keep the viewer in a ref
and call `view.restyle(look)` (and `set`/`to` for pose) in a second effect
rather than remounting. In Next.js a `'use client'` component is enough;
`next/dynamic` with `ssr: false` is not needed, and importing `plushies`,
`plushies/viewer` or `plushies/bundled` in a server component (for the
constants and types) is fine. What must not run on the server is the
`mountPlushie` / `createPlushie` call itself (see the error above).

## In your own three.js scene

```ts
import * as THREE from 'three';
import {createPlushie} from 'plushies';

const plush = createPlushie(THREE, {kind: 'star', fabric: 'felt', finish: 'felt', hat: 'party', renderer});
// The object is laid out in pixels (fits width × height, centred, y up):
const world = new THREE.Group();
world.scale.setScalar(1 / 100);
world.add(plush.object);
scene.add(world);

// every frame, or whenever something changes:
plush.set({lookX: 0.5, blink: 0, squash: 0.2, width: 600, height: 600});
```

`createPlushie` never imports `three` itself — you pass your copy of the module,
so it works with any build from r160 on. It does need a browser, though: the
face, fabric and accessory textures are painted on a 2D `<canvas>`, so without
`document` (a server render, a Node render farm with headless-gl) it throws a
named error like `mountPlushie`'s, saying so. Call it after mount.

Pass `renderer` so beads, glasses and the crown get their studio reflections
(a small environment map baked once per renderer; `resetEnvironment(renderer)`
forgets it, for after a lost and restored WebGL context). Pass `lights: false`
to light it yourself (the fur is lit by its own built-in rig either way).
`plush.dispose()` frees its geometries, materials and textures.

Also exported: `DEFAULT_OPTIONS`, `DEFAULT_POSE`, the `PLUSHIE_*` value lists
and `ACCESSORY_COLORS`, `fabricFur(fabric)` and `fabricGrain(fabric)` (a
fabric preset's default fur length and strand size), `MAX_FUR_SHELLS` (16, the
most shells `furShells` can ask for) and `plushieOutline(kind, options)` (the
flat silhouette as points, e.g. for icons).

## Options (the look)

| option | values | default |
|---|---|---|
| `kind` | circle, square, triangle, heart, star, pill, cloud, polygon, blob, egg, drop, ghost, bean, flower, diamond, squircle, arch | circle |
| `roundness` | 0..1 corner softness | 0.6 |
| `sides` | corners of `polygon`, points of `star`, petals of `flower` | 6 / 5 / 6 |
| `starInner` | star inner radius 0.2..0.9 | 0.55 |
| `seed` | shape of `blob` | 1 |
| `thickness` | stuffing, relative to half-width | 0.42 |
| `fabric` | plush, felt, velvet, shaggy, fleece | plush |
| `furGrain` | strand size, replacing the fabric's own (smaller is finer, denser fur) | from fabric: plush 1, felt 0.8, velvet 0.9, shaggy 1.7, fleece 2.8 |
| `furShells` | most fur shells drawn, 3..16; fewer is cheaper and flatter (the viewer's `quality: 'low'` caps it at 6) | 16 |
| `finish` | surface of eyes, mouth, moustache, glasses, neckwear, pins: gloss, satin, matte, felt | satin |
| `eyes` | dot, oval, googly, ring, happy, sleepy, none | dot |
| `eyeSize`, `eyeSpacing` | multipliers | 1 |
| `faceY` | face up (+) / down (−) | 0 |
| `mouth` | none, smile, grin, open, flat, cat | none |
| `cheeks` | boolean | false |
| `moustache` | none, curly, walrus, pencil | none |
| `glasses` | none, round, square, monocle, shades | none |
| `hat` | none, top, beanie, party, crown, cowboy, cap, hardhat, fireman, santa, graduation, fez, halo — worn on a tip when the top has a dip (heart) | none |
| `hatSize` | multiplier | 1 |
| `neck` | none, bowtie, necktie (`bowtie: true` is shorthand) | none |
| `pin` | none, flower, bow, heart (on the head), star, badge (on the chest) | none |
| `featureColor`, `moustacheColor`, `glassesColor`, `hatColor`, `neckColor` (`bowtieColor` is its older name), `pinColor`, `accentColor`, `cheekColor` | CSS colours (`ACCESSORY_COLORS` lists the per-item defaults) | |
| `headroom` | free space above for hops, fraction of body height | 0.22 |
| `shadow` | contact shadow | true |

Colours accept any CSS colour: hex, names, `rgb()`/`hsl()` in comma or space
syntax, and `oklch()`/`lab()` and friends (resolved through the browser). An
unknown colour warns once in the console and falls back to the default; any
other invalid option does the same (booleans included: `shadow: 'false'`
warns and keeps the default). Warnings are once per distinct message, not per
call.

## Pose (per frame)

| field | meaning | default |
|---|---|---|
| `width`, `height` | box to fit into, px | 600 |
| `pixelRatio` | device pixels per px (picks the fur shell count) | 1 |
| `lookX`, `lookY` | eye direction −1..1 (y down) | 0 |
| `blink` | 0 open .. 1 closed | 0 |
| `squash` | +1 squashed .. −1 stretched, volume preserving | 0 |
| `hop` | jump height, px | 0 |
| `lean`, `turn` | degrees | 0 |
| `float` | how far accessories float off the body | 1 |
| `fur` | fur length, fraction of half-width | from fabric |
| `color` | fur colour, any CSS colour or sRGB `[r, g, b]` 0..1 | #f2b33d |

## Performance

The fur is up to 16 shells of the body mesh with per-vertex lighting and a
cheap fragment shader; the shell count adapts to the on-screen fur length, so
small plushies are cheap. A handful of hero-size plushies is fine on any GPU
(a dozen at 60 fps on a laptop GPU), and `furShells` trades fur depth for work
where it is not.

WebGL is required. A browser that only offers a *software* WebGL context
(headless browsers by default, many VMs, machines whose GPU is blocklisted)
runs 5–10× slower: one plushie at about 10 fps, a first render that takes
seconds. `hasSoftwareWebGL()` from `plushies/viewer` (and `plushies/bundled`,
so `Plushies.hasSoftwareWebGL()`) tells you; it is memoized and returns true
when the only context the browser gives has a major performance caveat. The
viewer's `quality: 'auto'` (the default) already switches to `'low'` there;
to skip plushies entirely, check it before mounting:

```ts
import {hasSoftwareWebGL, mountPlushie} from 'plushies/viewer';

if (!hasSoftwareWebGL()) mountPlushie(el, THREE, {kind: 'star'});
```

Because every viewer draws through one shared WebGL context, each frame is
copied from it into the viewer's own 2D canvas. On software GL the console
notes `GPU stall due to ReadPixels` for that copy; it is expected. The first
plushie on a page costs about 100 ms on the main thread (shaders compile and
textures are painted), later ones much less. A plushie with `idle: true`
animates whenever it is visible, which is what keeps the page from being
completely still; set `idle: false` where that matters.

## Development

This package lives in the `plushies` monorepo next to [`@plushies/cursors`](../cursors). Run `bun install` once at the repo root; the commands below run in `packages/plushies`.

```sh
bun run typecheck   # tsc over src, tests and site
bun run test        # unit tests (bun:test, headless three)
bun run build       # dist/: ESM (+ CJS for the root entry; three external), bundled ESM + global (three included), d.ts
bun run site:dev    # the site (cursor demo, gallery, workbench, docs) with live reload on http://localhost:4517
bun run site:build  # _site/ (the cursor demo is part of the page: site/helpers.ts and site/scenes/)
bun run test:e2e    # Playwright: the three builds and the site in Chromium (needs build + site:build)
bun run check       # typecheck + test + build + site:build
```

The npm tarball carries `dist/` without source maps.

CI (`.github/workflows/ci.yml` at the repo root) runs all of the above for both packages on every push and pull
request and deploys `_site/` to GitHub Pages from `main` (Settings → Pages →
Source: GitHub Actions).

`examples/index.html` is a minimal page using the ESM build (`bun run build`
first, then serve the repo root).

### Vendoring into the engine

The engine next to this repo renders its `Plushie` / `PlushLibrary` components
with this same code. PlushLibrary loads the CommonJS core at runtime; refresh
the engine's copy from the repo root (with the engine checked out next to this
repo) with

```sh
bun run vendor
```

(restart the engine after adding the file for the first time).
