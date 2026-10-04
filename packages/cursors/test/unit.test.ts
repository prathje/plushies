/** Pure parts: where a cursor hangs, and which ink reads on its colour. */
import {expect, test} from 'bun:test';
import {inks, parseColor} from '../src/dom';
import {createPlushieCursor, footprint, place, recoverMotion, separate, spots, type Bounds, type Claim, type MotionState} from '../src/index';

const bounds = {left: 0, top: 0, right: 400, bottom: 300};
const room = {x: 120, y: 40, up: 0};

test('hangs right and below when there is room', () => {
  expect(place({x: 100, y: 100}, null, bounds, room, 1, undefined)).toEqual({x: 100, y: 100, flipX: false, flipY: false});
});

test('mirrors near the right and bottom edges', () => {
  const at = place({x: 350, y: 280}, null, bounds, room, 1, undefined);
  expect([at.flipX, at.flipY]).toEqual([true, true]);
});

test('flips back only past the hysteresis', () => {
  const was = {x: 285, y: 100, flipX: true, flipY: false};
  // 285 + 120 = 405 > 400: stays flipped; 275 + 120 = 395 fits but within the 12 px slack.
  expect(place({x: 275, y: 100}, null, bounds, room, 1, was).flipX).toBe(true);
  expect(place({x: 260, y: 100}, null, bounds, room, 1, was).flipX).toBe(false);
});

test('when neither side fits, takes the side with more room', () => {
  const narrow = {left: 0, top: 0, right: 150, bottom: 300};
  expect(place({x: 40, y: 100}, null, narrow, room, 1, undefined).flipX).toBe(false);
  expect(place({x: 110, y: 100}, null, narrow, room, 1, undefined).flipX).toBe(true);
});

test('a plushie floating above the tip flips the cursor at the top edge', () => {
  const tall = {x: 120, y: 20, up: 40};
  // 30 − 40 < 0: the plushie would poke out above; hanging up puts it below the tip.
  expect(place({x: 100, y: 30}, null, bounds, tall, 1, undefined).flipY).toBe(true);
  expect(place({x: 100, y: 200}, null, bounds, tall, 1, undefined).flipY).toBe(false);
});

test('points at the bottom-right corner of a box, else another that fits', () => {
  const box = {left: 50, top: 50, width: 100, height: 60};
  expect(place(null, box, bounds, room, 1, undefined)).toEqual({x: 144, y: 104, flipX: false, flipY: false});
  const corner = {left: 300, top: 250, width: 80, height: 40};
  const at = place(null, corner, bounds, room, 1, undefined);
  expect(at).toEqual({x: 306, y: 256, flipX: true, flipY: true});
});

test('a box with no room beside it: the label hangs back over it from the corner, and unmirrors with hysteresis', () => {
  // 720 wide, the box 40 px from either edge; a label 256 wide fits on neither side.
  const wide = {left: 0, top: 0, right: 720, bottom: 400};
  const box = {left: 40, top: 150, width: 640, height: 40};
  const open = {x: 256, y: 96, up: 40};
  const at = place(null, box, wide, open, 1, undefined);
  expect(at).toEqual({x: 674, y: 184, flipX: true, flipY: false});
  // Shrunk back to a pill: 674 + 56 > 708 (the edge less the hysteresis) keeps it mirrored; 554 + 56 doesn't.
  const pill = {x: 56, y: 32, up: 40};
  expect(place(null, box, wide, pill, 1, at).flipX).toBe(true);
  expect(place(null, {...box, width: 520}, wide, pill, 1, at).flipX).toBe(false);
  // A narrower box with room on its left hangs left from its left corner instead.
  expect(place(null, {left: 400, top: 150, width: 280, height: 40}, wide, open, 1, undefined)).toEqual({x: 406, y: 184, flipX: true, flipY: false});
  // The same for a box as tall as the visible area: hang up over it from the bottom corner.
  const tall = {left: 100, top: 20, width: 100, height: 360};
  expect(place(null, tall, wide, {x: 100, y: 60, up: 10}, 1, undefined)).toEqual({x: 194, y: 374, flipX: false, flipY: true});
});

test('keeps the tip inside the visible area', () => {
  const at = place({x: 900, y: -50}, null, bounds, room, 1, undefined);
  expect([at.x, at.y]).toEqual([398, 2]);
});

const claim = (rank: number, options: ReturnType<typeof spots>, was?: Claim['was']): Claim => ({rank, options, room, vertical: 1, was});
const corner = (p: {flipX: boolean; flipY: boolean}) => [p.flipX, p.flipY];

