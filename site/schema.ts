/**
 * One description of every option and pose field. The editor builds its
 * controls from it, the docs build the options table from it, and share links
 * and code snippets are encoded with it.
 */
import {
  DEFAULT_OPTIONS,
  DEFAULT_POSE,
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
  ACCESSORY_COLORS,
  fabricFur,
} from '../src/index';
import type {Look} from './looks';

export type Where = 'look' | 'pose';
export type PoseKey = 'lookX' | 'lookY' | 'blink' | 'squash' | 'lean' | 'turn' | 'float';

export interface EditorState {
  look: Look;
  pose: Partial<Record<PoseKey, number>>;
  idle: boolean;
  follow: boolean;
}

interface Base {
  key: string;
  label: string;
  doc: string;
  where: Where;
  /** Only shown when this returns true. */
  when?: (look: Look) => boolean;
}
export interface ChoiceField extends Base {
  type: 'choice';
  options: readonly string[];
  default: string;
}
export interface RangeField extends Base {
  type: 'range';
  min: number;
  max: number;
  step: number;
  default: number | ((look: Look) => number);
  /** Left out by default (resolved from other options). */
  auto?: boolean;
  unit?: string;
}
export interface ToggleField extends Base {
  type: 'toggle';
  default: boolean;
}
export interface ColorField extends Base {
  type: 'color';
  default: string | ((look: Look) => string);
  /** No fixed default: follows another option until set. */
  auto?: boolean;
  swatches?: readonly string[];
}
export interface ShapeField extends Base {
  type: 'shape';
  options: readonly string[];
  default: string;
}
export type Field = ChoiceField | RangeField | ToggleField | ColorField | ShapeField;

export interface Group {
  id: string;
  title: string;
  fields: Field[];
}

const D = DEFAULT_OPTIONS;
const worn = (value: string | undefined) => !!value && value !== 'none';

