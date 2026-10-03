import type {PlushieOptions} from '../src/index';

export interface Look extends Omit<PlushieOptions, 'renderer' | 'lights'> {
  color?: string;
  fur?: number;
}

export interface NamedLook {
  name: string;
  look: Look;
}

/** The editor's starting plushie. */
export const HERO_LOOK: Look = {
  kind: 'heart',
  color: '#f47c9a',
  fabric: 'plush',
  eyes: 'oval',
  mouth: 'smile',
  cheeks: true,
  glasses: 'round',
  finish: 'matte',
};

export const GALLERY: NamedLook[] = [
  {name: 'Butterbean', look: {kind: 'bean', color: '#f2b33d', eyes: 'happy', mouth: 'smile', cheeks: true, hat: 'beanie', hatColor: '#1f5f5b'}},
  {name: 'Nap Cloud', look: {kind: 'cloud', color: '#7cc4f4', fabric: 'fleece', eyes: 'sleepy', mouth: 'smile', glasses: 'round'}},
  {name: 'Boo-bah', look: {kind: 'ghost', color: '#c98bf2', fabric: 'shaggy', eyes: 'googly', mouth: 'open', hat: 'party'}},
  {name: 'Professor Moss', look: {kind: 'squircle', color: '#8fd19e', fabric: 'felt', finish: 'felt', eyes: 'dot', mouth: 'flat', glasses: 'monocle', hat: 'top'}},
  {name: 'Tangerine Supreme', look: {kind: 'star', color: '#ffb35c', eyes: 'ring', mouth: 'grin', glasses: 'shades', hat: 'crown'}},
  {name: 'Sleepy Moon', look: {kind: 'arch', color: '#f6e3b8', fabric: 'velvet', eyes: 'sleepy', mouth: 'cat', cheeks: true, neck: 'bowtie', neckColor: '#5b3fb0'}},
  {name: 'Sir Biscuit', look: {kind: 'circle', color: '#d9a66b', fabric: 'fleece', eyes: 'dot', mouth: 'smile', moustache: 'curly', glasses: 'round', hat: 'top', neck: 'necktie'}},
  {name: 'Valentine', look: {kind: 'heart', color: '#e8574f', fabric: 'velvet', eyes: 'oval', mouth: 'cat', cheeks: true, hat: 'cowboy', pin: 'flower'}},
  {name: 'Champ', look: {kind: 'egg', color: '#7cc4f4', eyes: 'happy', mouth: 'grin', hat: 'cap', pin: 'star'}},
];

export const FOOTER_LOOK: Look = {kind: 'drop', color: '#7cc4f4', fabric: 'fleece', eyes: 'sleepy', mouth: 'smile', headroom: 0.05, shadow: false};

/** Swatches offered in the editor. */
export const SWATCHES = [
  '#f2b33d', '#ffb35c', '#f47c9a', '#e8574f', '#c98bf2', '#7cc4f4',
  '#5b8def', '#8fd19e', '#3e9b7a', '#f6e3b8', '#ffffff', '#8a6a52', '#3a3530',
];
