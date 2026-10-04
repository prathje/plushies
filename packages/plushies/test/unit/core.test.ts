import {readback} from './dom-stub';
import {describe, expect, spyOn, test} from 'bun:test';
import * as THREE from 'three';
import {
  DEFAULT_OPTIONS,
  DEFAULT_POSE,
  PLUSHIE_EYES,
  PLUSHIE_FABRICS,
  PLUSHIE_GLASSES,
  PLUSHIE_HATS,
  PLUSHIE_KINDS,
  PLUSHIE_MOUSTACHES,
  PLUSHIE_MOUTHS,
  PLUSHIE_NECKS,
  PLUSHIE_PINS,
  createPlushie,
  fabricFur,
  plushieOutline,
} from '../../src/index';
import {meshCount, snapshot} from './snapshot';

describe('silhouettes', () => {
  test.each([...PLUSHIE_KINDS])('%s outline is a closed CCW polyline inside [-1, 1]', kind => {
    const outline = plushieOutline(kind);
    expect(outline.length).toBeGreaterThan(16);
    let area = 0;
    for (let i = 0; i < outline.length; i++) {
      const [x0, y0] = outline[i];
      const [x1, y1] = outline[(i + 1) % outline.length];
      area += x0 * y1 - x1 * y0;
      expect(Math.abs(x0)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(y0)).toBeLessThanOrEqual(1.0001);
      expect(Number.isFinite(x0) && Number.isFinite(y0)).toBe(true);
    }
    expect(area / 2).toBeGreaterThan(0.3);
  });

  test('blob seeds give different, reproducible lumps', () => {
    expect(plushieOutline('blob', {seed: 3})).toEqual(plushieOutline('blob', {seed: 3}));
    expect(plushieOutline('blob', {seed: 3})).not.toEqual(plushieOutline('blob', {seed: 4}));
  });
});

