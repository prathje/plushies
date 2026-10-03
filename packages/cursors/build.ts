/**
 * Build plushie-cursors into dist/: index.js (ESM, `three` and `plushies`
 * external) and its .d.ts types.
 *
 *   bun run build
 */
import {$} from 'bun';
import {rm} from 'fs/promises';
import {join} from 'path';

const root = import.meta.dir;
const dist = join(root, 'dist');
await rm(dist, {recursive: true, force: true});

const result = await Bun.build({
  entrypoints: [join(root, 'src/index.ts')],
  outdir: dist,
  target: 'browser',
  format: 'esm',
  external: ['three', 'plushies', 'plushies/viewer'],
});
if (!result.success) throw new AggregateError(result.logs, 'build failed');
await $`tsc -p tsconfig.build.json`.cwd(root);
console.log('dist/index.js + types');
