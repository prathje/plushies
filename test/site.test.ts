/**
 * Smoke test: the demo page in a real browser — every design mounts three
 * helpers, they get to work (status boxes, HTML and canvas glows) and
 * nothing throws.
 */
import {afterAll, beforeAll, expect, test} from 'bun:test';
import {chromium, type Browser} from 'playwright';
import page from '../site/index.html';

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;

beforeAll(async () => {
  server = Bun.serve({port: 0, routes: {'/': page}});
  browser = await chromium.launch({args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']});
});
afterAll(async () => {
  await browser?.close();
  server?.stop(true);
});

for (const design of ['live', 'buddy', 'island', 'mixed']) {
  test(
    `${design}: helpers mount and work`,
    async () => {
      const tab = await browser.newPage({viewport: {width: 1300, height: 820}});
      const errors: string[] = [];
      tab.on('pageerror', e => errors.push(e.message));
      await tab.goto(`${server.url}?design=${design}`);
      await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 3, null, {timeout: 20000});
      const designs = await tab.$$eval('.pc-cursor', els => els.map(e => (e as HTMLElement).dataset.design));
      expect(designs).toEqual(design === 'mixed' ? ['live', 'buddy', 'island'] : [design, design, design]);
      // Within a few seconds someone is busy: a status shows and something glows.
      await tab.waitForFunction(() => !!document.querySelector('.pc-mark') || !!document.querySelector('.is-open'), null, {timeout: 15000});
      expect(errors).toEqual([]);
      await tab.close();
    },
    40000,
  );
}

test('switching design keeps the helpers', async () => {
  const tab = await browser.newPage();
  await tab.goto(`${server.url}?design=live`);
  await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 3, null, {timeout: 20000});
  await tab.click('[data-design=island]');
  await tab.waitForFunction(() => document.querySelectorAll('.pc-island .pc-seat canvas').length === 3, null, {timeout: 10000});
  expect(await tab.$$eval('.pc-cursor', els => els.length)).toBe(3);
  await tab.close();
}, 40000);
