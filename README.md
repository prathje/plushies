# plushies

Soft 3D plush characters for three.js, and what's built on them.

| package | npm | |
|---|---|---|
| [`packages/plushies`](packages/plushies) | `plushies` | The characters: 17 silhouettes, shell-textured fur, eyes, glasses, hats, squash & stretch, and a drop-in viewer. |
| [`packages/cursors`](packages/cursors) | `plushie-cursors` | Floating cursors for AI helpers: a plushie with its own pointer, name and live status box. |

Both are published separately; `plushie-cursors` depends on `plushies` through the workspace (`workspace:*`).

```sh
bun install          # once, here at the root
bun run typecheck    # both packages
bun run test         # unit tests of both
bun run build        # dist/ of both
bun run site:build   # the GitHub Pages site: plushies, with the cursor demo at cursors/
bun run test:e2e     # browser tests of both (Playwright; build and site:build first)
bun run vendor       # refresh VideoZero's copy: ../engine/assets/vendor/plushies.js
```

The site (GitHub Pages) is the plushies site with the cursor demo under `cursors/`, linked from its nav. While developing, run `bun run site:dev` in `packages/plushies` (http://localhost:4517) or `packages/cursors` (http://localhost:4521).
