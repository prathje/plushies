/** The library's behaviour in a real browser: moves, lifecycle, targets, colours. */
import {afterAll, beforeAll, expect, test} from 'bun:test';
import {chromium, type Browser, type Page} from 'playwright';
import lab from './fixtures/lab.html';

let server: ReturnType<typeof Bun.serve>;
let browser: Browser;
beforeAll(async () => {
  server = Bun.serve({port: 0, routes: {'/': lab, '/favicon.ico': new Response(null, {status: 204})}});
  // WebGL on the CPU: headless SwiftShader, or with E2E_GL=mesa a headed browser on the
  // system's GL (Mesa llvmpipe under xvfb on CI, where SwiftShader wedges now and then).
  browser = await chromium.launch(
    process.env.E2E_GL === 'mesa'
      ? {headless: false, args: ['--use-angle=gl', '--ignore-gpu-blocklist', '--hide-scrollbars']}
      : {args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']},
  );
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

test('a status set or cleared mid-wobble, a new plushie and a second hop all ease instead of jumping', async () => {
  const {page, logs} = await open();
  const result = await page.evaluate(async () => {
    const w = window as any;
    const c = w.createPlushieCursor(w.THREE, {name: 'A', container: document.querySelector('#a'), x: 200, y: 200});
    await c.moveTo(220, 220);
    // The lean's steepest change per millisecond. The wobble itself moves at most
    // 0.03°/ms and its fade adds 0.03°/ms; a snap is a few degrees in one frame.
    // Time is the frame's own: the ticker writes the pose on it, and on a loaded
    // machine frames run late and bunch up, so the wall clock between two
    // callbacks says nothing about how far the pose was meant to move.
    let steepest = 0;
    let frames = 0;
    let last: {t: number; lean: number} | null = null;
    const sample = (t: number) => {
      const lean = c.viewer.plushie.pose.lean;
      if (last && t > last.t) steepest = Math.max(steepest, Math.abs(lean - last.lean) / (t - last.t));
      last = {t, lean};
      frames++;
    };
    const watch = (ms: number) =>
      new Promise<void>(resolve => {
        const end = performance.now() + ms;
        const f = (t: number) => {
          sample(t);
          if (performance.now() < end) requestAnimationFrame(f);
          else resolve();
        };
        requestAnimationFrame(f);
      });
    await watch(300);
    c.status('Working on it');
    await watch(700);
    c.status(null);
    await watch(300);
    c.status('Again');
    await watch(400);
    // A new plushie starts at rest and the wobble fades in on it.
    last = null;
    c.setDesign('buddy');
    await watch(400);
    // A second hop takes off from where the first left the canvas.
    const host = c.viewer.canvas.parentElement as HTMLElement;
    void c.done('one');
    await new Promise(r => setTimeout(r, 250));
    const before = getComputedStyle(host).translate;
    void c.done('two');
    const after = getComputedStyle(host).translate;
    return {steepest, frames, before, after};
  });
  expect(result.frames).toBeGreaterThan(20);
  expect(result.steepest).toBeLessThan(0.12);
  // Mid-air before the second hop, and still there right after it starts.
  expect(result.before).not.toBe('0px 0px');
  expect(result.after).toBe(result.before);
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
    // After the entrance animation (it scales the mark), however late the frames
    // come. Only that one: the busy mark breathes forever.
    const markEl = scaled.querySelector('.pc-mark')!;
    const entrance = markEl.getAnimations().filter(a => (a as CSSAnimation).animationName === 'pc-mark-in');
    await Promise.all(entrance.map(a => a.finished));
    await new Promise(r => requestAnimationFrame(r));
    const mark = rect(markEl);
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
    // The plushie's body trails the tip and needs a few hundred ms of motion to
    // settle; counted in frames, since the ticker caps a slow frame's step.
    for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r));
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

test('a status that grows past the container edge mirrors the cursor, in every design, and unmirrors when it shrinks', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    // The trials' editor: 720 px wide, clipping, a block whose right edge is 40 px from the container's.
    const host = document.querySelector('#host') as HTMLElement;
    host.style.cssText = 'position:relative;width:720px;height:400px;overflow:hidden';
    const block = document.createElement('div');
    block.style.cssText = 'position:absolute;left:40px;top:150px;width:640px;height:40px;background:#ddd';
    host.append(block);
    const edge = host.getBoundingClientRect();
    // Everything the cursor shows: its parts that are displayed, not hidden or faded, and not a line sliding out.
    const shown = (e: Element, root: Element) => {
      for (let n: Element | null = e; n && n !== root; n = n.parentElement) {
        const s = getComputedStyle(n);
        if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05 || n.classList.contains('pc-t-out') || n.classList.contains('pc-sr')) return false;
      }
      return true;
    };
    const extent = (c: any) => {
      const rects = [...c.element.querySelectorAll('*')].filter((e: Element) => shown(e, c.element)).map((e: Element) => e.getBoundingClientRect()).filter((b: DOMRect) => b.width && b.height);
      return {
        left: Math.min(...rects.map((b: DOMRect) => b.left)),
        right: Math.max(...rects.map((b: DOMRect) => b.right)),
        top: Math.min(...rects.map((b: DOMRect) => b.top)),
        bottom: Math.max(...rects.map((b: DOMRect) => b.bottom)),
      };
    };
    const out: Record<string, any> = {};
    for (const design of ['live', 'buddy', 'island']) {
      block.style.width = '640px';
      const c = w.createPlushieCursor(w.THREE, {name: 'Pip', design, container: host, x: 300, y: 300});
      const moved = await c.pointAt(block);
      c.status({text: 'Rewriting the headline', detail: 'Trying a few options', progress: 0.3, step: [1, 3]});
      await wait(1200);
      const grown = {flip: c.element.classList.contains('pc-flip-x'), ...extent(c), box: c.element.querySelector('.pc-box').getBoundingClientRect().width};
      // A longer line wraps at the label's maximum width (~240 px).
      c.status({text: 'Rewriting the whole headline so it fits on two lines', detail: 'Trying a few options for the opener', progress: 0.6, step: [2, 3]});
      await wait(1200);
      const wide = {flip: c.element.classList.contains('pc-flip-x'), ...extent(c), box: c.element.querySelector('.pc-box').getBoundingClientRect().width};
      // Back to the name: the block's right edge is now 160 px from the container's, so the pill fits beside it.
      block.style.width = '520px';
      c.status(null);
      await wait(1200);
      const shrunk = {flip: c.element.classList.contains('pc-flip-x'), ...extent(c)};
      c.dispose();
      out[design] = {moved, grown, wide, shrunk};
    }
    return {edge: {left: edge.left, right: edge.right, top: edge.top, bottom: edge.bottom}, ...out} as Record<string, any>;
  });
  for (const design of ['live', 'buddy', 'island']) {
    const d = r[design];
    expect(d.moved).toBe('arrived');
    for (const phase of ['grown', 'wide', 'shrunk']) {
      const e = d[phase];
      expect(e.right, `${design} ${phase} right`).toBeLessThanOrEqual(r.edge.right + 0.5);
      expect(e.left, `${design} ${phase} left`).toBeGreaterThanOrEqual(r.edge.left - 0.5);
      expect(e.top, `${design} ${phase} top`).toBeGreaterThanOrEqual(r.edge.top - 0.5);
      expect(e.bottom, `${design} ${phase} bottom`).toBeLessThanOrEqual(r.edge.bottom + 0.5);
    }
    expect(d.grown.flip, `${design} grown flips`).toBe(true);
    expect(d.wide.flip, `${design} wide flips`).toBe(true);
    expect(d.wide.box).toBeGreaterThan(200);
    expect(d.shrunk.flip, `${design} shrunk unflips`).toBe(false);
  }
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 120_000);

