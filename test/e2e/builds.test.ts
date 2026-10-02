/** The three published builds mount and draw a plushie in a real browser. Needs `bun run build`. */
import {afterAll, beforeAll, describe, expect, test} from 'bun:test';
import {drawnBytes, launch} from './browser';

let browser: Awaited<ReturnType<typeof launch>>;
beforeAll(async () => {
  browser = await launch();
});
afterAll(() => browser?.close());

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
