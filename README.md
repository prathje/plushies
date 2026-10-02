# plushie-cursors

Floating [plushies](../plushies) cursors for AI helpers. Each helper is a small plush character that floats along with its own pointer. It shows its name and a status box that changes size to fit what it's working on.

```ts
import * as THREE from 'three';
import {createPlushieCursor} from 'plushie-cursors';

const pip = createPlushieCursor(THREE, {
  name: 'Pip',
  look: {kind: 'star', color: '#f5c518', eyes: 'happy', hat: 'cap'},
  design: 'live', // 'live' | 'buddy' | 'island'
  container: document.querySelector('#editor'),
});

await pip.pointAt(document.querySelector('#headline')); // glide there, tracking the element as it moves
const glow = pip.highlight(document.querySelector('#headline'));
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

## API

- **`moveTo(x, y)`**: glides to a point and resolves when it arrives. Positions are in the container's pixels.
- **`pointAt(target)`**: glides to whichever corner of the target leaves room for the label (bottom-right first) and follows the target as it moves. `release()` stops following.
- **`status(text | {text, detail, progress, step, busy})`**: shows what the helper is working on; `null` clears it. `progress(value, step?)` changes only the progress.
- **`say(text, seconds?)`**: shows a one-off message.
- **`click()`**: the pointer dips, a ripple spreads from the tip and the plushie squishes.
- **`done(text?)`**: a hop and a check mark, then the cursor goes back to showing just the name.
- **`highlight(target, {busy})`**: VideoZero's "working on this" mark, an overlay in the cursor's colour. While `busy`, its tint breathes and a light runs round the border. It is separate from pointing, so you decide what glows and when; `.clear(delay)` fades it out.
- **`viewer`**: the plushie's viewer (`hop`, `squish`, `look`, `restyle`, …).

The plushie leans into its motion, turns toward where it's going, looks at what it points at and wobbles while it works. Movement uses springs, like the editor: the pointer is critically damped and the plushie trails it on a softer spring. Near the container's edges the cursor mirrors itself so its label stays on screen, with some slack so it doesn't flicker at the edge.

## HTML or canvas

A target can be any of these:

- a DOM element;
- a box in container pixels;
- a function that returns a box each frame.

For an app that draws on a `<canvas>`:

```ts
import {fromCanvas, paintHighlight} from 'plushie-cursors';

// Point at a shape drawn at (x, y, w, h) in canvas units, following it as it moves.
// Pass `size` if your units aren't drawing-buffer pixels, e.g. scene pixels.
cursor.pointAt(fromCanvas(canvas, () => shape.bounds(), {width: 1920, height: 1080}));

// Draw the glow into your own canvas in your render loop, instead of using the HTML overlay:
paintHighlight(ctx, shape.bounds(), '#7c3aed', {busy: true});
```

## Demo

```sh
bun run site:dev   # http://localhost:4521
bun test test      # browser smoke test (Playwright)
```

The demo is a mock video editor: an HTML slide plus a timeline drawn on a canvas. Three helpers take turns working on both. The playground lets you take over one helper, and "Pip follows me" makes Pip trail your mouse.
