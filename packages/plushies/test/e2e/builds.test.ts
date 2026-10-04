/** The three published builds mount and draw a plushie in a real browser. Needs `bun run build`. */
import {afterAll, beforeAll, describe, expect, test} from 'bun:test';
import {drawnBytes, launch} from './browser';

let browser: Awaited<ReturnType<typeof launch>>;
beforeAll(async () => {
  browser = await launch();
});
// A hung browser takes a few seconds to kill: more than a hook's default 5 s.
afterAll(() => browser?.close(), 30_000);

describe.each([
  ['script tag, three bundled', '/test/e2e/fixtures/global.html'],
  ['ES module, three bundled', '/test/e2e/fixtures/bundled.html'],
  ['ES modules, your own three', '/test/e2e/fixtures/esm.html'],
])('%s', (_, path) => {
  test('mounts, draws and animates', async () => {
    const {page, errors} = await browser.page(path);
    await page.waitForFunction(() => (window as any).view?.canvas?.isConnected, null, {timeout: 20_000});
    await page.waitForTimeout(500);
    expect(await page.locator('#plush canvas').count()).toBe(1);
    expect(await drawnBytes(page, '#plush canvas')).toBeGreaterThan(15_000);

    // Promises resolve when the motion ends; pose values land where asked.
    const pose = await page.evaluate(async () => {
      const view = (window as any).view;
      await view.hop(40, 0.3);
      await view.look(0.5, -0.25, 0.1);
      return view.plushie.pose;
    });
    expect(pose.hop).toBe(0);
    expect(pose.lookX).toBeCloseTo(0.5, 5);
    expect(pose.lookY).toBeCloseTo(-0.25, 5);

    await page.evaluate(() => (window as any).view.restyle({kind: 'ghost', hat: 'top'}));
    await page.waitForTimeout(200);
    expect(await drawnBytes(page, '#plush canvas')).toBeGreaterThan(15_000);

    await page.evaluate(() => (window as any).view.dispose());
    expect(await page.locator('#plush canvas').count()).toBe(0);
    expect(errors()).toEqual([]);
    await page.close();
  }, 180_000);
});

describe('shared renderer', () => {
  test('more viewers than the browser has WebGL contexts all draw', async () => {
    const {page, errors} = await browser.page('/test/e2e/fixtures/many.html');
    await page.waitForFunction(() => (window as any).views?.length === 24, null, {timeout: 20_000});
    // Share of opaque pixels per canvas; viewers draw onto 2D canvases, so this is readable.
    const coverage = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('canvas')].map(c => {
          const {data} = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
          let solid = 0;
          for (let i = 3; i < data.length; i += 4) if (data[i] > 200) solid++;
          return solid / (c.width * c.height);
        }),
      );
    await page.waitForFunction(() => document.querySelectorAll('canvas').length === 24);
    await page.waitForTimeout(500);
    const first = await coverage();
    expect(first).toHaveLength(24);
    for (const share of first) expect(share).toBeGreaterThan(0.15);

    // A bigger viewer grows the shared buffer; the small ones keep drawing correctly.
    await page.evaluate(() => {
      (window as any).mount(1, 360);
      for (const view of (window as any).views) view.set({lookX: 0.5});
    });
    await page.waitForTimeout(500);
    const after = await coverage();
    for (const share of after) expect(share).toBeGreaterThan(0.15);
    for (let i = 0; i < 24; i++) expect(Math.abs(after[i] - first[i])).toBeLessThan(0.05);

    // Disposing every viewer frees the context; a new one creates it again.
    const again = await page.evaluate(async () => {
      for (const view of (window as any).views) view.dispose();
      for (const el of document.querySelectorAll('.p')) el.remove();
      const views = (window as any).mount(24);
      await new Promise(r => setTimeout(r, 300));
      for (const view of views.slice(1)) view.dispose();
      for (const view of (window as any).mount(1)) await view.hop(20, 0.2);
      return document.querySelectorAll('canvas').length;
    });
    expect(again).toBe(2);
    await page.waitForTimeout(300);
    for (const share of await coverage()) expect(share).toBeGreaterThan(0.15);
    expect(errors()).toEqual([]);
    await page.close();
  }, 180_000);
});
