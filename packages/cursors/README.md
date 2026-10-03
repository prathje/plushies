# @plushies/cursors

Floating [plushies](../plushies) cursors for AI helpers. Each helper is a small plush character that floats along with its own pointer. It shows its name and a status box that changes size to fit what it's working on.

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

await pip.pointAt(headline); // glide there and keep following it as it moves
const glow = pip.highlight(headline);
pip.status({text: 'Rewriting the headline', detail: 'Trying a few options', progress: 0.3, step: [1, 3]});
pip.progress(0.8);
await pip.click();
await pip.done('Headline is punchier');
glow.clear(0.8);
```

## Designs

| | |
|---|---|
| `live` | VideoZero's live editor cursor: the tail-less rounded arrow and a name pill tucked into the V of the arrow. While the helper works, the pill grows into a chat bubble whose square corner faces the tip, with a progress bar. The plushie sits where the agent sparkle used to be, and the sparkle's glints twinkle beside it. |
| `buddy` | The plushie floats like a balloon on a string tied to a felt pointer. It trails behind and sways as it moves. Its name is a sewn-on fabric tag. Its status is a speech bubble typed out letter by letter, with thinking dots and a stitched progress seam. |
| `island` | A classic pointer with a dark glass capsule. The plushie sits on a round seat ringed by its progress. The capsule grows into a status card (a shimmering line, a step chip and a detail line) and shrinks back to a name pill when the helper is done. |

Switch a cursor's design at any time with `cursor.setDesign('island')`.

## Without a plushie

The plushie is optional for each cursor:

- **`plushie: false`** when creating a cursor leaves just the pointer and its label (in `live`, exactly the editor's cursor). In `buddy` the tag and bubble then sit right by the pointer; in `island` the progress shows as a bar in the card.
- **`cursor.setPlushie(on)`** turns it off or back on later.
- **`null` for `three`** (`createPlushieCursor(null, {name: 'Agent'})`) leaves out three.js entirely.

## Options

| option | |
|---|---|
| `name` | Shown on the label. |
| `look` | The plushie: any [plushies](../plushies) option (`kind`, `color`, `eyes`, `hat`, …). |
| `color` | The accent for the pointer, label and highlight, any CSS colour. Defaults to the plushie's colour; with neither, each new cursor takes the next colour from a palette (and its plushie wears it too). |
| `design` | `'live'` (default), `'buddy'` or `'island'`. |
| `container` | Where the cursor lives (default: the page). Positions are in its pixels. |
| `x`, `y` | Where it starts (default: the container's centre). |
| `idle` | The plushie blinks, breathes and glances around between moves (default: true). |
| `plushie` | Float a plushie with the pointer (default: true). |
| `zIndex` | Stacking of the container's cursor layer (default: 2147483000). |

## API

Moves:

- **`moveTo(x, y)`**: glides to a point in container pixels.
- **`pointAt(target)`**: glides to whichever corner of the target leaves room for the label (bottom-right first) and keeps following the target as it moves. `release()` stops following.

Both resolve with how the move ended:

| result | |
|---|---|
| `'arrived'` | It got there (a `pointAt` cursor keeps following afterwards). |
| `'superseded'` | A newer `moveTo` or `pointAt` took over before it arrived. |
| `'lost'` | The target went away: removed from the page, its function returned `null` or threw, or `pointAt(null)` (as `querySelector` gives you). The cursor stops following and stays put; `pointAt(null)` also supersedes a move in flight. Also for a `moveTo` with non-numbers or a `pointAt` with something that isn't a target (a selector string, say), which are ignored with a warning. |
| `'disposed'` | The cursor was disposed. |

Status:

- **`status(text | {text, detail, progress, step, busy})`**: shows what the helper is working on; `null` or `''` clears it. Any status call ends a `done` message still showing. `progress` is 0..1; `step: [n, m]` shows "n/m"; `busy: false` makes it a plain note.
- **`progress(value, step?)`**: changes only the progress; with no status yet it starts a "Working…" one.
- **`say(text, seconds = 2.6)`**: shows a one-off message over the status.
- **`click()`**: the pointer dips, a ripple spreads from the tip and the plushie squishes. Resolves when the squish is over.
- **`done(text = 'Done', seconds = 1.8)`**: clears the status, hops and shows the text with a check mark, then goes back to just the name. Resolves when the hop lands, before the message goes away.

The cursor that changed last is drawn on top of the others. Every status change is announced to screen readers through a polite live region.

Highlights:

- **`highlight(target, {busy, radius})`**: VideoZero's "working on this" mark, an overlay in the cursor's colour. While `busy` (the default) its tint breathes and a light runs round the border. It is separate from pointing, so you decide what glows and when. It returns `{update(target, options?), clear(delay?)}`; `clear` fades it out after `delay` seconds. Disposing the cursor removes its highlights.

Changing a cursor:

- **`setDesign(design)`**, **`setName(name)`**, **`setPlushie(on)`**.
- **`show(on)`**: hides or shows the cursor; hidden, it stops animating.
- **`setColor(color)`**: a new accent colour.
- **`setLook(look)`**: changes the plushie's look, merged into the current one.
- **`dispose()`**: removes the cursor and its highlights (and the layer, once its last cursor is gone). Pending moves resolve `'disposed'`, pending `click`/`done` promises resolve, and later calls do nothing.

Read-only: `element` (the cursor's element), `design`, and `viewer`, the plushie's [viewer](../plushies) (`hop`, `squish`, `look`, `restyle`, …) or `null` without a plushie.

The plushie leans into its motion, turns toward where it's going, looks at what it points at and wobbles while it works. Movement uses springs, like the editor: the pointer eases out of rest and lands without overshoot, and the plushie trails it on a softer spring, never more than a short leash behind. Near the edges of the container's visible area the cursor mirrors itself so its label stays on screen (with some slack so it doesn't flicker at the edge), and its tip stays inside that area: a cursor whose target scrolls away waits at the edge. With `prefers-reduced-motion`, the plushie's idle loop, bob, sway and every CSS animation stop, and text appears at once.

All cursors share one `requestAnimationFrame` loop, which stops when nothing is animating: a cursor at rest costs nothing. Bobbing designs (`'live'`, and `'buddy'` with its plushie) and a busy plushie animate while they're visible, and a cursor following a target reads its box every frame; hidden cursors (`show(false)`), containers scrolled out of view and background tabs don't. Window resizes, scrolls and the container resizing wake resting cursors; a layout change they can't see (a new CSS transform on an ancestor) shows at the cursor's next call.

## Targets: HTML or canvas

A target can be any of these:

- a DOM element, or anything with `getBoundingClientRect()` returning viewport pixels;
- a box in container pixels, either `{left, top, width, height}` or `{x, y, width, height}`;
- a function that returns such a box (or `null`) every frame.

Selector strings aren't targets: pass `document.querySelector(…)`.

Containers can be scrolled, CSS-transformed (`scale()`, zoom) or inside a shadow root; the styles go into the shadow root.

For an app that draws on a `<canvas>`:

```ts
import {fromCanvas, paintHighlight} from '@plushies/cursors';

