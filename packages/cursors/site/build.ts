/**
 * Build the cursor demo as a static site.
 *
 *   bun run site:build                  # into _site/
 *   bun run site:build --out <dir>      # elsewhere, e.g. the plushies site's cursors/
 *
 * Asset links are relative, so the output works under any path (GitHub Pages
 * serves it at /<repo>/cursors/). The repo root's `site:build` puts it there.
 */
import {rm} from 'fs/promises';
import {join, resolve} from 'path';

const root = import.meta.dir;
const flag = process.argv.indexOf('--out');
const out = flag > 0 ? resolve(process.argv[flag + 1]) : join(root, '../_site');
await rm(out, {recursive: true, force: true});

const result = await Bun.build({
  entrypoints: [join(root, 'index.html')],
  outdir: out,
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
});
if (!result.success) throw new AggregateError(result.logs, 'cursor site build failed');
for (const output of result.outputs) console.log(`  ${output.path.slice(out.length + 1)}`);
console.log(`built ${out}`);