test('footprint covers the label on the side it hangs, and what sticks out the other way', () => {
  const tall = {x: 120, y: 40, up: 30};
  expect(footprint({x: 100, y: 100, flipX: false, flipY: false}, tall, 1)).toEqual({left: 100, right: 220, top: 70, bottom: 140});
  expect(footprint({x: 100, y: 100, flipX: true, flipY: true}, tall, 1)).toEqual({left: -20, right: 100, top: 60, bottom: 130});
  // A design hanging above: flipped, it hangs below.
  expect(footprint({x: 100, y: 100, flipX: false, flipY: true}, tall, -1)).toEqual({left: 100, right: 220, top: 70, bottom: 140});
});

test('spots: the best first, then the corners and side middles that fit', () => {
  const box = {left: 140, top: 100, width: 100, height: 60};
  const all = spots(null, box, bounds, room, 1, undefined);
  expect(all[0]).toEqual({...place(null, box, bounds, room, 1, undefined), spot: 'bottom-right'});
  // The box is 60 tall and a footprint 40: the ring adds one spot up each side (46 px up from the bottom corners, down from the top ones).
  expect(all.map(p => p.spot)).toEqual(['bottom-right', 'bottom-left', 'top-right', 'top-left', 'right', 'left', 'bottom', 'top', 'bottom-right/y1', 'bottom-left/y1', 'top-right/y1', 'top-left/y1']);
  expect(all.slice(8).map(p => [p.x, p.y, ...corner(p)])).toEqual([
    [234, 108, false, false],
    [146, 108, true, false],
    [234, 152, false, true],
    [146, 152, true, true],
  ]);
  expect(all.slice(0, 8).map(p => [p.x, p.y, ...corner(p)])).toEqual([
    [234, 154, false, false],
    [146, 154, true, false],
    [234, 106, false, true],
    [146, 106, true, true],
    [234, 130, false, false],
    [146, 130, true, false],
    [190, 154, false, false],
    [190, 106, false, true],
  ]);
  // Near the right edge only the left-hanging ones fit.
  const edge = spots(null, {left: 300, top: 100, width: 80, height: 60}, bounds, room, 1, undefined);
  expect(edge.every(p => p.flipX)).toBe(true);
  // At a point: the other ways of hanging off it.
  expect(spots({x: 200, y: 150}, null, bounds, room, 1, undefined).map(corner)).toEqual([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]);
});

test('separate: the first there keeps its spot, the newcomer hangs the other way', () => {
  const box = {left: 140, top: 100, width: 100, height: 60};
  const options = spots(null, box, bounds, room, 1, undefined);
  const [older, newer] = separate([claim(2, options), claim(1, options)]).reverse();
  expect(older).toEqual(options[0]);
  expect(newer).toEqual(options[1]);
  expect(newer).not.toEqual(older);
});

test('separate: at a box, each takes the clear spot it reaches by moving least', () => {
  const box = {left: 140, top: 100, width: 100, height: 60};
  const options = spots(null, box, bounds, room, 1, undefined);
  const at = (x: number, y: number, flipX = false) => ({x, y, flipX, flipY: false});
  const near = (rank: number, from: Claim['from'], held?: string): Claim => ({...claim(rank, options), nearest: true, from, held});
  // Alone, from the top left: the top-left corner, not the bottom-right one.
  expect(separate([near(1, at(0, 0))])[0].spot).toBe('top-left');
  // From below on the right: the bottom-right one.
  expect(separate([near(1, at(380, 290, true))])[0].spot).toBe('bottom-right');
  // Two coming from the top left: the second takes the nearest spot left clear.
  const [first, second] = separate([near(1, at(0, 0)), near(2, at(0, 10))]);
  expect(first.spot).toBe('top-left');
  expect(['left', 'top', 'bottom-left', 'top-left/y1']).toContain(second.spot!);
  // Right above the box's middle: a top corner, not the top middle (the plushie would sit on the box).
  expect(separate([near(1, at(170, 40))])[0].spot).toMatch(/^top-(left|right)$/);
  // …unless nothing else is clear.
  const topLeft = options.filter(p => p.spot === 'top-left');
  const cornerOrMiddle = options.filter(p => p.spot === 'top-left' || p.spot === 'top');
  const [, fallback] = separate([{...claim(1, topLeft), nearest: true}, {...claim(2, cornerOrMiddle), nearest: true, from: at(150, 40)}]);
  expect(fallback.spot).toBe('top');
  // The spot it took on its way stays while clear, though another is nearer now.
  expect(separate([near(1, at(380, 290, true), 'top-left')])[0].spot).toBe('top-left');
  // Without a box, the best spot still comes first when clear.
  const point = spots({x: 200, y: 150}, null, bounds, room, 1, undefined);
  expect(separate([{...claim(1, point), from: at(390, 150, true)}])[0]).toEqual(point[0]);
});

