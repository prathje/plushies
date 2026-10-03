/** The drop-in viewer's lifecycle and look handling, from source, in a real browser. */
import {afterAll, beforeAll, expect, test} from 'bun:test';
import {chromium, type Browser, type Page} from 'playwright';
import lab from './fixtures/viewer-lab.html';

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
beforeAll(async () => {
  server = Bun.serve({port: 0, routes: {'/': lab}});
  browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
});
afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

async function open(): Promise<{page: Page; logs: string[]}> {
  const page = await browser.newPage();
  page.setDefaultTimeout(60_000);
  const logs: string[] = [];
  page.on('pageerror', e => logs.push(`error: ${e.message}`));
  page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
  await page.goto(server.url.href);
  await page.waitForFunction(() => (window as any).labReady);
  return {page, logs};
}

/** Opaque pixels on a viewer's canvas after the next paint. */
const PIXELS = `async view => {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const c = view.canvas;
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 200) n++;
  return n;
}`;

test('a second dispose() leaves the other viewers drawing', async () => {
  const {page, logs} = await open();
  const pixels = await page.evaluate(async src => {
    const w = window as any;
    const pixels = eval(src);
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {});
    const c = w.mountPlushie(document.querySelector('#c'), w.THREE, {});
    a.dispose();
    a.dispose();
    c.set({turn: 20});
    return pixels(c);
  }, PIXELS);
  expect(pixels).toBeGreaterThan(5000);
  expect(logs.filter(l => l.startsWith('error'))).toEqual([]);
  await page.close();
}, 90_000);

test('dispose() and stop() settle pending tweens', async () => {
  const {page} = await open();
  const result = await page.evaluate(async () => {
    const w = window as any;
    const race = (p: Promise<unknown>) => Promise.race([p.then(() => 'settled'), new Promise(r => setTimeout(() => r('hung'), 1500))]);
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {idle: true});
    const hop = a.hop();
    await new Promise(r => setTimeout(r, 100));
    a.dispose();
    const b = w.mountPlushie(document.querySelector('#b'), w.THREE, {});
    const squish = b.squish(0.6, 5);
    b.stop();
    const afterDispose = a.to({turn: 30}, 1);
    return [await race(hop), await race(squish), await race(afterDispose)];
  });
  // squish() is three steps: stop() settles the running one, the next ones start fresh.
  expect(result[0]).toBe('settled');
  expect(result[2]).toBe('settled');
  await page.close();
}, 90_000);

test('restyle() merges into the current look', async () => {
  const {page} = await open();
  const look = await page.evaluate(() => {
    const w = window as any;
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {kind: 'heart', glasses: 'round', lights: false, turn: 10});
    a.restyle({hat: 'top'});
    a.restyle({glasses: undefined});
    a.restyle({color: '#ff0000'});
    return {look: a.options, turn: a.plushie.pose.turn, color: a.plushie.pose.color};
  });
  expect(look.look).toEqual({kind: 'heart', lights: false, hat: 'top'});
  expect(look.turn).toBe(10);
  expect(look.color).toBe('#ff0000');
  await page.close();
}, 90_000);

test('modern CSS colours match their hex', async () => {
  const {page, logs} = await open();
  const same = await page.evaluate(async src => {
    const w = window as any;
    const pixels = eval(src);
    const centre = async (color: string) => {
      const v = w.mountPlushie(document.querySelector('#a'), w.THREE, {color, eyes: 'none'});
      await pixels(v);
      const c = v.canvas;
      const [r, g, b] = c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data;
      v.dispose();
      return [r, g, b];
    };
    const hex = await centre('#ff0000');
    const out: Record<string, number[]> = {hex};
    for (const color of ['rgb(255 0 0)', 'rgb(100% 0% 0%)', 'hsl(0 100% 50%)', 'hsl(0deg 100% 50% / .5)', 'red', 'oklch(62.8% 0.2577 29.23)']) {
      out[color] = await centre(color);
    }
    return out;
  }, PIXELS);
  for (const [color, rgb] of Object.entries(same)) {
    expect([color, ...rgb]).toEqual([color, ...same.hex]);
  }
  expect(logs.filter(l => /unknown colour/.test(l))).toEqual([]);
  await page.close();
}, 120_000);

test('invalid options warn and fall back; NaN poses are ignored', async () => {
  const {page, logs} = await open();
  const pose = await page.evaluate(() => {
    const w = window as any;
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {glasses: 'nope', eyeSize: NaN, color: 'not-a-colour'});
    a.set({lookX: NaN, turn: 12});
    return a.plushie.pose;
  });
  expect(pose.lookX).toBe(0);
  expect(pose.turn).toBe(12);
  const warnings = logs.filter(l => l.startsWith('warning'));
  expect(warnings.some(l => /unknown glasses "nope"/.test(l))).toBe(true);
  expect(warnings.some(l => /eyeSize must be a number/.test(l))).toBe(true);
  expect(warnings.some(l => /unknown colour "not-a-colour"/.test(l))).toBe(true);
  expect(warnings.some(l => /lookX must be a finite number/.test(l))).toBe(true);
  await page.close();
}, 90_000);

test('chained steps keep their total duration', async () => {
  const {page} = await open();
  const ms = await page.evaluate(async () => {
    const w = window as any;
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {});
    // The first frame compiles the shaders.
    await a.to({turn: 5}, 0.01);
    await a.to({turn: 0}, 0.01);
    const t = performance.now();
    await a.to({turn: 10}, 0.2);
    await a.to({turn: 20}, 0.2);
    await a.to({turn: 30}, 0.2);
    await a.to({turn: 40}, 0.2);
    await a.to({turn: 50}, 0.2);
    return performance.now() - t;
  });
  // Five 200 ms steps; without chaining each step adds up to a frame (slow under SwiftShader).
  expect(ms).toBeLessThan(1000 + 250);
  await page.close();
}, 90_000);