export const GROUPS: Group[] = [
  {
    id: 'shape',
    title: 'Shape',
    fields: [
      {type: 'shape', key: 'kind', label: 'Silhouette', where: 'look', options: PLUSHIE_KINDS, default: D.kind, doc: 'Body silhouette.'},
      {type: 'range', key: 'roundness', label: 'Roundness', where: 'look', min: 0, max: 1, step: 0.01, default: D.roundness, doc: 'How soft the corners are.'},
      {
        type: 'range', key: 'sides', label: 'Points', where: 'look', min: 3, max: 12, step: 1,
        default: look => (look.kind === 'star' ? 5 : 6), auto: true,
        when: look => look.kind === 'polygon' || look.kind === 'star' || look.kind === 'flower',
        doc: 'Corners of a polygon (6), points of a star (5), petals of a flower (6).',
      },
      {type: 'range', key: 'starInner', label: 'Star depth', where: 'look', min: 0.2, max: 0.9, step: 0.01, default: D.starInner, when: look => look.kind === 'star', doc: 'Inner radius of a star, 0.2..0.9.'},
      {type: 'range', key: 'seed', label: 'Blob seed', where: 'look', min: 1, max: 40, step: 1, default: D.seed, when: look => look.kind === 'blob', doc: 'Each seed is a different blob.'},
      {type: 'range', key: 'thickness', label: 'Stuffing', where: 'look', min: 0.15, max: 0.8, step: 0.01, default: D.thickness, doc: 'How thick the pillow is, relative to its half-width.'},
    ],
  },
  {
    id: 'fur',
    title: 'Fur & colour',
    fields: [
      {type: 'color', key: 'color', label: 'Colour', where: 'look', default: DEFAULT_POSE.color as string, doc: 'Fur colour (a pose field: cheap to change every frame).'},
      {type: 'choice', key: 'fabric', label: 'Fabric', where: 'look', options: PLUSHIE_FABRICS, default: D.fabric, doc: 'Fabric preset: fur length, grain and sheen.'},
      {
        type: 'range', key: 'fur', label: 'Fur length', where: 'look', min: 0, max: 0.16, step: 0.002,
        default: look => fabricFur(look.fabric), auto: true, doc: 'Fur length as a fraction of the half-width (a pose field).',
      },
      {type: 'range', key: 'furGrain', label: 'Strand size', where: 'look', min: 0.3, max: 2.5, step: 0.05, default: 1, auto: true, doc: 'Strand size multiplier; smaller is finer, denser fur.'},
    ],
  },
  {
    id: 'face',
    title: 'Face',
    fields: [
      {type: 'choice', key: 'eyes', label: 'Eyes', where: 'look', options: PLUSHIE_EYES, default: D.eyes, doc: 'Eye style.'},
      {type: 'range', key: 'eyeSize', label: 'Eye size', where: 'look', min: 0.5, max: 1.8, step: 0.01, default: D.eyeSize, doc: 'Eye size multiplier.'},
      {type: 'range', key: 'eyeSpacing', label: 'Eye spacing', where: 'look', min: 0.5, max: 1.6, step: 0.01, default: D.eyeSpacing, doc: 'Distance between the eyes, multiplier.'},
      {type: 'range', key: 'faceY', label: 'Face height', where: 'look', min: -0.6, max: 0.6, step: 0.01, default: D.faceY, doc: 'Moves the face up (+) or down (−).'},
      {type: 'choice', key: 'mouth', label: 'Mouth', where: 'look', options: PLUSHIE_MOUTHS, default: D.mouth, doc: 'Mouth style.'},
      {type: 'toggle', key: 'cheeks', label: 'Blush', where: 'look', default: D.cheeks, doc: 'Blush discs under the eyes.'},
      {type: 'choice', key: 'moustache', label: 'Moustache', where: 'look', options: PLUSHIE_MOUSTACHES, default: D.moustache, doc: 'Moustache over the mouth.'},
      {
        type: 'color', key: 'moustacheColor', label: 'Moustache colour', where: 'look', auto: true,
        default: look => look.featureColor ?? D.featureColor, when: look => worn(look.moustache), doc: 'Moustache colour (default: feature colour).',
      },
      {type: 'color', key: 'cheekColor', label: 'Blush colour', where: 'look', default: D.cheekColor, when: look => !!look.cheeks, doc: 'Blush colour.'},
      {type: 'choice', key: 'finish', label: 'Finish', where: 'look', options: PLUSHIE_FINISHES, default: D.finish, doc: 'Surface of eyes, mouth, moustache, glasses, neckwear and pins.'},
      {type: 'color', key: 'featureColor', label: 'Feature colour', where: 'look', default: D.featureColor, doc: 'Eyes, mouth and eyebrows.'},
    ],
  },
  {
    id: 'wear',
    title: 'Accessories',
    fields: [
      {type: 'choice', key: 'glasses', label: 'Glasses', where: 'look', options: PLUSHIE_GLASSES, default: D.glasses, doc: 'Glasses.'},
      {
        type: 'color', key: 'glassesColor', label: 'Frame colour', where: 'look', auto: true,
        default: look => look.featureColor ?? D.featureColor, when: look => !!look.glasses && look.glasses !== 'none', doc: 'Glasses frame colour (default: feature colour).',
      },
      {type: 'choice', key: 'hat', label: 'Hat', where: 'look', options: PLUSHIE_HATS, default: D.hat, doc: 'Hat. Shapes without a top in the middle wear it on a tip.'},
      {type: 'range', key: 'hatSize', label: 'Hat size', where: 'look', min: 0.5, max: 1.6, step: 0.01, default: D.hatSize, when: look => worn(look.hat), doc: 'Hat size multiplier.'},
      {
        type: 'color', key: 'hatColor', label: 'Hat colour', where: 'look', auto: true,
        default: look => ACCESSORY_COLORS.hat[look.hat ?? 'none'] ?? look.accentColor ?? D.accentColor, when: look => worn(look.hat), doc: 'Hat colour (each hat has its own default).',
      },
      {type: 'choice', key: 'neck', label: 'Neck', where: 'look', options: PLUSHIE_NECKS, default: D.neck, doc: 'Bow tie at the bottom edge, or a necktie under the mouth.'},
      {
        type: 'color', key: 'neckColor', label: 'Neck colour', where: 'look', auto: true,
        default: look => (look.neck === 'bowtie' ? look.featureColor ?? D.featureColor : ACCESSORY_COLORS.neck[look.neck ?? 'none'] ?? look.accentColor ?? D.accentColor),
        when: look => worn(look.neck), doc: 'Neckwear colour (the bow tie follows the feature colour).',
      },
      {type: 'choice', key: 'pin', label: 'Pin', where: 'look', options: PLUSHIE_PINS, default: D.pin, doc: 'Flower, bow or heart on the head; star or badge on the chest.'},
      {
        type: 'color', key: 'pinColor', label: 'Pin colour', where: 'look', auto: true,
        default: look => ACCESSORY_COLORS.pin[look.pin ?? 'none'] ?? look.accentColor ?? D.accentColor, when: look => worn(look.pin), doc: 'Pin colour (each pin has its own default).',
      },
      {
        type: 'color', key: 'accentColor', label: 'Accent colour', where: 'look', default: D.accentColor,
        when: look => worn(look.hat) || look.neck === 'necktie' || look.pin === 'badge', doc: 'Hat bands and tassels, party-hat stripes, jewels, necktie stripes, the badge.',
      },
    ],
  },
  {
    id: 'pose',
    title: 'Pose',
    fields: [
      {type: 'range', key: 'lookX', label: 'Look ← →', where: 'pose', min: -1, max: 1, step: 0.01, default: 0, doc: 'Eye direction, −1 left .. 1 right.'},
      {type: 'range', key: 'lookY', label: 'Look ↑ ↓', where: 'pose', min: -1, max: 1, step: 0.01, default: 0, doc: 'Eye direction, −1 up .. 1 down.'},
      {type: 'range', key: 'blink', label: 'Blink', where: 'pose', min: 0, max: 1, step: 0.01, default: 0, doc: '0 open .. 1 closed.'},
      {type: 'range', key: 'squash', label: 'Squash', where: 'pose', min: -1, max: 1, step: 0.01, default: 0, doc: '+1 squashed .. −1 stretched, volume preserving.'},
      {type: 'range', key: 'lean', label: 'Lean', where: 'pose', min: -30, max: 30, step: 0.5, default: 0, unit: '°', doc: 'Lean in degrees about the bottom.'},
      {type: 'range', key: 'turn', label: 'Turn', where: 'pose', min: -180, max: 180, step: 1, default: 0, unit: '°', doc: 'Turn about the vertical axis in degrees.'},
      {type: 'range', key: 'float', label: 'Float', where: 'pose', min: 0, max: 2.5, step: 0.01, default: 1, doc: 'How far eyes and accessories float off the body.'},
    ],
  },
  {
    id: 'stage',
    title: 'Stage',
    fields: [
      {type: 'toggle', key: 'shadow', label: 'Contact shadow', where: 'look', default: D.shadow, doc: 'Soft shadow under the body.'},
      {type: 'range', key: 'headroom', label: 'Headroom', where: 'look', min: 0, max: 0.6, step: 0.01, default: D.headroom, doc: 'Free space above for hops and hats, fraction of body height.'},
    ],
  },
];