describe('createPlushie', () => {
  test.each([...PLUSHIE_KINDS])('builds a %s', kind => {
    const plush = createPlushie(THREE, {kind});
    expect(plush.object.name).toBe('Plushie');
    expect(meshCount(plush.object)).toBeGreaterThan(3);
    plush.dispose();
  });

  test('every fabric, eye, mouth, moustache, glasses, hat, neck and pin style builds', () => {
    const styles = [
      ...PLUSHIE_FABRICS.map(fabric => ({fabric})),
      ...PLUSHIE_EYES.map(eyes => ({eyes})),
      ...PLUSHIE_MOUTHS.map(mouth => ({mouth})),
      ...PLUSHIE_GLASSES.map(glasses => ({glasses})),
      ...PLUSHIE_HATS.map(hat => ({hat})),
      ...PLUSHIE_NECKS.map(neck => ({neck})),
      ...PLUSHIE_PINS.map(pin => ({pin})),
      ...PLUSHIE_MOUSTACHES.map(moustache => ({moustache})),
      {neck: 'necktie' as const, pin: 'heart' as const, moustache: 'curly' as const, cheeks: true, finish: 'felt' as const},
      ...PLUSHIE_KINDS.map(kind => ({kind, hat: 'cowboy' as const, neck: 'necktie' as const, pin: 'badge' as const})),
    ];
    for (const style of styles) createPlushie(THREE, style).dispose();
  });

  test('accessories add meshes', () => {
    const bare = meshCount(createPlushie(THREE).object);
    const dressed = meshCount(createPlushie(THREE, {glasses: 'round', hat: 'top', bowtie: true, mouth: 'smile'}).object);
    expect(dressed).toBeGreaterThan(bare);
  });

  test('bowtie: true is shorthand for neck: bowtie', () => {
    expect(snapshot(createPlushie(THREE, {bowtie: true}).object)).toEqual(snapshot(createPlushie(THREE, {neck: 'bowtie'}).object));
  });

  test('a heart wears its hat on a lobe, a circle in the middle', () => {
    const hatX = (kind: 'heart' | 'circle') => createPlushie(THREE, {kind, hat: 'top'}).object.getObjectByName('hat')!.position.x;
    expect(Math.abs(hatX('heart'))).toBeGreaterThan(0.2);
    expect(Math.abs(hatX('circle'))).toBeLessThan(0.05);
  });

  test('DEFAULT_OPTIONS are the defaults createPlushie applies', () => {
    expect(snapshot(createPlushie(THREE, {...DEFAULT_OPTIONS}).object)).toEqual(snapshot(createPlushie(THREE).object));
  });

  test('the same options build the same plushie', () => {
    const look = {kind: 'blob', seed: 7, fabric: 'shaggy', hat: 'party', glasses: 'monocle'} as const;
    expect(snapshot(createPlushie(THREE, look).object)).toEqual(snapshot(createPlushie(THREE, look).object));
  });

  test('the initial pose defaults to DEFAULT_POSE plus the fabric fur', () => {
    const plush = createPlushie(THREE, {fabric: 'felt'});
    expect(plush.pose).toEqual({...DEFAULT_POSE, fur: fabricFur('felt')});
  });

  test('furShells caps the body shells built and drawn (clamped to 3..16)', () => {
    const body = (shells?: number) => {
      const plush = createPlushie(THREE, {furShells: shells});
      let found: THREE.Mesh | undefined;
      plush.object.traverse(node => {
        if ((node as THREE.Mesh).geometry?.userData.indexPerLayer) found ??= node as THREE.Mesh;
      });
      const geometry = found!.geometry;
      return {layers: geometry.index!.count / geometry.userData.indexPerLayer - 1, drawn: geometry.drawRange.count / geometry.userData.indexPerLayer - 1};
    };
    expect(body().layers).toBe(16);
    expect(body(6).layers).toBe(6);
    expect(body(6).drawn).toBeLessThanOrEqual(6);
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    expect(body(1).layers).toBe(3);
    expect(body(40).layers).toBe(16);
    warn.mockRestore();
  });

  test('lights: false leaves lighting to the caller', () => {
    const lights = (o: THREE.Object3D) => o.children.filter(c => (c as THREE.Light).isLight).length;
    expect(lights(createPlushie(THREE).object)).toBeGreaterThan(0);
    expect(lights(createPlushie(THREE, {lights: false}).object)).toBe(0);
  });
});

