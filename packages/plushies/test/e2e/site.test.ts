/** The GitHub Pages site: renders, the editor drives the plushie and the code, links round-trip. Needs `bun run site:build` at the repo root (it adds the cursor demo). */
import {afterAll, beforeAll, expect, test} from 'bun:test';
import {drawnBytes, launch} from './browser';

let browser: Awaited<ReturnType<typeof launch>>;
beforeAll(async () => {
  browser = await launch();
});
afterAll(() => browser?.close());

const code = (page: import('playwright').Page) => page.locator('#code-out').textContent();

test('renders the hero, gallery and editor without errors', async () => {
  const {page, errors} = await browser.page('/_site/');
  await page.waitForSelector('#hero-plush canvas', {timeout: 20_000});
  await page.waitForTimeout(800);
  expect(await drawnBytes(page, '#hero-plush canvas')).toBeGreaterThan(20_000);
  expect(await page.locator('.look').count()).toBe(9);
  expect(await page.locator('#controls .group').count()).toBe(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  expect(errors()).toEqual([]);
  await page.close();
}, 180_000);

test('editor controls change the code and the share link', async () => {
  const {page, errors} = await browser.page('/_site/#editor');
  await page.waitForSelector('#editor-plush canvas', {timeout: 20_000});
  await page.locator('.shape-tile[title="star"]').click();
  await page.locator('.field[data-key="fabric"] label', {hasText: 'felt'}).click();
  await page.locator('.field[data-key="hat"] label', {hasText: 'party'}).click();
  const text = await code(page);
  expect(text).toContain("kind: 'star'");
  expect(text).toContain("fabric: 'felt'");
  expect(text).toContain("hat: 'party'");
  expect(await page.locator('.shape-tile[title="star"]').getAttribute('aria-checked')).toBe('true');
  // Star-only options appear for stars.
  expect(await page.locator('.field[data-key="starInner"]').isVisible()).toBe(true);
  const share = await page.locator('#share-url').inputValue();
  expect(share).toContain('kind=star');
  expect(share).toContain('fabric=felt');

  // Each tab is a different flavour of the same plushie.
  await page.locator('#code-tabs .tab', {hasText: 'Script tag'}).click();
  expect(await code(page)).toContain('Plushies.mountPlushie');
  await page.locator('#code-tabs .tab', {hasText: 'three.js scene'}).click();
  expect(await code(page)).toContain('createPlushie(THREE');
  expect(errors()).toEqual([]);
  await page.close();
}, 180_000);

test('a share link restores the plushie', async () => {
  const {page, errors} = await browser.page('/_site/?kind=ghost&color=7cc4f4&hat=crown&eyes=googly&lookX=0.4#editor');
  await page.waitForSelector('#editor-plush canvas', {timeout: 20_000});
  expect(await page.locator('.shape-tile[title="ghost"]').getAttribute('aria-checked')).toBe('true');
  const text = await code(page);
  for (const part of ["kind: 'ghost'", "color: '#7cc4f4'", "hat: 'crown'", "eyes: 'googly'", 'lookX: 0.4']) expect(text).toContain(part);
  expect(errors()).toEqual([]);
  await page.close();
}, 180_000);

test('gallery cards open in the editor', async () => {
  const {page, errors} = await browser.page('/_site/#gallery');
  await page.locator('.look', {hasText: 'Professor Moss'}).getByRole('button', {name: 'Open in editor'}).click();
  const text = await code(page);
  expect(text).toContain("kind: 'squircle'");
  expect(text).toContain("glasses: 'monocle'");
  expect(errors()).toEqual([]);
  await page.close();
}, 180_000);

test('phone layout has no sideways scroll', async () => {
  const {page, errors} = await browser.page('/_site/', {width: 390, height: 844});
  await page.waitForSelector('#hero-plush canvas', {timeout: 20_000});
  for (const id of ['gallery', 'editor', 'docs']) {
    await page.evaluate(id => document.getElementById(id)!.scrollIntoView(), id);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
  // The nav (Editor, Cursors, GitHub on CI) leaves the theme button on screen.
  const button = (await page.locator('.theme-btn').boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(390);
  await page.locator('.theme-btn').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(errors()).toEqual([]);
  await page.close();
}, 180_000);

test('the nav leads to the cursor demo, which keeps the theme and links back', async () => {
  // Built into _site/cursors/ by the repo root's `bun run site:build`.
  const {page, errors} = await browser.page('/_site/');
  await page.evaluate(() => localStorage.setItem('plushies-theme', 'dark'));
  await page.locator('.nav-links a', {hasText: 'Cursors'}).click();
  await page.waitForURL(/\/_site\/cursors\/$/);
  await page.waitForFunction(() => document.querySelectorAll('.pc-cursor').length === 3, null, {timeout: 60_000});
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark');
  expect(await page.locator('a.brand').evaluate(a => (a as HTMLAnchorElement).href)).toBe(browser.url('/_site/'));
  expect(errors()).toEqual([]);
  await page.close();
}, 180_000);