export const FIELDS: Field[] = GROUPS.flatMap(g => g.fields);
export const FIELD = new Map(FIELDS.map(f => [f.key, f]));
export const POSE_KEYS = FIELDS.filter(f => f.where === 'pose').map(f => f.key as PoseKey);

export function resolveDefault(field: Field, look: Look): string | number | boolean {
  return typeof field.default === 'function' ? field.default(look) : field.default;
}

/** Look options that differ from their defaults, in schema order (what a snippet needs). */
export function lookDiff(look: Look): [string, string | number | boolean][] {
  const out: [string, string | number | boolean][] = [];
  for (const field of FIELDS) {
    if (field.where !== 'look') continue;
    const value = (look as Record<string, unknown>)[field.key] as string | number | boolean | undefined;
    if (value === undefined) continue;
    if (!('auto' in field && field.auto) && value === resolveDefault(field, look)) continue;
    out.push([field.key, value]);
  }
  return out;
}

export function poseDiff(pose: EditorState['pose']): [string, number][] {
  return POSE_KEYS.flatMap(key => {
    const field = FIELD.get(key)!;
    const value = pose[key];
    return value === undefined || value === field.default ? [] : [[key, value] as [string, number]];
  });
}

// ---------------------------------------------------------------------------
// Share links: #kind=heart&color=f47c9a&hat=crown&lookX=0.3

export function encodeState(state: EditorState): string {
  const q = new URLSearchParams();
  for (const [key, value] of [...lookDiff(state.look), ...poseDiff(state.pose)]) {
    q.set(key, typeof value === 'string' ? value.replace(/^#/, '') : typeof value === 'boolean' ? (value ? '1' : '0') : String(value));
  }
  if (!state.idle) q.set('idle', '0');
  if (!state.follow) q.set('follow', '0');
  return q.toString();
}

export function decodeState(hash: string): EditorState | null {
  const q = new URLSearchParams(hash.replace(/^#/, ''));
  // Links from before `neck` existed.
  if (q.get('bowtie') === '1' && !q.has('neck')) q.set('neck', 'bowtie');
  if (q.has('bowtieColor') && !q.has('neckColor')) q.set('neckColor', q.get('bowtieColor')!);
  if (![...q.keys()].some(key => FIELD.has(key))) return null;
  const state: EditorState = {look: {}, pose: {}, idle: q.get('idle') !== '0', follow: q.get('follow') !== '0'};
  for (const [key, raw] of q) {
    const field = FIELD.get(key);
    if (!field) continue;
    let value: string | number | boolean | undefined;
    if (field.type === 'range') {
      const n = Number(raw);
      if (Number.isFinite(n)) value = Math.max(field.min, Math.min(field.max, n));
    } else if (field.type === 'toggle') {
      value = raw === '1' || raw === 'true';
    } else if (field.type === 'color') {
      if (/^[0-9a-f]{3,8}$/i.test(raw)) value = `#${raw.toLowerCase()}`;
    } else if (field.options.includes(raw)) {
      value = raw;
    }
    if (value === undefined) continue;
    if (field.where === 'pose') state.pose[key as PoseKey] = value as number;
    else (state.look as Record<string, unknown>)[key] = value;
  }
  return state;
}