describe('pose', () => {
  const look = {kind: 'heart', glasses: 'round', hat: 'beanie', bowtie: true, mouth: 'smile'} as const;
  const a = {lookX: 0.6, lookY: -0.3, blink: 0.4, squash: 0.5, hop: 40, lean: 8, turn: 25, float: 1.2, fur: 0.07};
  const b = {lookX: -1, lookY: 1, blink: 1, squash: -0.8, hop: 15, lean: -12, turn: -40, float: 0.8, fur: 0.02, width: 300};

  test('set is idempotent: A → B → A equals a fresh A', () => {
    const fresh = createPlushie(THREE, {...look, ...a});
    const moved = createPlushie(THREE, look);
    moved.set(a);
    moved.set(b);
    moved.set({...a, width: DEFAULT_POSE.width});
    expect(snapshot(moved.object)).toEqual(snapshot(fresh.object));
  });

  test('every pose field changes the object', () => {
    const base = createPlushie(THREE, look);
    const before = JSON.stringify(snapshot(base.object));
    for (const [key, v] of Object.entries(b)) {
      const plush = createPlushie(THREE, look);
      plush.set({[key]: v});
      expect({key, changed: JSON.stringify(snapshot(plush.object)) !== before}).toEqual({key, changed: true});
    }
  });

  test('colours: hex, rgb() and sRGB tuples agree', () => {
    const uColor = (color: string | [number, number, number]) => {
      const plush = createPlushie(THREE, {color});
      return snapshot(plush.object).map(n => (n as {uniforms: Record<string, unknown>}).uniforms);
    };
    expect(uColor('#336699')).toEqual(uColor([0x33 / 255, 0x66 / 255, 0x99 / 255]));
    // CSS forms other than hex go through three's linear round trip: equal to ~1e-5.
    const flat = (u: unknown) => JSON.stringify(u).match(/-?\d+\.?\d*(e-?\d+)?/g)!.map(Number);
    const css = flat(uColor('rgb(51, 102, 153)'));
    flat(uColor('#336699')).forEach((v, i) => expect(css[i]).toBeCloseTo(v, 4));
    expect(uColor('#336699')).not.toEqual(uColor('#996633'));
  });

  const fur = (color: string | [number, number, number]) => {
    const plush = createPlushie(THREE, {color});
    const flat = JSON.stringify(snapshot(plush.object).map(n => (n as {uniforms: Record<string, unknown>}).uniforms));
    return flat.match(/-?\d+\.?\d*(e-?\d+)?/g)!.map(Number);
  };
  const near = (a: number[], b: number[]) => {
    expect(a.length).toBe(b.length);
    a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));
  };

  test('colours: hsl() space syntax reads bare s/l as percent', () => {
    const green = fur([0.25, 0.75, 0.25]);
    near(fur('hsl(120 50 50)'), green);
    near(fur('hsl(120 50% 50%)'), green);
    near(fur('hsl(120, 50%, 50%)'), green);
    near(fur('hsla(120deg 50 50 / 0.5)'), green);
  });

  test('colours: what the hand parser rejects goes to the browser', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const css = (globalThis as Record<string, unknown>).CSS;
    (globalThis as Record<string, unknown>).CSS = {supports: () => true};
    try {
      // No browser here: the stub canvas reads back this pixel for every colour it is asked to resolve.
      readback.pixel = [0, 255, 0, 255];
      const lime = fur([0, 1, 0]);
      near(fur('rgb(none 255 0)'), lime);
      // Legacy comma syntax needs % for s and l.
      near(fur('hsl(0, 100, 50)'), lime);
      near(fur('rgb(255, 0%, 0)'), lime);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      readback.pixel = null;
      (globalThis as Record<string, unknown>).CSS = css;
      warn.mockRestore();
    }
  });

  test('colours: translucent browser colours keep their RGB (readback is not premultiplied)', () => {
    const css = (globalThis as Record<string, unknown>).CSS;
    (globalThis as Record<string, unknown>).CSS = {supports: () => true};
    try {
      readback.pixel = [0x33, 0x66, 0x99, 128];
      near(fur('color(srgb 0.2 0.4 0.6 / 0.5)'), fur('#336699'));
    } finally {
      readback.pixel = null;
      (globalThis as Record<string, unknown>).CSS = css;
    }
  });

  test('boolean options are checked', () => {
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const plush = createPlushie(THREE, {shadow: 'false' as unknown as boolean, cheeks: 1 as unknown as boolean});
      expect(meshCount(plush.object)).toBe(meshCount(createPlushie(THREE, {}).object));
      expect(warn.mock.calls.map(c => String(c[0])).filter(m => /must be true or false/.test(m)).length).toBe(2);
    } finally {
      warn.mockRestore();
    }
  });

  test('fits into width × height', () => {
    const plush = createPlushie(THREE, {kind: 'pill'});
    const box = () => new THREE.Box3().setFromObject(plush.object.children.at(-1)!);
    const wide = box().getSize(new THREE.Vector3());
    plush.set({width: 300, height: 300});
    const small = box().getSize(new THREE.Vector3());
    expect(small.x / wide.x).toBeCloseTo(0.5, 2);
    expect(wide.x).toBeLessThanOrEqual(600);
  });
});

describe('dispose', () => {
  test('frees geometries and materials and detaches the object', () => {
    const plush = createPlushie(THREE, {hat: 'crown', glasses: 'shades'});
    const parent = new THREE.Group();
    parent.add(plush.object);
    let disposed = 0;
    plush.object.traverse(node => {
      (node as THREE.Mesh).geometry?.addEventListener('dispose', () => disposed++);
    });
    plush.dispose();
    expect(disposed).toBeGreaterThan(5);
    expect(plush.object.parent).toBeNull();
  });
});
