/**
 * The GitHub Pages site: the cursor demo opens it (three helpers at work in six
 * kinds of app, a design switch, one helper following you), then the gallery,
 * the editor (it drives the plushie and the code, links round-trip) and the
 * docs. Needs `bun run site:build`.
 */
import {afterAll, beforeAll, expect, test} from 'bun:test';
import {launch, twice} from './browser';

let browser: Awaited<ReturnType<typeof launch>>;
beforeAll(async () => {
  browser = await launch();
});
// A hung browser takes a few seconds to kill: more than a hook's default 5 s.
afterAll(() => browser?.close(), 30_000);

const code = (page: import('playwright').Page) => page.locator('#code-out').textContent();

const helpersMounted = (page: import('playwright').Page) =>
  page.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 3, null, {timeout: 60_000});
/** Someone is busy: a status box is open and something glows. */
const helpersAtWork = (page: import('playwright').Page) =>
  page.waitForFunction(() => !!document.querySelector('.pc-mark') && !!document.querySelector('.is-open'), null, {timeout: 30_000});

test('renders the helpers, gallery and editor without errors', twice(async () => {
  const {page, errors} = await browser.page('/_site/');
  await helpersMounted(page);
  await page.waitForTimeout(800);
  // Each cursor floats a plushie of a real size (no pixel check: the cursors bob and glide, so a screenshot of one never holds still).
  const box = (await page.locator('.pc-cursor canvas').first().boundingBox())!;
  expect(box.width).toBeGreaterThan(20);
  expect(await page.locator('.look').count()).toBe(9);
  expect(await page.locator('#controls .group').count()).toBe(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

test('editor controls change the code and the share link', twice(async () => {
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
}), {timeout: 300_000});

test('a share link restores the plushie', twice(async () => {
  const {page, errors} = await browser.page('/_site/?kind=ghost&color=7cc4f4&hat=crown&eyes=googly&lookX=0.4#editor');
  await page.waitForSelector('#editor-plush canvas', {timeout: 20_000});
  expect(await page.locator('.shape-tile[title="ghost"]').getAttribute('aria-checked')).toBe('true');
  const text = await code(page);
  for (const part of ["kind: 'ghost'", "color: '#7cc4f4'", "hat: 'crown'", "eyes: 'googly'", 'lookX: 0.4']) expect(text).toContain(part);
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

test('gallery cards open in the editor', twice(async () => {
  const {page, errors} = await browser.page('/_site/#gallery');
  await page.locator('.look', {hasText: 'Professor Moss'}).getByRole('button', {name: 'Open in editor'}).click();
  const text = await code(page);
  expect(text).toContain("kind: 'squircle'");
  expect(text).toContain("glasses: 'monocle'");
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

test('phone layout has no sideways scroll', twice(async () => {
  const {page, errors} = await browser.page('/_site/', {width: 390, height: 844});
  await helpersMounted(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  for (const id of ['gallery', 'editor', 'docs']) {
    await page.evaluate(id => document.getElementById(id)!.scrollIntoView(), id);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
  // The nav (Cursors, Editor, GitHub on CI) leaves the theme button on screen.
  const button = (await page.locator('.theme-btn').boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(390);
  await page.locator('.theme-btn').click();
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

// --- The cursor demo -----------------------------------------------------------

// One page per group, switching with the controls: every page load mounts
// three plushies, which is what wears SwiftShader down.
test('every design: the helpers mount and get to work', twice(async () => {
  const {page, errors} = await browser.page('/_site/?design=live', {width: 1300, height: 900});
  await helpersMounted(page);
  await helpersAtWork(page);
  for (const design of ['live', 'buddy', 'island', 'mixed']) {
    if (design !== 'live') await page.click(`#designs [data-design=${design}]`);
    const want = design === 'mixed' ? ['live', 'buddy', 'island'] : [design, design, design];
    await page.waitForFunction(want => [...document.querySelectorAll('.pc-cursor')].map(e => (e as HTMLElement).dataset.design).join() === want.join(), want, {timeout: 30_000});
    await helpersMounted(page);
    await helpersAtWork(page);
  }
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

test('every use case: the helpers work in it', twice(async () => {
  const {page, errors} = await browser.page('/_site/?scene=design', {width: 1300, height: 900});
  await helpersMounted(page);
  for (const scene of ['design', 'website', 'sheet', 'doc', 'pipeline']) {
    if (scene !== 'design') {
      await page.click(`#scenes [data-scene=${scene}]`);
      // The helpers drop the old app's tasks: its glows fade out before new ones show.
      await page.waitForFunction(() => !document.querySelector('.pc-mark'), null, {timeout: 5_000});
    }
    // Only this use case's app shows, and the button says so.
    expect(await page.$$eval('.scene:not([hidden])', els => els.map(e => (e as HTMLElement).dataset.scene))).toEqual([scene]);
    expect(await page.getAttribute(`#scenes [data-scene=${scene}]`, 'aria-checked')).toBe('true');
    // Within a while someone is busy on it: a status shows and something glows.
    await helpersAtWork(page);
  }
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

test('switching the design and the use case keeps the helpers', twice(async () => {
  const {page, errors} = await browser.page('/_site/?kind=ghost&hat=crown#cursors', {width: 1300, height: 900});
  await helpersMounted(page);
  await page.waitForFunction(() => !!document.querySelector('.pc-mark'), null, {timeout: 30_000});
  await page.click('#designs [data-design=island]');
  await page.waitForFunction(() => document.querySelectorAll('.pc-island .pc-seat canvas').length === 3, null, {timeout: 30_000});
  await page.click('#scenes [data-scene=sheet]');
  // The old app's glows go (after their fade); the helpers stay, in their design, and get to work on the new one.
  await page.waitForFunction(() => !document.querySelector('.pc-mark'), null, {timeout: 5_000});
  expect(await page.$$eval('.scene:not([hidden])', els => els.map(e => (e as HTMLElement).dataset.scene))).toEqual(['sheet']);
  // Remembered in the URL, next to the editor's share params.
  expect(await page.evaluate(() => location.search + location.hash)).toBe('?kind=ghost&hat=crown&design=island&scene=sheet#cursors');
  expect(await page.$$eval('.pc-cursor', els => els.map(e => (e as HTMLElement).dataset.design))).toEqual(['island', 'island', 'island']);
  await page.waitForFunction(() => !!document.querySelector('.pc-mark'), null, {timeout: 30_000});
  expect(await page.$$eval('.pc-cursor canvas', els => els.length)).toBe(3);
  // The editor still got its share params.
  expect(await page.locator('.shape-tile[title="ghost"]').getAttribute('aria-checked')).toBe('true');
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

test('plushies are optional, per cursor', twice(async () => {
  const {page, errors} = await browser.page('/_site/?design=live', {width: 1300, height: 900});
  await helpersMounted(page);
  await page.locator('.toggle:has(#plushies)').click();
  await page.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 0, null, {timeout: 10_000});
  expect(await page.$$eval('.pc-cursor.pc-bare', els => els.length)).toBe(3);
  await page.locator('.toggle:has(#plushies)').click();
  await helpersMounted(page);
  // Just one, from the playground.
  await page.selectOption('#who', '1');
  await page.locator('.toggle:has(#own-plushie)').click();
  await page.waitForFunction(() => document.querySelectorAll('.pc-cursor canvas').length === 2, null, {timeout: 10_000});
  expect(await page.$$eval('.pc-cursor.pc-bare', els => els.map(e => (e as HTMLElement).dataset.cursor))).toEqual(['Biscuit']);
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});

test('one helper follows the pointer around the page', twice(async () => {
  const {page, errors} = await browser.page('/_site/?design=live', {width: 1300, height: 900});
  await helpersMounted(page);
  const tip = (name: string) =>
    page.evaluate(name => {
      const c = document.querySelector<HTMLElement>(`.pc-cursor[data-cursor="${name}"]`)!;
      const r = c.getBoundingClientRect();
      return {x: Math.round(r.left), y: Math.round(r.top), hidden: c.classList.contains('pc-hidden')};
    }, name);
  // Settled beside the pointer (a small offset, so it isn't on it).
  const beside = async (name: string, x: number, y: number) => {
    await page.waitForFunction(
      ([name, x, y]) => {
        const r = document.querySelector<HTMLElement>(`.pc-cursor[data-cursor="${name}"]`)!.getBoundingClientRect();
        return Math.abs(r.left - (x + 26)) < 2 && Math.abs(r.top - (y + 22)) < 2;
      },
      [name, x, y] as const,
      {timeout: 30_000},
    );
  };
  await page.click('#follow [data-follow=Biscuit]');
  await page.mouse.move(600, 500);
  await beside('Biscuit', 600, 500);
  // Down to the editor: Biscuit comes along, the others hide with their workspace.
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = 'auto';
    document.getElementById('editor')!.scrollIntoView();
  });
  await page.mouse.move(700, 400);
  await page.mouse.move(720, 420);
  await beside('Biscuit', 720, 420);
  expect((await tip('Pip')).hidden).toBe(true);
  expect((await tip('Biscuit')).hidden).toBe(false);
  // Scrolling alone keeps it beside the pointer.
  await page.mouse.wheel(0, -200);
  await beside('Biscuit', 720, 420);
  // Another follower: Biscuit goes back to its script. (The switch is scrolled
  // off the top, under the sticky nav: press it from script rather than scroll back.)
  const press = (follow: string) => page.evaluate(follow => document.querySelector<HTMLElement>(`#follow [data-follow="${follow}"]`)!.click(), follow);
  await press('Moss');
  await page.mouse.move(640, 460);
  await beside('Moss', 640, 460);
  expect(await page.evaluate(() => (window as any).helpers.map((h: any) => h.manual))).toEqual([false, false, true]);
  await press('');
  expect(await page.evaluate(() => (window as any).helpers.map((h: any) => h.manual))).toEqual([false, false, false]);
  expect(errors()).toEqual([]);
  await page.close();
}), {timeout: 300_000});
