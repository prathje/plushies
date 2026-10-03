# plushies

Soft plush characters for AI helpers and more: 3D plushies for three.js, and what's built on them.

| package | npm | |
|---|---|---|
| [`packages/plushies`](packages/plushies) | `plushies` | The characters: 17 silhouettes, shell-textured fur, eyes, glasses, hats, squash & stretch, and a drop-in viewer. |
| [`packages/cursors`](packages/cursors) | `@plushies/cursors` | Floating cursors for AI helpers: a plushie with its own pointer, name and live status box. |

Both are published separately; `@plushies/cursors` depends on `plushies` through the workspace (`workspace:^`, published as `^<version>`).

```sh
bun install          # once, here at the root
bun run typecheck    # both packages
bun run test         # unit tests of both
bun run build        # dist/ of both
bun run site:build   # the GitHub Pages site: the cursor demo and the plushie workbench, one page
bun run test:e2e     # browser tests of both (Playwright; build and site:build first)
bun run vendor       # refresh the engine's vendored copy: ../engine/assets/vendor/plushies.js
```

The site (GitHub Pages) is one page in `packages/plushies/site`: it opens with the cursor demo (three plushie helpers at work in six kinds of app, with a design switch and one helper that follows you), then the gallery, the plushie workbench and the docs. While developing, run `bun run site:dev` in `packages/plushies` (http://localhost:4517).
