/**
 * Without a DOM (a server render) the factories fail with a message that says
 * so, and importing is side-effect free. Run in a bare Bun process: the other
 * unit tests stub `document`.
 */
import {expect, test} from 'bun:test';
import {join} from 'path';

const run = (code: string) => {
  const proc = Bun.spawnSync(['bun', '-e', code], {cwd: join(import.meta.dir, '../..'), stdout: 'pipe', stderr: 'pipe'});
  return {out: proc.stdout.toString().trim(), err: proc.stderr.toString().trim(), code: proc.exitCode};
};

test('importing the core, the viewer and the bundle has no side effects without a document', () => {
  const {out, err, code} = run(`
    const core = await import('./src/index.ts');
    const viewer = await import('./src/viewer.ts');
    const bundled = await import('./src/bundled.ts');
    console.log(typeof document, Object.keys(core).length > 10, Object.keys(viewer).length > 3, typeof bundled.THREE.WebGLRenderer, bundled.hasSoftwareWebGL());
  `);
  expect(err).toBe('');
  expect(code).toBe(0);
  expect(out).toBe('undefined true true function false');
});

test('createPlushie and mountPlushie explain that they need a browser', () => {
  const {out, code} = run(`
    const THREE = await import('three');
    const {createPlushie} = await import('./src/index.ts');
    const {mountPlushie} = await import('./src/viewer.ts');
    const message = fn => { try { fn(); return 'no error'; } catch (e) { return e.message; } };
    console.log(message(() => createPlushie(THREE, {})));
    console.log(message(() => mountPlushie(null, THREE, {})));
  `);
  expect(code).toBe(0);
  expect(out.split('\n')).toEqual([
    'plushies: createPlushie needs a browser (document is not defined): its textures are painted on a canvas. Call it after mount.',
    "plushies: mountPlushie needs a browser (document is not defined). Call it after mount, e.g. in a 'use client' component's effect.",
  ]);
});
