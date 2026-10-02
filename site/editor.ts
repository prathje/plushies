import * as THREE from 'three';
import {
  PLUSHIE_EYES,
  PLUSHIE_FABRICS,
  PLUSHIE_GLASSES,
  PLUSHIE_HATS,
  PLUSHIE_KINDS,
  PLUSHIE_MOUSTACHES,
  PLUSHIE_MOUTHS,
  PLUSHIE_NECKS,
  PLUSHIE_PINS,
  plushieOutline,
  type PlushieKind,
} from '../src/index';
import {mountPlushie, type PlushieViewer} from '../src/viewer';
import {FLAVORS, highlight, snippet, type Flavor} from './code';
import {HERO_LOOK, SWATCHES, type Look} from './looks';
import {
  FIELD,
  GROUPS,
  POSE_KEYS,
  decodeState,
  encodeState,
  resolveDefault,
  type EditorState,
  type Field,
  type PoseKey,
} from './schema';
import {copyText, plushVars, reducedMotion, tabs} from './ui';

export interface Editor {
  load(look: Look): void;
}

const fixed = (v: number, step: number) => v.toFixed(step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3);

/** SVG path of a silhouette in a −1.1..1.1 box (y down). */
export function outlinePath(kind: PlushieKind, look: Look = {}): string {
  const points = plushieOutline(kind, {
    roundness: look.roundness,
    sides: kind === look.kind ? look.sides : undefined,
    starInner: kind === 'star' ? look.starInner : undefined,
    seed: kind === 'blob' ? look.seed : undefined,
  });
  return `M${points.map(([x, y]) => `${x.toFixed(3)} ${(-y).toFixed(3)}`).join('L')}Z`;
}

