/** The library's behaviour in a real browser: moves, lifecycle, targets, colours. */
import {afterAll, beforeAll, expect, test} from 'bun:test';
import {chromium, type Browser, type Page} from 'playwright';
import lab from './fixtures/lab.html';

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
  const page = await browser.newPage({viewport: {width: 1300, height: 900}});
  page.setDefaultTimeout(60_000);
  const logs: string[] = [];
  page.on('pageerror', e => logs.push(`error: ${e.message}`));
  page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));
  await page.goto(server.url.href);
  await page.waitForFunction(() => (window as any).labReady);
  return {page, logs};
}

const errors = (logs: string[]) => logs.filter(l => l.startsWith('error'));

test('moves resolve with how they ended', async () => {
  const {page, logs} = await open();
  const results = await page.evaluate(async () => {
    const w = window as any;
    const a = document.querySelector('#a') as HTMLElement;
    const c = w.createPlushieCursor(null, {name: 'A', container: a, x: 50, y: 50});
    const first = c.moveTo(300, 200);
    const second = c.moveTo(100, 100);
    const arrived = await second;
    const thing = document.createElement('div');
    thing.style.cssText = 'position:absolute;left:400px;top:300px;width:40px;height:40px';
    a.append(thing);
    const lost = c.pointAt(thing);
    await new Promise(r => setTimeout(r, 50));
    thing.remove();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const none = await c.pointAt(null);
    const disposing = c.moveTo(500, 50);
    c.dispose();
    return [await first, arrived, await lost, none, await disposing, await c.moveTo(1, 1)];
  });
  expect(results).toEqual(['superseded', 'arrived', 'lost', 'lost', 'disposed', 'disposed']);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('bad input warns instead of breaking the cursor', async () => {
  const {page, logs} = await open();
  const results = await page.evaluate(async () => {
    const w = window as any;
    const c = w.createPlushieCursor(null, {name: 'A', container: document.querySelector('#a'), x: 50, y: 50});
    const nan = await c.moveTo(NaN, 10);
    const xywh = await c.pointAt({x: 100, y: 100, width: 50, height: 50});
    const after = await c.moveTo(200, 200);
    return [nan, xywh, after];
  });
  expect(results).toEqual(['lost', 'arrived', 'arrived']);
  expect(logs.some(l => /moveTo needs numbers/.test(l))).toBe(true);
  await page.close();
}, 60_000);

test('gestures settle when interrupted, and the idle loop comes back', async () => {
  const {page, logs} = await open();
  const result = await page.evaluate(async () => {
    const w = window as any;
    const race = (p: Promise<unknown>) => Promise.race([p.then(() => 'settled'), new Promise(r => setTimeout(() => r('hung'), 3000))]);
    const container = document.querySelector('#a');
    const a = w.createPlushieCursor(w.THREE, {name: 'A', container, x: 100, y: 100});
    const b = w.createPlushieCursor(w.THREE, {name: 'B', container, x: 300, y: 100});
    const c = w.createPlushieCursor(w.THREE, {name: 'C', container, x: 300, y: 300});
    const clickA = a.click();
    const doneB = b.done('ok');
    const clickC = c.click();
    await new Promise(r => setTimeout(r, 30));
    a.dispose();
    b.setDesign('island');
    c.setPlushie(false);
    // On B's new plushie a fresh gesture must hand the idle loop back.
    const calls: boolean[] = [];
    const viewer = b.viewer;
    const setIdle = viewer.setIdle.bind(viewer);
    viewer.setIdle = (on: boolean) => {
      calls.push(on);
      setIdle(on);
    };
    const again = await race(b.click());
    return {settled: [await race(clickA), await race(doneB), await race(clickC), again], calls};
  });
  expect(result.settled).toEqual(['settled', 'settled', 'settled', 'settled']);
  expect(result.calls.at(-1)).toBe(true);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 90_000);

test('scaled containers, canvases and other containers line up', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const rect = (el: Element) => el.getBoundingClientRect();
    // A highlight inside a container under transform: scale(.5).
    const scaled = document.querySelector('#scaled') as HTMLElement;
    const s = w.createPlushieCursor(null, {name: 'S', container: scaled});
    s.highlight(document.querySelector('#scaled-thing'));
    // After the entrance animation.
    await new Promise(r => setTimeout(r, 400));
    const mark = rect(scaled.querySelector('.pc-mark')!);
    const thing = rect(document.querySelector('#scaled-thing')!);
    // A cursor in #outer pointing at a shape on a bordered, padded canvas in
    // #a, which has a cursor layer of its own (nearer to the canvas).
    const canvas = document.querySelector('#cv') as HTMLCanvasElement;
    w.createPlushieCursor(null, {name: 'Inner', container: document.querySelector('#a')});
    const b = w.createPlushieCursor(null, {name: 'B', container: document.querySelector('#outer')});
    await b.pointAt(w.fromCanvas(canvas, {x: 100, y: 50, width: 200, height: 100}));
    // The tip is the cursor element's origin: its translate inside the layer.
    const layer = rect(b.element.parentElement!);
    const [tx, ty] = (b.element.style.transform.match(/-?[\d.]+(?=px)/g) ?? []).map(Number);
    const tip = {left: layer.left + tx, top: layer.top + ty};
    const flipped = b.element.classList.contains('pc-flip-y');
    const content = rect(canvas);
    return {
      mark: [mark.left, mark.top, mark.width, mark.height],
      thing: [thing.left, thing.top, thing.width, thing.height],
      tip: [tip.left, tip.top],
      // Shape x 100..300 of 400, y 50..150 of 200 → CSS 50..150 × 25..75 of the
      // 200 × 100 content box, inside a 4 px border and 6 px padding.
      corner: [content.left + 10 + 150 - 6, flipped ? content.top + 10 + 25 + 6 : content.top + 10 + 75 - 6],
    };
  });
  // The mark sits 1 px outside the element (in layer pixels, so .5 px on screen).
  r.mark.forEach((v, i) => expect(Math.abs(v - (r.thing[i] + [-0.5, -0.5, 1, 1][i]))).toBeLessThan(1));
  expect(Math.abs(r.tip[0] - r.corner[0])).toBeLessThan(1);
  expect(Math.abs(r.tip[1] - r.corner[1])).toBeLessThan(1);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('dispose cleans up after itself', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const a = document.querySelector('#host') as HTMLElement;
    a.style.cssText = 'width:300px;height:200px';
    const one = w.createPlushieCursor(w.THREE, {name: 'One', container: a});
    const two = w.createPlushieCursor(null, {name: 'Two', container: a});
    one.highlight({left: 10, top: 10, width: 40, height: 40});
    two.highlight({left: 60, top: 10, width: 40, height: 40});
    one.dispose();
    const afterOne = {layers: a.querySelectorAll('.pc-layer').length, marks: a.querySelectorAll('.pc-mark').length};
    two.dispose();
    two.dispose();
    two.status('still here?');
    two.highlight(document.body).clear();
    two.setPlushie(true);
    two.setDesign('buddy');
    return {
      afterOne,
      layers: a.querySelectorAll('.pc-layer').length,
      canvases: document.querySelectorAll('#host canvas').length,
      position: a.style.position,
    };
  });
  expect(r).toEqual({afterOne: {layers: 1, marks: 1}, layers: 0, canvases: 0, position: ''});
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('status input, colours, shadow roots and the say/done order', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const host = document.querySelector('#host') as HTMLElement;
    host.style.cssText = 'width:400px;height:300px;position:relative';
    const shadow = host.attachShadow({mode: 'open'});
    const inner = document.createElement('div');
    inner.style.cssText = 'width:400px;height:300px';
    shadow.append(inner);
    const c = w.createPlushieCursor(null, {name: 'Sunny', color: '#fc0', container: inner});
    const layerPosition = getComputedStyle(shadow.querySelector('.pc-layer')!).position;
    c.status('');
    const emptyOpen = !!shadow.querySelector('.is-open');
    c.status({text: 'Work', step: [4, 3]});
    const step = shadow.querySelector('.pc-step')!.textContent;
    c.say('hello');
    c.done('Finished');
    const shown = shadow.querySelector('.pc-text .pc-t:not(.pc-t-out)')!.textContent;
    const ink = c.element.style.getPropertyValue('--pc-ink');
    c.setColor('oklch(60% 0.2 260)');
    const colour = c.element.style.getPropertyValue('--pc');
    const announced = shadow.querySelector('[role=status]')!.textContent;
    return {layerPosition, emptyOpen, step, shown, ink, colour, announced};
  });
  expect(r).toEqual({
    layerPosition: 'absolute',
    emptyOpen: false,
    step: '· 3/3',
    shown: 'Finished',
    ink: '#241c16',
    colour: 'oklch(60% 0.2 260)',
    announced: 'Sunny: Finished',
  });
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('the ticker sleeps once a still cursor has settled', async () => {
  const {page} = await open();
  const writes = await page.evaluate(async () => {
    const w = window as any;
    const c = w.createPlushieCursor(null, {name: 'Still', design: 'island', container: document.querySelector('#a'), x: 40, y: 40});
    await c.moveTo(200, 150);
    await new Promise(r => setTimeout(r, 400));
    let n = 0;
    const observer = new MutationObserver(list => (n += list.length));
    observer.observe(c.element, {attributes: true, subtree: true});
    await new Promise(r => setTimeout(r, 600));
    observer.disconnect();
    return n;
  });
  expect(writes).toBe(0);
  await page.close();
}, 60_000);
