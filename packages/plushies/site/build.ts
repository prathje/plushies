/**
 * Build the GitHub Pages site into _site/.
 *
 *   bun run site:build
 *
 * The repository (owner/name) for GitHub links comes from GITHUB_REPOSITORY,
 * which GitHub Actions sets; locally pass PLUSHIES_REPO=owner/name or leave
 * the links out.
 */
import {cp, rm} from 'fs/promises';
import {join} from 'path';

const root = import.meta.dir;
const out = join(root, '../_site');
await rm(out, {recursive: true, force: true});

const repo = process.env.PLUSHIES_REPO ?? process.env.GITHUB_REPOSITORY ?? '';
const result = await Bun.build({
  entrypoints: [join(root, 'index.html')],
  outdir: out,
  target: 'browser',
  minify: true,
  sourcemap: 'linked',
  define: {__REPO__: JSON.stringify(repo)},
});
if (!result.success) throw new AggregateError(result.logs, 'site build failed');

// The library builds ride along, so the page can link to them and the e2e
// tests can load them from the same origin.
await cp(join(root, '../dist'), join(out, 'dist'), {recursive: true}).catch(() => {
  console.warn('dist/ missing: run `bun run build` first to include the library builds');
});
await Bun.write(join(out, '.nojekyll'), '');
for (const output of result.outputs) console.log(`  ${output.path.slice(out.length + 1)}`);
console.log(`built ${out}${repo ? ` for ${repo}` : ''}`);