export function createEditor(root: {
  stage: HTMLElement;
  host: HTMLElement;
  controls: HTMLFormElement;
  tabs: HTMLElement;
  code: HTMLElement;
  codeCopy: HTMLButtonElement;
  share: HTMLInputElement;
  shareCopy: HTMLButtonElement;
}): Editor {
  const initial = decodeState(location.search);
  let state: EditorState = initial ?? {look: {...HERO_LOOK}, pose: {}, idle: !reducedMotion(), follow: true};
  let flavor: Flavor = 'npm';

  const view: PlushieViewer = mountPlushie(root.host, THREE, {
    ...state.look,
    ...state.pose,
    idle: state.idle,
    followPointer: state.follow,
  });
  view.canvas.addEventListener('click', () => void view.hop(60));

  // -------------------------------------------------------------------------
  // Controls, built from the schema.

  const syncers: (() => void)[] = [];
  const valueOf = (field: Field) => {
    const raw = field.where === 'pose' ? state.pose[field.key as PoseKey] : (state.look as Record<string, unknown>)[field.key];
    return (raw ?? resolveDefault(field, state.look)) as string | number | boolean;
  };
  const isAuto = (field: Field) => (state.look as Record<string, unknown>)[field.key] === undefined;

  for (const group of GROUPS) {
    const details = el('details', {class: `group group-${group.id}`}) as HTMLDetailsElement;
    details.open = group.id !== 'stage';
    details.append(el('summary', {}, el('span', {}, group.title)));
    const body = el('div', {class: 'group-body'});
    details.append(body);
    for (const field of group.fields) body.append(control(field));
    if (group.id === 'pose') {
      body.append(
        toggleRow('Idle animation', () => state.idle, on => {
          state.idle = on;
          view.setIdle(on);
        }),
        toggleRow('Eyes follow the pointer', () => state.follow, on => {
          state.follow = on;
          view.setFollowPointer(on);
        }),
      );
    }
    root.controls.append(details);
  }

  function control(field: Field): HTMLElement {
    const id = `opt-${field.key}`;
    const row = el('div', {class: `field field-${field.type}`, 'data-key': field.key});
    const sync: (() => void)[] = [() => (row.hidden = field.when ? !field.when(state.look) : false)];

    if (field.type === 'shape') {
      row.append(el('span', {class: 'field-label', id: `${id}-label`}, field.label));
      const grid = el('div', {class: 'shape-grid', role: 'radiogroup', 'aria-labelledby': `${id}-label`});
      for (const kind of field.options as PlushieKind[]) {
        const path = el('path', {}, undefined, true);
        const svg = el('svg', {viewBox: '-1.15 -1.15 2.3 2.3', 'aria-hidden': 'true'}, path, true);
        const tile = el('button', {type: 'button', class: 'shape-tile', role: 'radio', title: kind}, svg, el('span', {class: 'shape-name'}, kind));
        tile.addEventListener('click', () => update(field, kind));
        grid.append(tile);
        sync.push(() => {
          const on = state.look.kind === kind || (!state.look.kind && kind === 'circle');
          tile.setAttribute('aria-checked', String(on));
          tile.tabIndex = on ? 0 : -1;
          path.setAttribute('d', outlinePath(kind, state.look));
        });
      }
      radioKeys(grid);
      row.append(grid);
    } else if (field.type === 'choice') {
      row.append(el('span', {class: 'field-label', id: `${id}-label`}, field.label));
      const seg = el('div', {class: 'seg', role: 'radiogroup', 'aria-labelledby': `${id}-label`});
      for (const option of field.options) {
        const input = el('input', {type: 'radio', name: id, value: option}) as HTMLInputElement;
        input.addEventListener('change', () => input.checked && update(field, option));
        seg.append(el('label', {class: 'seg-option'}, input, el('span', {}, option)));
        sync.push(() => (input.checked = valueOf(field) === option));
      }
      row.append(seg);
    } else if (field.type === 'range') {
      const output = el('output', {for: id});
      const input = el('input', {type: 'range', id, min: String(field.min), max: String(field.max), step: String(field.step)}) as HTMLInputElement;
      const head = el('div', {class: 'field-head'}, el('label', {for: id, class: 'field-label'}, field.label), output);
      input.addEventListener('input', () => update(field, Number(input.value)));
      row.append(head, input);
      if (field.auto) {
        const auto = el('button', {type: 'button', class: 'auto-chip', title: 'Use the default'}, 'auto');
        auto.addEventListener('click', () => update(field, undefined));
        head.append(auto);
        sync.push(() => auto.setAttribute('aria-pressed', String(isAuto(field))));
      }
      sync.push(() => {
        const v = Number(valueOf(field));
        input.value = String(v);
        input.style.setProperty('--p', `${((v - field.min) / (field.max - field.min)) * 100}%`);
        output.textContent = `${fixed(v, field.step)}${field.unit ?? ''}`;
      });
    } else if (field.type === 'toggle') {
      row.append(
        toggleRow(field.label, () => Boolean(valueOf(field)), on => update(field, on), false),
      );
    } else if (field.type === 'color') {
      row.append(el('span', {class: 'field-label', id: `${id}-label`}, field.label));
      const wrap = el('div', {class: 'colors', role: 'group', 'aria-labelledby': `${id}-label`});
      if (field.key === 'color') {
        for (const swatch of SWATCHES) {
          const b = el('button', {type: 'button', class: 'swatch', title: swatch, 'aria-label': swatch, style: `--c: ${swatch}`});
          b.addEventListener('click', () => update(field, swatch));
          wrap.append(b);
          sync.push(() => b.setAttribute('aria-pressed', String(String(valueOf(field)).toLowerCase() === swatch)));
        }
      }
      const picker = el('input', {type: 'color', 'aria-label': `${field.label}: custom`}) as HTMLInputElement;
      const hex = el('span', {class: 'color-hex'});
      const custom = el('label', {class: field.key === 'color' ? 'swatch swatch-custom' : 'color-pick'}, picker, field.key === 'color' ? '' : hex);
      picker.addEventListener('input', () => update(field, picker.value));
      wrap.append(custom);
      if (field.auto) {
        const auto = el('button', {type: 'button', class: 'auto-chip', title: 'Use the default'}, 'auto');
        auto.addEventListener('click', () => update(field, undefined));
        wrap.append(auto);
        sync.push(() => auto.setAttribute('aria-pressed', String(isAuto(field))));
      }
      sync.push(() => {
        const v = String(valueOf(field));
        picker.value = /^#[0-9a-f]{6}$/i.test(v) ? v : '#000000';
        hex.textContent = v;
        custom.style.setProperty('--c', v);
        if (field.key === 'color') custom.setAttribute('aria-pressed', String(!SWATCHES.includes(v.toLowerCase())));
      });
      row.append(wrap);
    }
    syncers.push(() => sync.forEach(f => f()));
    return row;
  }

  function toggleRow(label: string, get: () => boolean, set: (on: boolean) => void, own = true) {
    const input = el('input', {type: 'checkbox', role: 'switch'}) as HTMLInputElement;
    input.addEventListener('change', () => {
      set(input.checked);
      if (own) refresh();
    });
    syncers.push(() => (input.checked = get()));
    return el('label', {class: 'toggle'}, input, el('span', {class: 'toggle-track', 'aria-hidden': 'true'}), el('span', {class: 'toggle-label'}, label));
  }

  // -------------------------------------------------------------------------
  // Applying changes.

  let restyleQueued = false;
  const restyle = () => {
    if (restyleQueued) return;
    restyleQueued = true;
    requestAnimationFrame(() => {
      restyleQueued = false;
      view.restyle(state.look);
    });
  };

  function update(field: Field, value: string | number | boolean | undefined) {
    if (field.where === 'pose') {
      const key = field.key as PoseKey;
      state.pose[key] = value as number;
      // Hand-posing beats the idle loop and the pointer.
      if (state.idle || state.follow) {
        state.idle = state.follow = false;
        view.setIdle(false);
        view.setFollowPointer(false);
      }
      view.set({[key]: value ?? FIELD.get(key)!.default});
    } else {
      const look = state.look as Record<string, unknown>;
      if (value === undefined) delete look[field.key];
      else look[field.key] = value;
      if (field.key === 'color') view.set({color: value as string});
      else if (field.key === 'fur' && value !== undefined) view.set({fur: value as number});
      else restyle();
      if (field.key === 'kind' || field.key === 'hat') void view.hop(40, 0.9);
    }
    refresh();
  }

  function load(next: EditorState) {
    state = next;
    view.restyle(state.look);
    view.set(Object.fromEntries(POSE_KEYS.map(k => [k, state.pose[k] ?? FIELD.get(k)!.default])));
    view.setIdle(state.idle);
    view.setFollowPointer(state.follow);
    refresh();
  }

  function refresh() {
    syncers.forEach(f => f());
    const code = snippet(flavor, state);
    root.code.querySelector('code')!.innerHTML = highlight(code, FLAVORS.find(f => f.id === flavor)!.lang);
    root.code.dataset.text = code;
    const query = encodeState(state);
    root.share.value = `${location.origin}${location.pathname}${query ? `?${query}` : ''}#editor`;
    plushVars(root.stage, String(state.look.color ?? '#f2b33d'));
    plushVars(root.controls, String(state.look.color ?? '#f2b33d'));
  }

  // -------------------------------------------------------------------------
  // Code tabs, copy, share, toolbar.

  tabs(root.tabs, FLAVORS, id => {
    flavor = id;
    refresh();
  });
  root.codeCopy.addEventListener('click', () => copyText(root.codeCopy, root.code.dataset.text ?? ''));
  root.shareCopy.addEventListener('click', () => copyText(root.shareCopy, root.share.value, 'Copied!'));
  root.share.addEventListener('focus', () => root.share.select());

  const pick = <T,>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)];
  const maybe = <T,>(p: number, list: readonly T[], none: T) => (Math.random() < p ? pick(list.filter(v => v !== none)) : none);
  for (const button of root.stage.querySelectorAll<HTMLButtonElement>('[data-action]')) {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'hop') void view.hop(70);
      else if (action === 'squish') void view.squish();
      else if (action === 'blink') void view.blink(0.3);
      else if (action === 'reset') load({look: {...HERO_LOOK}, pose: {}, idle: !reducedMotion(), follow: true});
      else if (action === 'random') {
        const fabric = pick(PLUSHIE_FABRICS);
        load({
          look: {
            kind: pick(PLUSHIE_KINDS),
            color: pick(SWATCHES.slice(0, 10)),
            fabric,
            finish: fabric === 'felt' ? 'felt' : pick(['satin', 'matte'] as const),
            eyes: pick(PLUSHIE_EYES.filter(e => e !== 'none')),
            mouth: maybe(0.7, PLUSHIE_MOUTHS, 'none'),
            cheeks: Math.random() < 0.4,
            glasses: maybe(0.35, PLUSHIE_GLASSES, 'none'),
            hat: maybe(0.4, PLUSHIE_HATS, 'none'),
            neck: maybe(0.3, PLUSHIE_NECKS, 'none'),
            pin: maybe(0.2, PLUSHIE_PINS, 'none'),
            moustache: maybe(0.1, PLUSHIE_MOUSTACHES, 'none'),
            seed: 1 + Math.floor(Math.random() * 40),
          },
          pose: {},
          idle: state.idle,
          follow: state.follow,
        });
        void view.hop(60);
      }
    });
  }

  refresh();
  return {
    load(look) {
      load({look: {...look}, pose: {}, idle: state.idle || !reducedMotion(), follow: true});
    },
  };
}

// ---------------------------------------------------------------------------

/** Arrow keys move between the tiles of a radiogroup made of buttons. */
function radioKeys(group: HTMLElement) {
  group.addEventListener('keydown', event => {
    const tiles = [...group.querySelectorAll<HTMLButtonElement>('[role=radio]')];
    const i = tiles.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    const step = {ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1}[event.key];
    if (!step) return;
    event.preventDefault();
    const next = tiles[(i + step + tiles.length) % tiles.length];
    next.focus();
    next.click();
  });
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function el(tag: string, attrs: Record<string, string> = {}, ...children: (Node | string | boolean | undefined)[]): HTMLElement {
  const svg = children.at(-1) === true;
  const node = (svg ? document.createElementNS(SVG_NS, tag) : document.createElement(tag)) as HTMLElement;
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const child of children) {
    if (child === true || child === false || child === undefined || child === '') continue;
    node.append(child);
  }
  return node;
}