test('separate: far apart, both keep their best spot', () => {
  const a = spots({x: 20, y: 20}, null, bounds, room, 1, undefined);
  const b = spots({x: 20, y: 200}, null, bounds, room, 1, undefined);
  expect(separate([claim(1, a), claim(2, b)])).toEqual([a[0], b[0]]);
});

test('separate: a point target hangs the other way off its point', () => {
  const a = spots({x: 200, y: 150}, null, bounds, room, 1, undefined);
  const b = spots({x: 210, y: 160}, null, bounds, room, 1, undefined);
  const [, second] = separate([claim(1, a), claim(2, b)]);
  expect([second.x, second.y]).toEqual([210, 160]);
  expect(corner(second)).not.toEqual([false, false]);
});

test('separate: with no clear spot, takes the one that overlaps least', () => {
  const tiny = {left: 0, top: 0, right: 130, bottom: 50};
  const a = spots({x: 5, y: 5}, null, tiny, room, 1, undefined);
  const b = spots({x: 6, y: 6}, null, tiny, room, 1, undefined);
  const [first, second] = separate([claim(1, a), claim(2, b)]);
  expect(first).toEqual(a[0]);
  expect(second).toEqual(b[0]);
});

test('separate: back on the best spot only once clear by the hysteresis', () => {
  // The first one's footprint: x 50..170, y 50..90.
  const a = spots({x: 50, y: 50}, null, bounds, room, 1, undefined);
  // 12 px to its right and 10 px lower: clear by the gap, not by the gap + hysteresis.
  const b = spots({x: 182, y: 100}, null, bounds, room, 1, undefined);
  const away = b.find(p => p.flipY && !p.flipX)!;
  expect(separate([claim(1, a), claim(2, b, away)])[1]).toEqual(away);
  expect(separate([claim(1, a), claim(2, b)])[1]).toEqual(b[0]);
  const far = spots({x: 190, y: 100}, null, bounds, room, 1, undefined);
  expect(separate([claim(1, a), claim(2, far, away)])[1]).toEqual(far[0]);
});

const GAP = 6;
const clear = (a: Bounds, b: Bounds) => Math.min(a.right, b.right) + GAP <= Math.max(a.left, b.left) || Math.min(a.bottom, b.bottom) + GAP <= Math.max(a.top, b.top);
/** Every pair of chosen footprints that overlaps, as 'i-j'. */
const collisions = (picks: ReturnType<typeof separate>, rooms: Claim['room'][]) => {
  const fps = picks.map((p, i) => footprint(p, rooms[i], 1));
  return fps.flatMap((a, i) => fps.slice(i + 1).map((b, j) => (clear(a, b) ? null : `${i}-${i + 1 + j}`)).filter(Boolean));
};
/** `n` cursors arriving from below right at `box`, in rank order. */
const pile = (n: number, box: Parameters<typeof spots>[1], room: Claim['room'], area: Bounds) =>
  Array.from({length: n}, (_, i): Claim => ({rank: i + 1, options: spots(null, box, area, room, 1, undefined), room, vertical: 1, nearest: true, from: {x: 900 + 20 * i, y: 500 + 20 * i, flipX: false, flipY: false}}));

test('separate: three and four cursors on one small box', () => {
  const area = {left: 0, top: 0, right: 1250, bottom: 560};
  const cell = {left: 600, top: 270, width: 54, height: 26};
  // A flat footprint (island, the capsule below the tip): the four corners are all clear of each other.
  const island = {x: 180, y: 70, up: 4};
  for (const n of [3, 4]) {
    const picks = separate(pile(n, cell, island, area));
    expect(new Set(picks.map(p => p.spot)).size).toBe(n);
    expect(collisions(picks, picks.map(() => island))).toEqual([]);
  }
  // Live with a plushie: 30 px stick up above the tip, so a footprint hanging
  // up from the top corner (bottom at 276 + 30) meets one hanging down from
  // the bottom corner (top at 290 − 30): only the two sides are clear. The
  // third and fourth take distinct spots and pile on different cursors.
  const live = {x: 130, y: 50, up: 30};
  const three = separate(pile(3, cell, live, area));
  expect(new Set(three.map(p => p.spot)).size).toBe(3);
  expect(collisions(three.slice(0, 2), [live, live])).toEqual([]);
  const four = separate(pile(4, cell, live, area));
  expect(new Set(four.map(p => p.spot)).size).toBe(4);
  const hits = collisions(four, four.map(() => live));
  expect(hits.length).toBe(2);
  expect(hits).toEqual(['0-2', '1-3']);
});

