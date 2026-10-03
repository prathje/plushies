# plushies

Soft 3D plush characters for [three.js](https://threejs.org). A flat silhouette
(circle, heart, star, … 17 kinds) is inflated into a stuffed pillow with a
rolled seam and covered in real shell-textured fur. Eyes, mouth, moustache,
glasses, hats (top hat to fez to halo), pins and neckwear float in front of the
body as separate pieces. Everything that
moves — eye direction, blink, squash & stretch, hop, lean, turn — is a plain
number you can set every frame.

**Demo and editor:** run `bun install && bun run site:dev` and open
<http://localhost:4517> — configure a plushie and copy the code.

## Install

Three builds, depending on what your page already has:

| you have | use | size (gzip) |
|---|---|---|
| a bundler and three.js | `plushies` / `plushies/viewer` (three is a peer dependency) | ~22 kB (`index.js` ~19.8 + `viewer.js` ~2.5) |
| a bundler, no three.js | `plushies/bundled` (three included) | ~200 kB |
| a plain HTML page | `dist/plushies.global.js` → `window.Plushies` (three included) | ~200 kB |

```sh
npm i plushies three
```

The CDN snippets below and on the site work once the package is published to
npm.

```html
<!-- no build step, three bundled in -->
<script src="https://cdn.jsdelivr.net/npm/plushies@0.1/dist/plushies.global.js"></script>
<script>
  Plushies.mountPlushie(document.getElementById('hero'), {kind: 'heart', idle: true});
</script>
```

Only use one copy of three per page: if your app already imports three, use the
small build and pass your copy in.

## Drop-in viewer

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

The canvas is transparent and fills its container. The viewer only renders
while something changes, and stops painting while it is scrolled off-screen
(tweens keep running, so their promises still resolve; it repaints when it
scrolls back in). Every viewer on the page draws through one shared,
hidden WebGL context, so you can mount dozens without hitting the browser's
limit of about 16 contexts.

| method | |
|---|---|
| `view.set(pose)` | set pose fields right away |
| `view.to(pose, seconds, ease)` | tween numeric pose fields; resolves when done |
| `view.look(x, y)` · `view.blink()` · `view.hop(height)` · `view.squish(amount)` | little performances, all promises; `hop()` defaults to a height that fits the container: min(90, 20% of its height) px |
| `view.stop()` | halt everything where it is: running tweens, `hop`/`squish`/`blink` sequences and the idle loop's current gesture. All their promises resolve; the idle loop, if on, carries on after its next pause (use `setIdle(false)` to end it) |
| `view.restyle(options)` | change the look in place, keeping the pose. `options` is **merged** into the current look (pass `undefined` to reset a key); only the fur length resets, to the new fabric's, unless you give `fur` |
| `view.options` | the current look: the mount options merged with every `restyle` |
| `view.setIdle(on)` · `view.setFollowPointer(on)` | toggle the idle loop / pointer following |
| `view.dispose()` | remove the canvas and free its GPU resources (the shared context goes with the last viewer); pending promises resolve, and calling it twice is fine |

With `plushies/bundled` or the global build, drop the `THREE` argument:
`mountPlushie(element, options)` / `createPlushie(options)`.

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
so it works with any build from r160 on. Pass `renderer` so beads, glasses and
the crown get their studio reflections. Pass `lights: false` to light it
yourself (the fur is lit by its own built-in rig either way).

Also exported: `DEFAULT_OPTIONS`, `DEFAULT_POSE`, the `PLUSHIE_*` value lists,
`fabricFur(fabric)` and `plushieOutline(kind, options)` (the flat silhouette as
points, e.g. for icons).

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
| `featureColor`, `moustacheColor`, `glassesColor`, `hatColor`, `neckColor`, `pinColor`, `accentColor`, `cheekColor` | CSS colours (`ACCESSORY_COLORS` lists the per-item defaults) | |
| `headroom` | free space above for hops, fraction of body height | 0.22 |
| `shadow` | contact shadow | true |

Colours accept any CSS colour: hex, names, `rgb()`/`hsl()` in comma or space
syntax, and `oklch()`/`lab()` and friends (resolved through the browser). An
unknown colour warns once in the console and falls back to the default; any
other invalid option does the same (booleans included: `shadow: 'false'`
warns and keeps the default).

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
small plushies are cheap. A handful of hero-size plushies is fine on any GPU.

## Development

```sh
bun install
bun run typecheck   # tsc over src, tests and site
bun run test        # unit tests (bun:test, headless three)
bun run build       # dist/: ESM + CJS (three external), bundled ESM + global (three included), d.ts
bun run site:dev    # the demo/editor site with live reload on http://localhost:4517
bun run site:build  # _site/
bun run test:e2e    # Playwright: the three builds and the site in Chromium (needs build + site:build)
bun run check       # typecheck + test + build + site:build
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull
request and deploys `_site/` to GitHub Pages from `main` (Settings → Pages →
Source: GitHub Actions).

`examples/index.html` is a minimal page using the ESM build (`bun run build`
first, then serve the repo root).

### VideoZero

This is the same code that renders the `Plushie` / `PlushLibrary` components in
VideoZero. PlushLibrary loads the CommonJS core at runtime; refresh the engine's
copy with

```sh
bun run build --vendor ../engine/assets/vendor/plushies.js
```

(restart the engine after adding the file for the first time).