// Point at a shape drawn at (x, y, w, h) in canvas units, following it as it moves.
// Pass `size` if your units aren't drawing-buffer pixels, e.g. scene pixels.
cursor.pointAt(fromCanvas(canvas, () => shape.bounds(), {width: 1920, height: 1080}));

// Draw the glow into your own canvas in your render loop, instead of using the HTML overlay.
// A box, or the corners of a rotated shape as a polygon:
paintHighlight(ctx, shape.bounds(), '#7c3aed', {busy: true});
paintHighlight(ctx, shape.corners(), '#7c3aed', {radius: 4});
```

`fromCanvas` maps onto the canvas's content box, so borders, padding and CSS transforms on the canvas are fine.

## Develop

```sh
bun run site:dev   # the demo, http://localhost:4521
bun run site:build # the demo as a static site in _site/ (--out <dir> for elsewhere)
bun run test       # unit tests + browser tests (Playwright)
bun run build      # dist/index.js and types
```

The demo is published with the plushies site, at `cursors/`. It is a mock video editor: an HTML slide plus a timeline drawn on a canvas. Three helpers take turns working on both. The playground lets you take over one helper, and "Pip follows me" makes Pip trail your mouse.

This package lives in the `plushies` monorepo; run `bun install` at the repo root and the commands above in `packages/cursors`. `plushies` is a workspace dependency (`workspace:*`), which `bun publish` replaces with its version.
