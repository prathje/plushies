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
    const race = (p: Promise<unknown>) => Promise.race([p.then(() => 'settled'), new Promise(r => setTimeout(() => r('hung'), 6000))]);
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
    // Coming from below right, it takes the shape's bottom-right corner (the nearest).
    const b = w.createPlushieCursor(null, {name: 'B', container: document.querySelector('#outer'), x: 610, y: 410});
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

test('a target that throws is lost, and the other cursors keep moving', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const container = document.querySelector('#a');
    const a = w.createPlushieCursor(null, {name: 'A', container, x: 50, y: 50});
    const b = w.createPlushieCursor(null, {name: 'B', container, x: 50, y: 300});
    const mark = b.highlight(() => {
      throw new Error('mark boom');
    });
    const thrown = a.pointAt(() => {
      throw new Error('boom');
    });
    const moved = b.moveTo(400, 300);
    const lost = await thrown;
    const results = [lost, await moved, await a.pointAt('#thing'), await a.moveTo(200, 100)];
    mark.clear();
    return results;
  });
  expect(r).toEqual(['lost', 'arrived', 'lost', 'arrived']);
  expect(logs.some(l => /target threw/.test(l))).toBe(true);
  expect(logs.some(l => /not "#thing"/.test(l))).toBe(true);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('pointAt(null) lets go, supersedes the move and stays put', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const tipOf = (c: any) => (c.element.style.transform.match(/-?[\d.]+(?=px)/g) ?? []).map(Number);
    const a = document.querySelector('#a') as HTMLElement;
    const c = w.createPlushieCursor(null, {name: 'A', container: a, x: 50, y: 50});
    const far = c.moveTo(500, 350);
    await new Promise(r => setTimeout(r, 120));
    const none = await c.pointAt(null);
    const stopped = tipOf(c);
    await new Promise(r => setTimeout(r, 800));
    const after = tipOf(c);
    // Following, then let go: the target moves on without it.
    const thing = document.querySelector('#thing') as HTMLElement;
    await c.pointAt(thing);
    await c.pointAt(undefined);
    const held = tipOf(c);
    thing.style.left = '300px';
    await new Promise(r => setTimeout(r, 500));
    thing.style.left = '';
    return {results: [await far, none], stopped, after, held, later: tipOf(c)};
  });
  expect(r.results).toEqual(['superseded', 'lost']);
  // It eases to a stop near where it was let go, nowhere near 500, 350.
  expect(Math.hypot(r.after[0] - r.stopped[0], r.after[1] - r.stopped[1])).toBeLessThan(40);
  expect(r.after[0]).toBeLessThan(300);
  expect(Math.hypot(r.later[0] - r.held[0], r.later[1] - r.held[1])).toBeLessThan(5);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('a label that grows near the edge flips once its morph is over', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const a = document.querySelector('#a') as HTMLElement;
    const c = w.createPlushieCursor(null, {name: 'A', design: 'island', container: a, x: 450, y: 100});
    await c.moveTo(450, 100);
    await new Promise(r => setTimeout(r, 300));
    const before = c.element.classList.contains('pc-flip-x');
    c.status({text: 'Rewriting the whole headline so it fits on two lines', detail: 'Trying a few options'});
    await new Promise(r => setTimeout(r, 1000));
    const box = c.element.querySelector('.pc-box')!.getBoundingClientRect();
    return {before, after: c.element.classList.contains('pc-flip-x'), right: box.right, edge: a.getBoundingClientRect().right};
  });
  expect(r.before).toBe(false);
  expect(r.after).toBe(true);
  expect(r.right).toBeLessThanOrEqual(r.edge);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('layers survive a wiped container and containers attached later', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const b = document.querySelector('#b') as HTMLElement;
    const old = w.createPlushieCursor(null, {name: 'Old', container: b});
    b.innerHTML = '';
    const fresh = w.createPlushieCursor(null, {name: 'New', container: b, x: 50, y: 50});
    const layersAfterWipe = b.querySelectorAll('.pc-layer').length;
    old.dispose();
    const stillThere = fresh.element.isConnected;
    const moved = await fresh.moveTo(200, 200);
    fresh.dispose();
    const layersAfter = b.querySelectorAll('.pc-layer').length;
    // A container still being built, then put into a shadow root.
    const host = document.querySelector('#host') as HTMLElement;
    const shadow = host.attachShadow({mode: 'open'});
    const box = document.createElement('div');
    box.style.cssText = 'width:300px;height:200px';
    const one = w.createPlushieCursor(null, {name: 'One', container: box});
    const two = w.createPlushieCursor(null, {name: 'Two', container: box});
    shadow.append(box);
    await new Promise(r => setTimeout(r, 200));
    const layers = box.querySelectorAll('.pc-layer').length;
    const position = box.style.position;
    const layerPosition = getComputedStyle(box.querySelector('.pc-layer')!).position;
    const designStyled = getComputedStyle(one.element.querySelector('.pc-label, .pc-box, .pc-tag') ?? one.element.firstElementChild!).position;
    one.dispose();
    two.dispose();
    return {layersAfterWipe, stillThere, moved, layersAfter, layers, position, layerPosition, designStyled, restored: box.style.position};
  });
  expect(r).toEqual({
    layersAfterWipe: 1,
    stillThere: true,
    moved: 'arrived',
    layersAfter: 0,
    layers: 1,
    position: 'relative',
    layerPosition: 'absolute',
    designStyled: 'absolute',
    restored: '',
  });
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('a container resize wakes a resting cursor', async () => {
  const {page, logs} = await open();
  const x = await page.evaluate(async () => {
    const w = window as any;
    const host = document.querySelector('#host') as HTMLElement;
    host.style.cssText = 'position:absolute;left:0;top:0;width:400px;height:300px';
    const c = w.createPlushieCursor(null, {name: 'A', design: 'island', container: host, x: 350, y: 50});
    await c.moveTo(350, 50);
    await new Promise(r => setTimeout(r, 700));
    host.style.width = '200px';
    // Wait for the glide back inside to finish (slow under a loaded swiftshader).
    const at = () => Number(c.element.style.transform.match(/-?[\d.]+(?=px)/)![0]);
    for (let i = 0; i < 50 && at() > 200; i++) await new Promise(r => setTimeout(r, 100));
    return at();
  });
  expect(x).toBeLessThanOrEqual(200);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('a hidden bobbing cursor stops animating', async () => {
  const {page} = await open();
  const writes = await page.evaluate(async () => {
    const w = window as any;
    // Bare: 'live' bobs without a plushie too (and no WebGL to slow the frames).
    const c = w.createPlushieCursor(null, {name: 'Bob', design: 'live', container: document.querySelector('#a'), x: 100, y: 100});
    await new Promise(r => setTimeout(r, 300));
    const count = async () => {
      let n = 0;
      const observer = new MutationObserver(list => (n += list.length));
      observer.observe(c.element, {attributes: true, attributeFilter: ['style']});
      observer.observe(c.element.querySelector('.pc-body')!, {attributes: true, attributeFilter: ['style']});
      await new Promise(r => setTimeout(r, 1000));
      observer.disconnect();
      return n;
    };
    const shown = await count();
    c.show(false);
    // A frame or two to go to rest (frames can be slow on a busy machine).
    await new Promise(r => setTimeout(r, 600));
    return {shown, hidden: await count()};
  });
  expect(writes.shown).toBeGreaterThan(0);
  expect(writes.hidden).toBe(0);
  await page.close();
}, 60_000);

test('cursors on one element take the nearest clear spots, and stay put when the other leaves', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const container = document.querySelector('#a')!;
    const thing = document.querySelector('#thing')!;
    // Everything a cursor draws, in viewport pixels.
    const extent = (c: any) => {
      const rects = [...c.element.querySelectorAll('*')].map((e: Element) => e.getBoundingClientRect()).filter((b: DOMRect) => b.width && b.height);
      return {
        left: Math.min(...rects.map((b: DOMRect) => b.left)),
        top: Math.min(...rects.map((b: DOMRect) => b.top)),
        right: Math.max(...rects.map((b: DOMRect) => b.right)),
        bottom: Math.max(...rects.map((b: DOMRect) => b.bottom)),
      };
    };
    const tip = (c: any) => new DOMMatrix(getComputedStyle(c.element).transform).transformPoint(new DOMPoint(0, 0));
    const a = w.createPlushieCursor(null, {name: 'Ada', container, x: 500, y: 300});
    const b = w.createPlushieCursor(null, {name: 'Bob', container, x: 520, y: 330});
    a.status('Rewriting the headline');
    b.status('Checking the colours');
    await a.pointAt(thing);
    const first = tip(a);
    await b.pointAt(thing);
    await new Promise(r => setTimeout(r, 300));
    const [ea, eb] = [extent(a), extent(b)];
    const apart = ea.right <= eb.left || eb.right <= ea.left || ea.bottom <= eb.top || eb.bottom <= ea.top;
    const second = tip(b);
    // The first one is gone: the second doesn't move.
    a.dispose();
    await new Promise(r => setTimeout(r, 900));
    return {apart, first: [first.x, first.y], second: [second.x, second.y], after: [tip(b).x, tip(b).y]};
  });
  expect(r.apart).toBe(true);
  // #thing is 100..260 × 120..180; both come from below right. The first takes
  // the bottom-right corner, 6 px in (moves arrive within a pixel), the second another spot.
  expect(Math.abs(r.first[0] - 254)).toBeLessThan(1);
  expect(Math.abs(r.first[1] - 174)).toBeLessThan(1);
  expect(Math.hypot(r.second[0] - 254, r.second[1] - 174)).toBeGreaterThan(20);
  expect(Math.hypot(r.after[0] - r.second[0], r.after[1] - r.second[1])).toBeLessThan(1);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);