test('a target scrolled out of a box inside the container waits at that box\'s edge', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const tip = (c: any) => new DOMMatrix(getComputedStyle(c.element).transform).transformPoint(new DOMPoint(0, 0));
    const host = document.querySelector('#host') as HTMLElement;
    host.style.cssText = 'position:relative;width:400px;height:300px';
    const scroller = document.createElement('div');
    scroller.style.cssText = 'position:absolute;left:50px;top:50px;width:200px;height:100px;overflow:auto;border:3px solid #333';
    const content = document.createElement('div');
    content.style.cssText = 'position:relative;height:400px';
    const target = document.createElement('div');
    target.style.cssText = 'position:absolute;left:20px;top:150px;width:60px;height:30px;background:#ccc';
    content.append(target);
    scroller.append(content);
    host.append(scroller);
    const c = w.createPlushieCursor(null, {name: 'A', container: host, x: 350, y: 250});
    const moved = await c.pointAt(target);
    const waiting = tip(c);
    // Scrolled into view: the target's bottom edge is now 30 px below the scroller's top padding edge.
    scroller.scrollTop = 150;
    await new Promise(r => setTimeout(r, 900));
    const found = tip(c);
    // Scrolled past the top: waits at the top edge.
    scroller.scrollTop = 300;
    await new Promise(r => setTimeout(r, 900));
    const above = tip(c);
    const inner = {left: 50 + scroller.clientLeft, top: 50 + scroller.clientTop, bottom: 50 + scroller.clientTop + scroller.clientHeight};
    return {moved, waiting: [waiting.x, waiting.y], found: [found.x, found.y], above: [above.x, above.y], inner};
  });
  expect(r.moved).toBe('arrived');
  // The box is clamped to zero height on the scroller's bottom edge: the tip
  // sits on it (a corner spot 6 px in, or the side's middle), within the
  // target's x range — not 80 px below, on the hidden element.
  expect(r.waiting[1]).toBeGreaterThan(r.inner.bottom - 7);
  expect(r.waiting[1]).toBeLessThan(r.inner.bottom + 0.5);
  expect(r.waiting[0]).toBeGreaterThan(r.inner.left + 20);
  expect(r.waiting[0]).toBeLessThan(r.inner.left + 80);
  // Scrolled into view: on the target (30 px tall from the scroller's top padding edge).
  expect(r.found[1]).toBeGreaterThan(r.inner.top - 0.5);
  expect(r.found[1]).toBeLessThan(r.inner.top + 30.5);
  // Scrolled past the top: on the top edge.
  expect(r.above[1]).toBeGreaterThan(r.inner.top - 0.5);
  expect(r.above[1]).toBeLessThan(r.inner.top + 7);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('onLost says when a followed target goes away, and target tells what is followed', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    const a = document.querySelector('#a') as HTMLElement;
    const thing = (top: number) => {
      const t = document.createElement('div');
      t.style.cssText = `position:absolute;left:300px;top:${top}px;width:40px;height:40px`;
      a.append(t);
      return t;
    };
    const lost: unknown[] = [];
    const c = w.createPlushieCursor(null, {name: 'A', container: a, x: 50, y: 50, onLost: (t: unknown) => lost.push(t)});
    const none = c.target;
    // Gone after arriving.
    const t1 = thing(100);
    await c.pointAt(t1);
    const following = c.target === t1;
    t1.remove();
    await wait(150);
    const afterFirst = {calls: lost.length, which: lost[0] === t1, target: c.target};
    // Gone while the move is in flight.
    const t2 = thing(300);
    const move = c.pointAt(t2);
    await wait(40);
    t2.remove();
    const result = await move;
    const afterSecond = {calls: lost.length, which: lost[1] === t2};
    // A function target that stops returning a box.
    let box: {x: number; y: number; width: number; height: number} | null = {x: 100, y: 100, width: 20, height: 20};
    const fn = () => box;
    await c.pointAt(fn);
    box = null;
    await wait(150);
    const afterFn = {calls: lost.length, which: lost[2] === fn, target: c.target};
    // Letting go on purpose is not losing: pointAt(null), release, a new move, dispose.
    const t3 = thing(200);
    await c.pointAt(t3);
    await c.pointAt(null);
    await c.pointAt(t3);
    c.release();
    const released = c.target;
    await c.pointAt(t3);
    await c.moveTo(100, 100);
    await c.pointAt(t3);
    await c.pointAt(thing(250));
    await c.pointAt(t3);
    c.dispose();
    await wait(150);
    return {none, following, afterFirst, result, afterSecond, afterFn, released, calls: lost.length};
  });
  expect(r.none).toBeNull();
  expect(r.following).toBe(true);
  expect(r.afterFirst).toEqual({calls: 1, which: true, target: null});
  expect(r.result).toBe('lost');
  expect(r.afterSecond).toEqual({calls: 2, which: true});
  expect(r.afterFn).toEqual({calls: 3, which: true, target: null});
  expect(r.released).toBeNull();
  expect(r.calls).toBe(3);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('a highlight on an element that left the page fades out by itself', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
    const a = document.querySelector('#a') as HTMLElement;
    const t = document.createElement('div');
    t.style.cssText = 'position:absolute;left:300px;top:100px;width:40px;height:40px';
    a.append(t);
    const c = w.createPlushieCursor(null, {name: 'A', container: a, x: 50, y: 50});
    c.highlight(t);
    let box: {left: number; top: number; width: number; height: number} | null = {left: 10, top: 10, width: 30, height: 30};
    c.highlight(() => box);
    await wait(100);
    const marks = () => [...a.querySelectorAll('.pc-mark')].map(m => ({out: m.classList.contains('pc-out'), display: (m as HTMLElement).style.display}));
    const before = marks();
    t.remove();
    box = null;
    await wait(200);
    const fading = marks();
    await wait(700);
    const after = marks();
    // A function target coming back shows its mark again.
    box = {left: 10, top: 10, width: 30, height: 30};
    await wait(100);
    const back = marks();
    c.dispose();
    return {before, fading, after, back, left: a.querySelectorAll('.pc-mark').length};
  });
  expect(r.before).toEqual([{out: false, display: ''}, {out: false, display: ''}]);
  // The element's mark fades where it was while the function's hides, as before.
  expect(r.fading.sort((a, b) => Number(b.out) - Number(a.out))).toEqual([{out: true, display: ''}, {out: false, display: 'none'}]);
  expect(r.after).toEqual([{out: false, display: 'none'}]);
  expect(r.back).toEqual([{out: false, display: ''}]);
  expect(r.left).toBe(0);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);

