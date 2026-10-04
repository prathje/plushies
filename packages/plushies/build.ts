/**
 * Build plushies into dist/:
 *
 *   index.js, viewer.js        ESM, `three` external (peer dependency) — for bundlers
 *   plushies.cjs               the core as one CommonJS file, `three` external
 *   plushies.bundled.js        ESM with three bundled ('plushies/bundled')
 *   plushies.global.js         <script> build with three bundled → window.Plushies
 *   *.d.ts                     types
 *
 *   bun run build                        # dist/ only
 *   bun run build --vendor <file>        # also copy plushies.cjs to <file>
 *
 * VideoZero's PlushLibrary component loads the CJS core at runtime:
 *   bun run vendor    (at the repo root; = build --vendor ../../../engine/assets/vendor/plushies.js)
 */
import {$} from 'bun';
import {copyFile, rm} from 'fs/promises';
import {join, resolve} from 'path';
import {gzipSync} from 'zlib';

const root = import.meta.dir;
const dist = join(root, 'dist');
await rm(dist, {recursive: true, force: true});

async function build(name: string, config: Omit<Parameters<typeof Bun.build>[0], 'outdir'>) {
  const result = await Bun.build({outdir: dist, target: 'browser', ...config});
  if (!result.success) throw new AggregateError(result.logs, `${name} build failed`);
  for (const output of result.outputs) {
    if (output.kind === 'sourcemap') continue;
    const bytes = new Uint8Array(await output.arrayBuffer());
    const file = output.path.slice(dist.length + 1);
    console.log(`  ${file.padEnd(22)} ${kb(bytes.length).padStart(9)}  gzip ${kb(gzipSync(bytes).length).padStart(8)}`);
  }
}
const kb = (n: number) => `${(n / 1024).toFixed(1)} kB`;

console.log('dist/');
for (const entry of ['index', 'viewer']) {
  // One by one: Bun's code splitting duplicates the exports of an entry that
  // is also a shared chunk. The viewer imports the core as ./index.js.
  await build(entry, {
    entrypoints: [join(root, `src/${entry}.ts`)],
    format: 'esm',
    external: ['three'],
    plugins: [
      {
        name: 'core-external',
        setup(b) {
          b.onResolve({filter: /^\.\/index\.js$/}, args =>
            args.importer.endsWith('viewer.ts') ? {path: './index.js', external: true} : undefined,
          );
        },
      },
    ],
  });
}
await build('cjs', {
  entrypoints: [join(root, 'src/index.ts')],
  naming: 'plushies.cjs',
  format: 'cjs',
  external: ['three'],
});
await build('bundled', {
  entrypoints: [join(root, 'src/bundled.ts')],
  naming: 'plushies.bundled.js',
  format: 'esm',
  minify: true,
  // The maps stay out of the tarball (3 MB each; see package.json "files"), so
  // the published files don't point at one: external leaves the comment off.
  sourcemap: 'external',
});
await build('global', {
  entrypoints: [join(root, 'src/global.ts')],
  naming: 'plushies.global.js',
  format: 'iife',
  minify: true,
  sourcemap: 'external',
});

await $`${join(root, 'node_modules/.bin/tsc')} -p ${join(root, 'tsconfig.build.json')}`;
await rm(join(dist, 'global.d.ts'), {force: true});

const flag = process.argv.indexOf('--vendor');
if (flag > 0) {
  const target = resolve(process.cwd(), process.argv[flag + 1] ?? '');
  await copyFile(join(dist, 'plushies.cjs'), target);
  console.log(`copied plushies.cjs → ${target}`);
}
