/** The drop-in viewer's lifecycle and look handling, from source, in a real browser. */
import {afterAll, afterEach, beforeAll, expect, test} from 'bun:test';
import type {Page} from 'playwright';
import {launchChromium, twice, withDeadline, type Chromium} from './browser';
import lab from './fixtures/viewer-lab.html';

let server: ReturnType<typeof Bun.serve>;
beforeAll(() => {
  server = Bun.serve({port: 0, routes: {'/': lab}});
});
// One browser per test: on a small CI runner, SwiftShader Chromium crashed a few
// WebGL-heavy tests into a shared browser, failing whichever test came next
// (and a wedged one is killed, so it can't hang the test after it either).
let chrome: Chromium | undefined;
afterEach(async () => {
  const c = chrome;
  chrome = undefined;
  await c?.stop();
});
afterAll(() => {
  server?.stop(true);
});

async function open(): Promise<{page: Page; logs: string[]}> {
  // A second try after a failed attempt starts from a fresh browser (the old one is stopped, killed if hung).
  await chrome?.stop();
  chrome = await launchChromium();
  const page = withDeadline(await chrome.browser.newPage());
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

test('a second dispose() leaves the other viewers drawing', twice(async () => {
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
}), {timeout: 180_000});

test('dispose() and stop() settle pending tweens', twice(async () => {
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
  expect(result).toEqual(['settled', 'settled', 'settled']);
  await page.close();
}), {timeout: 180_000});

test('restyle() merges into the current look', twice(async () => {
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
}), {timeout: 180_000});

test('modern CSS colours match their hex', twice(async () => {
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
}), {timeout: 240_000});

test('invalid options warn and fall back; NaN poses are ignored', twice(async () => {
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
}), {timeout: 180_000});

test('chained steps keep their total duration', twice(async () => {
  const {page} = await open();
  const {ms, frame} = await page.evaluate(async () => {
    const w = window as any;
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {});
    // The first frame compiles the shaders.
    await a.to({turn: 5}, 0.01);
    await a.to({turn: 0}, 0.01);
    let frames = 0;
    let counting = true;
    const count = () => { frames++; if (counting) requestAnimationFrame(count); };
    requestAnimationFrame(count);
    const t = performance.now();
    await a.to({turn: 10}, 0.2);
    await a.to({turn: 20}, 0.2);
    await a.to({turn: 30}, 0.2);
    await a.to({turn: 40}, 0.2);
    await a.to({turn: 50}, 0.2);
    const ms = performance.now() - t;
    counting = false;
    return {ms, frame: ms / Math.max(1, frames)};
  });
  // Five 200 ms steps; without chaining each step overruns by part of a frame,
  // about 2.5 frames in all. Chaining only bridges gaps up to 250 ms (2 × the
  // frame gap ≤ 500 ms), so on a slower machine there's nothing to check.
  if (frame > 200) return console.warn(`chained steps: ${frame.toFixed(0)} ms frames, skipped`);
  expect(ms).toBeLessThan(1000 + Math.max(250, 1.5 * frame));
}), {timeout: 180_000});

test('stop() halts a performance and the idle gesture where they are', twice(async () => {
  const {page} = await open();
  const result = await page.evaluate(async () => {
    const w = window as any;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {});
    await a.to({turn: 1}, 0.01);
    const hop = a.hop(60, 2);
    await sleep(250);
    a.stop();
    const held = {...a.plushie.pose};
    const settled = await Promise.race([hop.then(() => true), sleep(100).then(() => false)]);
    await sleep(500);
    const after = a.plushie.pose;
    // The idle loop: stop() mid-blink holds the lid there through the pause that follows.
    const b = w.mountPlushie(document.querySelector('#b'), w.THREE, {idle: true});
    await new Promise(r => {
      const poll = () => (b.plushie.pose.blink > 0.2 ? r(null) : requestAnimationFrame(poll));
      poll();
    });
    b.stop();
    const lid = b.plushie.pose.blink;
    await sleep(400);
    return {settled, held, after, lid, lidAfter: b.plushie.pose.blink};
  });
  expect(result.settled).toBe(true);
  expect(result.held.squash).not.toBe(0);
  for (const key of ['squash', 'hop', 'float']) expect([key, result.after[key]]).toEqual([key, result.held[key]]);
  expect(result.lid).toBeGreaterThan(0.2);
  expect(result.lidAfter).toBe(result.lid);
  await page.close();
}), {timeout: 180_000});

test('a step chained after a long stall starts now, not back when the stall began', twice(async () => {
  const {page} = await open();
  const ms = await page.evaluate(async () => {
    const w = window as any;
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {});
    await a.to({turn: 5}, 0.01);
    // Block the main thread past the end of the first step, like a paused background tab.
    const first = a.to({turn: 10}, 0.05);
    const end = performance.now() + 1000;
    while (performance.now() < end);
    await first;
    const t = performance.now();
    await a.to({turn: 20}, 0.3);
    return performance.now() - t;
  });
  // Chained from the first step's end, the 300 ms step would already be over on its first frame.
  expect(ms).toBeGreaterThan(250);
  await page.close();
}), {timeout: 180_000});

test('restyle() with fur or a new fabric settles a running fur tween', twice(async () => {
  const {page} = await open();
  const fur = await page.evaluate(async () => {
    const w = window as any;
    const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
    const a = w.mountPlushie(document.querySelector('#a'), w.THREE, {});
    const b = w.mountPlushie(document.querySelector('#b'), w.THREE, {fabric: 'shaggy'});
    void a.to({fur: 0.01}, 1);
    await sleep(100);
    a.restyle({fur: 0.3});
    await sleep(300);
    const given = a.plushie.pose.fur;
    void a.to({fur: 0.01}, 1);
    await sleep(100);
    a.restyle({fabric: 'shaggy'});
    await sleep(300);
    return {given, fabric: a.plushie.pose.fur, shaggy: b.plushie.pose.fur};
  });
  expect(fur.given).toBe(0.3);
  expect(fur.fabric).toBe(fur.shaggy);
  await page.close();
}), {timeout: 180_000});

test('translucent, bare-number hsl and `none` colours resolve like their opaque twins', twice(async () => {
  const {page, logs} = await open();
  const pairs = await page.evaluate(async src => {
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
    const out: [string, number[], number[]][] = [];
    for (const [color, twin] of [
      ['color(srgb 0.2 0.4 0.6 / 0.5)', '#336699'],
      ['hsl(120 50 50)', 'hsl(120, 50%, 50%)'],
      ['rgb(none 102 153)', '#006699'],
    ]) {
      out.push([color, await centre(color), await centre(twin)]);
    }
    return out;
  }, PIXELS);
  // The browser stores the translucent probe pixel premultiplied: off by a step or two at most.
  for (const [color, rgb, twin] of pairs) {
    expect([color, rgb.every((v, i) => Math.abs(v - twin[i]) <= 3)]).toEqual([color, true]);
  }
  expect(logs.filter(l => /unknown colour/.test(l))).toEqual([]);
  await page.close();
}), {timeout: 240_000});