test('progress is clamped, a contenteditable container warns, and the last dispose unhooks the window', async () => {
  const {page, logs} = await open();
  const r = await page.evaluate(async () => {
    const w = window as any;
    const added: string[] = [];
    const removed: string[] = [];
    const add = window.addEventListener.bind(window);
    const remove = window.removeEventListener.bind(window);
    window.addEventListener = ((type: string, ...rest: any[]) => {
      added.push(type);
      return (add as any)(type, ...rest);
    }) as any;
    window.removeEventListener = ((type: string, ...rest: any[]) => {
      removed.push(type);
      return (remove as any)(type, ...rest);
    }) as any;
    const host = document.querySelector('#host') as HTMLElement;
    host.style.cssText = 'width:300px;height:200px';
    const editor = document.createElement('div');
    editor.contentEditable = 'true';
    editor.style.cssText = 'width:300px;height:200px';
    host.append(editor);
    const c = w.createPlushieCursor(null, {name: 'E', container: editor});
    const bar = c.element.querySelector('.pc-bar') as HTMLElement;
    const p = () => (bar.classList.contains('has') ? bar.firstElementChild!.getAttribute('style') : null);
    c.status({text: 'Working', progress: 1.7});
    const over = p();
    c.status({text: 'Working', progress: -0.3});
    const under = p();
    c.status({text: 'Working', progress: NaN});
    const nan = p();
    const d = w.createPlushieCursor(null, {name: 'D', container: host});
    c.dispose();
    const afterOne = removed.length;
    d.dispose();
    const windowed = (list: string[]) => list.filter(t => t === 'resize' || t === 'scroll');
    const afterBoth = windowed(removed).slice();
    // Mounting again listens again.
    w.createPlushieCursor(null, {name: 'F', container: host}).dispose();
    return {over, under, nan, added: windowed(added), afterOne, afterBoth, again: windowed(removed)};
  });
  expect(r.over).toBe('--p: 1;');
  expect(r.under).toBe('--p: 0;');
  expect(r.nan).toBeNull();
  expect(r.added).toEqual(['resize', 'scroll', 'resize', 'scroll']);
  expect(r.afterOne).toBe(0);
  expect(r.afterBoth).toEqual(['resize', 'scroll']);
  expect(r.again).toEqual(['resize', 'scroll', 'resize', 'scroll']);
  expect(logs.some(l => /container is contenteditable/.test(l))).toBe(true);
  expect(errors(logs)).toEqual([]);
  await page.close();
}, 60_000);