test('separate: the ring along a wide box seats more cursors clear of each other', () => {
  const area = {left: 0, top: 0, right: 1250, bottom: 560};
  const headline = {left: 300, top: 200, width: 600, height: 26};
  const live = {x: 130, y: 50, up: 30};
  const all = spots(null, headline, area, live, 1, undefined);
  expect(all.map(p => p.spot)).toContain('bottom-right/x1');
  expect(all.map(p => p.spot)).toContain('top-left/x1');
  // One ring (RING is 1): 16 candidates at most.
  expect(all.length).toBeLessThanOrEqual(16);
  // Along the bottom edge: the two corners, one ring spot in from each, and the middle;
  // the top edge's spots all meet them (the box is 26 tall, the footprints 80).
  for (const n of [3, 4, 5]) {
    const picks = separate(pile(n, headline, live, area));
    expect(new Set(picks.map(p => p.spot)).size).toBe(n);
    expect(collisions(picks, picks.map(() => live))).toEqual([]);
  }
});

test('separate: two cursors on adjacent cells', () => {
  const area = {left: 0, top: 0, right: 1250, bottom: 560};
  const cells = [{left: 600, top: 270, width: 54, height: 26}, {left: 654, top: 270, width: 54, height: 26}];
  const island = {x: 180, y: 70, up: 4};
  const two = (room: Claim['room']) => cells.map((cell, i) => pile(1, cell, room, area)[0]).map((c, i) => ({...c, rank: i + 1}));
  const picks = separate(two(island));
  expect(collisions(picks, [island, island])).toEqual([]);
  // Live: the second cell's edges are all within 130 px of the first cursor's
  // label, so the second overlaps it somewhere; it picks the spot that overlaps least.
  const live = {x: 130, y: 50, up: 30};
  const [a, b] = separate(two(live));
  expect(a.spot).toBe('bottom-right');
  expect(b.spot).toBe('top-left');
});

test('createPlushieCursor without a document says so', () => {
  expect(() => createPlushieCursor(null, {name: 'Pip'})).toThrow(/needs a browser \(document is not defined\)/);
});

test('ink: whichever reads better on the colour', () => {
  expect(inks('#7c3aed').ink).toBe('#fff');
  expect(inks('#f47c9a').ink).not.toBe('#fff');
  expect(inks('#f5c518').ink).not.toBe('#fff');
  expect(inks('#fc0').ink).not.toBe('#fff');
  expect(parseColor('#fc0')).toEqual([255, 204, 0]);
  expect(parseColor('#ffcc0080')).toEqual([255, 204, 0]);
});

const spring = (x: number, y: number, vx = 0, vy = 0) => ({x, y, vx, vy});
const motion = (m: MotionState) => m;

test('recoverMotion leaves finite motion alone', () => {
  const m = motion({aim: spring(10, 20, 1, 2), tip: spring(11, 21, 3, 4), goal: {x: 30, y: 40}, body: spring(50, 60, 5, 6)});
  const before = JSON.parse(JSON.stringify(m));
  expect(recoverMotion(m, bounds)).toBe(false);
  expect(m).toEqual(before);
  expect(recoverMotion({...m, body: null}, null)).toBe(false);
});

test('recoverMotion restarts at rest where the tip was, else at the goal, else mid-bounds, else the origin', () => {
  const tipNaNVelocity = motion({aim: spring(NaN, 20), tip: spring(11, 21, NaN, 4), goal: {x: 30, y: 40}, body: spring(NaN, NaN)});
  expect(recoverMotion(tipNaNVelocity, bounds)).toBe(true);
  expect(tipNaNVelocity).toEqual({aim: spring(11, 21), tip: spring(11, 21), goal: {x: 11, y: 21}, body: null});

  const tipGone = motion({aim: spring(1, 2), tip: spring(NaN, Infinity), goal: {x: 30, y: 40}, body: null});
  expect(recoverMotion(tipGone, bounds)).toBe(true);
  expect(tipGone.tip).toEqual(spring(30, 40));

  const allGone = motion({aim: spring(NaN, NaN), tip: spring(NaN, NaN), goal: {x: NaN, y: NaN}, body: spring(NaN, NaN)});
  expect(recoverMotion(allGone, bounds)).toBe(true);
  expect(allGone.tip).toEqual(spring(200, 150));

  const noBounds = motion({aim: spring(NaN, NaN), tip: spring(NaN, NaN), goal: {x: NaN, y: NaN}, body: null});
  expect(recoverMotion(noBounds, null)).toBe(true);
  expect(noBounds.tip).toEqual(spring(0, 0));
  expect(noBounds.goal).toEqual({x: 0, y: 0});
});

test('recoverMotion catches a body that went non-finite on its own', () => {
  const m = motion({aim: spring(1, 2), tip: spring(1, 2), goal: {x: 1, y: 2}, body: spring(5, NaN, 0, 0)});
  expect(recoverMotion(m, bounds)).toBe(true);
  expect(m.body).toBeNull();
  expect(m.tip).toEqual(spring(1, 2));
});
