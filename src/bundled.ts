/**
 * Batteries included: the same API with three.js bundled in, so there is
 * nothing to wire up. Use this when your page doesn't already load three.
 *
 *   import {mountPlushie} from 'plushies/bundled';
 *   mountPlushie(document.querySelector('#hero'), {kind: 'star', idle: true});
 *
 * If your app already uses three, import 'plushies' / 'plushies/viewer'
 * instead and pass your copy — two copies of three on one page don't mix.
 */
import * as THREE from 'three';
import {createPlushie as createWith, type Plushie, type PlushieOptions, type PlushiePose} from './index.js';
import {mountPlushie as mountWith, type PlushieViewer, type ViewerOptions} from './viewer.js';

export {
  ACCESSORY_COLORS,
  DEFAULT_OPTIONS,
  DEFAULT_POSE,
  MAX_FUR_SHELLS,
  PLUSHIE_EYES,
  PLUSHIE_FABRICS,
  PLUSHIE_FINISHES,
  PLUSHIE_GLASSES,
  PLUSHIE_HATS,
  PLUSHIE_KINDS,
  PLUSHIE_MOUSTACHES,
  PLUSHIE_MOUTHS,
  PLUSHIE_NECKS,
  PLUSHIE_PINS,
  fabricFur,
  fabricGrain,
  plushieOutline,
} from './index.js';
export type * from './index.js';
export {easeIn, easeInOut, easeOut} from './viewer.js';
export type {Easing, PlushieViewer, ViewerLook, ViewerOptions} from './viewer.js';
export {THREE};

/** Build a plushie for your own scene (uses the bundled three). */
export function createPlushie(options: PlushieOptions & Partial<PlushiePose> = {}): Plushie {
  return createWith(THREE, options);
}

/** Mount a plushie filling `container`. */
export function mountPlushie(container: HTMLElement, options: ViewerOptions = {}): PlushieViewer {
  return mountWith(container, THREE, options);
}
