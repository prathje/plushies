/**
 * Smoke test: the demo page in a real browser — every design and every use
 * case mounts three helpers, they get to work (status boxes, HTML and canvas
 * glows) and nothing throws.
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

test('plushies are optional', async () => {
  const tab = await browser.newPage();
  const errors: string[] = [];
  tab.on('pageerror', e => errors.push(e.message));
  await tab.goto(`${server.url}?design=live`);
  await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 3, null, {timeout: 20000});
  await tab.click('#plushies');
  await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 0, null, {timeout: 5000});
  expect(await tab.$$eval('.pc-cursor.pc-bare', els => els.length)).toBe(3);
  // Designs switch fine without them, and they come back.
  await tab.click('[data-design=island]');
  await tab.waitForTimeout(1500);
  expect(await tab.$$eval('.pc-cursor canvas', els => els.length)).toBe(0);
  await tab.click('#plushies');
  await tab.waitForFunction(() => document.querySelectorAll('.pc-island .pc-seat canvas').length === 3, null, {timeout: 10000});
  expect(errors).toEqual([]);
  await tab.close();
}, 40000);

test('the plushie is a per-cursor flag', async () => {
  const tab = await browser.newPage();
  await tab.goto(`${server.url}?design=live`);
  await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 3, null, {timeout: 20000});
  await tab.selectOption('#who', '1');
  await tab.click('#own-plushie');
  await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 2, null, {timeout: 5000});
  expect(await tab.$$eval('.pc-cursor.pc-bare', els => els.map(e => (e as HTMLElement).dataset.cursor))).toEqual(['Biscuit']);
  await tab.close();
}, 40000);

for (const scene of ['design', 'website', 'sheet', 'doc', 'pipeline']) {
  test(
    `${scene}: the helpers work in this use case`,
    async () => {
      const tab = await browser.newPage({viewport: {width: 1300, height: 820}});
      const errors: string[] = [];
      tab.on('pageerror', e => errors.push(e.message));
      await tab.goto(`${server.url}?scene=${scene}`);
      await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 3, null, {timeout: 20000});
      // Only this use case's app shows, and the button says so.
      expect(await tab.$$eval('.scene:not([hidden])', els => els.map(e => (e as HTMLElement).dataset.scene))).toEqual([scene]);
      expect(await tab.getAttribute(`#scenes [data-scene=${scene}]`, 'aria-checked')).toBe('true');
      // Within a few seconds someone is busy on it: a status shows and something glows.
      await tab.waitForFunction(() => !!document.querySelector('.pc-mark') && !!document.querySelector('.is-open'), null, {timeout: 15000});
      expect(errors).toEqual([]);
      await tab.close();
    },
    40000,
  );
}

test('switching the use case keeps the helpers and drops their tasks', async () => {
  const tab = await browser.newPage({viewport: {width: 1300, height: 820}});
  const errors: string[] = [];
  tab.on('pageerror', e => errors.push(e.message));
  await tab.goto(`${server.url}?design=island`);
  await tab.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 3, null, {timeout: 20000});
  await tab.waitForFunction(() => !!document.querySelector('.pc-mark'), null, {timeout: 15000});
  await tab.click('#scenes [data-scene=sheet]');
  // The old app's glows go (after their fade); the helpers stay, in their design, and get to work on the new one.
  await tab.waitForFunction(() => !document.querySelector('.pc-mark'), null, {timeout: 3000});
  expect(await tab.$$eval('.scene:not([hidden])', els => els.map(e => (e as HTMLElement).dataset.scene))).toEqual(['sheet']);
  expect(await tab.evaluate(() => location.search)).toBe('?design=island&scene=sheet');
  expect(await tab.$$eval('.pc-cursor', els => els.map(e => (e as HTMLElement).dataset.design))).toEqual(['island', 'island', 'island']);
  await tab.waitForFunction(() => !!document.querySelector('.pc-mark'), null, {timeout: 15000});
  expect(await tab.$$eval('.pc-cursor canvas', els => els.length)).toBe(3);
  expect(errors).toEqual([]);
  await tab.close();
}, 40000);
