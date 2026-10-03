/** Pure parts: where a cursor hangs, and which ink reads on its colour. */
import {expect, test} from 'bun:test';
import {inks, parseColor} from '../src/dom';
import {place} from '../src/index';

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

test('keeps the tip inside the visible area', () => {
  const at = place({x: 900, y: -50}, null, bounds, room, 1, undefined);
  expect([at.x, at.y]).toEqual([398, 2]);
});

test('ink: whichever reads better on the colour', () => {
  expect(inks('#7c3aed').ink).toBe('#fff');
  expect(inks('#f47c9a').ink).not.toBe('#fff');
  expect(inks('#f5c518').ink).not.toBe('#fff');
  expect(inks('#fc0').ink).not.toBe('#fff');
  expect(parseColor('#fc0')).toEqual([255, 204, 0]);
  expect(parseColor('#ffcc0080')).toEqual([255, 204, 0]);
});
