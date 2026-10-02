/**
 * plushies — soft 3D plush characters for three.js.
 *
 * A body is a 2D silhouette (circle, heart, star, …) inflated into a stuffed
 * pillow with a rolled seam and covered in shell-textured fur. Eyes, mouth,
 * glasses, hat and bow tie are separate objects floating just in front of /
 * above the body.
 *
 * The library never imports `three` itself: pass your copy of the module to
 * `createPlushie(THREE, options)`. That keeps it working with whatever
 * three.js build (r160+) the page already loads.
 *
 * Units: the returned `object` is laid out in pixels — it fits itself into a
 * `width` × `height` box (default 600 × 600) centred on its origin, y up. Put
 * it in a group scaled by 1/100 for a 100 px = 1 unit world, or use
 * `mountPlushie` (./viewer) which sets up renderer, camera and loop for you.
 */
import type * as ThreeNamespace from 'three';

/** The `three` module namespace, as passed to `createPlushie`. */
export type ThreeModule = typeof ThreeNamespace;
type T3 = ThreeModule;
type TObject = InstanceType<T3['Object3D']>;
type TGroup = InstanceType<T3['Group']>;
type TMesh = InstanceType<T3['Mesh']>;
type TGeometry = InstanceType<T3['BufferGeometry']>;
type TMaterial = InstanceType<T3['Material']>;
type TTexture = InstanceType<T3['Texture']>;
type TRenderer = InstanceType<T3['WebGLRenderer']>;

/** sRGB colour, each channel 0..1. */
export type Rgb = [number, number, number];
/** A CSS colour string (`#rgb`, `#rrggbb`, `rgb(…)`, `hsl(…)`, names) or an sRGB 0..1 triple. */
export type PlushieColor = string | Rgb | readonly number[];

/**
 * Parse a colour to sRGB 0..1. Hex is decoded exactly (byte / 255) so the
 * fur colour matches other renderers bit for bit; other CSS forms go through
 * three's parser.
 */
function toRgb(three: T3, color: PlushieColor): Rgb {
  if (typeof color !== 'string') return [color[0], color[1], color[2]];
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (hex && (hex[1].length === 3 || hex[1].length === 4)) {
    const h = hex[1];
    return [0, 1, 2].map(i => parseInt(h[i] + h[i], 16) / 255) as Rgb;
  }
  if (hex && (hex[1].length === 6 || hex[1].length === 8)) {
    const h = hex[1];
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
  }
  const c = new three.Color().setStyle(color);
  const out = {r: 0, g: 0, b: 0};
  c.getRGB(out, three.SRGBColorSpace);
  return [out.r, out.g, out.b];
}


/** Body silhouettes. */
export type PlushieKind =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'heart'
  | 'star'
  | 'pill'
  | 'cloud'
  | 'polygon'
  | 'blob'
  | 'egg'
  | 'drop'
  | 'ghost'
  | 'bean'
  | 'flower'
  | 'diamond'
  | 'squircle'
  | 'arch';
/** Body fabric: fur length, fibre size, sheen and mottling presets. */
export type PlushieFabric = 'plush' | 'felt' | 'velvet' | 'shaggy' | 'fleece';
/** Surface of the eyes, mouth, glasses and bow tie. */
export type PlushieFinish = 'gloss' | 'satin' | 'matte' | 'felt';
export type PlushieEyes = 'dot' | 'oval' | 'googly' | 'ring' | 'happy' | 'sleepy' | 'none';
export type PlushieMouth = 'none' | 'smile' | 'grin' | 'open' | 'flat' | 'cat';
export type PlushieGlasses = 'none' | 'round' | 'square' | 'monocle' | 'shades';
export type PlushieHat = 'none' | 'top' | 'beanie' | 'party' | 'crown';


// ---------------------------------------------------------------------------
// Silhouettes. Everything below is built at unit scale (the body fits in
// [-1, 1]), y up, and the stage scales it to the node's size.
// ---------------------------------------------------------------------------

type V2 = [number, number];

/** Deterministic PRNG — the same seed always gives the same blob / texture. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function signedArea(poly: V2[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

function centroid(poly: V2[]): V2 {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, y0] = poly[i];
    const [x1, y1] = poly[(i + 1) % poly.length];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

/** Fillet every corner of a polygon with an arc (convex and reflex alike). */
function roundedPolygon(vertices: V2[], radius: number, steps = 14): V2[] {
  const out: V2[] = [];
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const p = vertices[i];
    const prev = vertices[(i + n - 1) % n];
    const next = vertices[(i + 1) % n];
    const la = Math.hypot(prev[0] - p[0], prev[1] - p[1]);
    const lb = Math.hypot(next[0] - p[0], next[1] - p[1]);
    const a: V2 = [(prev[0] - p[0]) / la, (prev[1] - p[1]) / la];
    const b: V2 = [(next[0] - p[0]) / lb, (next[1] - p[1]) / lb];
    const angle = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1])));
    // Tangent length, clamped so neighbouring fillets never overlap; the
    // radius shrinks with it on short edges (a star's tips).
    const t = Math.min(radius / Math.tan(angle / 2), la * 0.48, lb * 0.48);
    const r = t * Math.tan(angle / 2);
    const bis: V2 = [a[0] + b[0], a[1] + b[1]];
    const bl = Math.hypot(bis[0], bis[1]) || 1;
    const dist = r / Math.sin(angle / 2);
    const c: V2 = [p[0] + (bis[0] / bl) * dist, p[1] + (bis[1] / bl) * dist];
    const t1: V2 = [p[0] + a[0] * t, p[1] + a[1] * t];
    const t2: V2 = [p[0] + b[0] * t, p[1] + b[1] * t];
    const s = Math.atan2(t1[1] - c[1], t1[0] - c[0]);
    let e = Math.atan2(t2[1] - c[1], t2[0] - c[0]);
    let d = e - s;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    e = s + d;
    for (let k = 0; k <= steps; k++) {
      const th = s + (d * k) / steps;
      out.push([c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r]);
    }
  }
  return out;
}

/** Laplacian smoothing of a closed polyline — rounds tips and creases. */
function smoothClosed(poly: V2[], iterations: number): V2[] {
  let pts = poly;
  for (let it = 0; it < iterations; it++) {
    pts = pts.map((p, i) => {
      const a = pts[(i + pts.length - 1) % pts.length];
      const b = pts[(i + 1) % pts.length];
      return [p[0] * 0.5 + (a[0] + b[0]) * 0.25, p[1] * 0.5 + (a[1] + b[1]) * 0.25];
    });
  }
  return pts;
}

/** Resample a closed polyline to `n` points evenly spaced by arc length. */
function resampleClosed(poly: V2[], n: number): V2[] {
  const lengths = [0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    lengths.push(lengths[i] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = lengths[poly.length];
  const out: V2[] = [];
  let seg = 0;
  for (let k = 0; k < n; k++) {
    const target = (k / n) * total;
    while (lengths[seg + 1] < target) seg++;
    const a = poly[seg];
    const b = poly[(seg + 1) % poly.length];
    const f = (target - lengths[seg]) / Math.max(1e-9, lengths[seg + 1] - lengths[seg]);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return out;
}

/** Polar silhouette r(θ) sampled around the origin. */
function polar(n: number, r: (theta: number) => number): V2[] {
  return Array.from({length: n}, (_, i) => {
    const th = (i / n) * Math.PI * 2;
    const rr = r(th);
    return [Math.cos(th) * rr, Math.sin(th) * rr] as V2;
  });
}

function regular(n: number, radius: number, phase: number): V2[] {
  return Array.from({length: n}, (_, i) => {
    const th = phase + (i / n) * Math.PI * 2;
    return [Math.cos(th) * radius, Math.sin(th) * radius] as V2;
  });
}

interface OutlineParams {
  roundness: number;
  sides?: number;
  starInner: number;
  seed: number;
}

/** The silhouette as a closed CCW polyline fitted into [-1, 1]. */
function silhouette(kind: PlushieKind, o: OutlineParams): V2[] {
  const round = Math.max(0, Math.min(1, o.roundness));
  let poly: V2[];
  switch (kind) {
    case 'square': {
      const sq: V2[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
      poly = roundedPolygon(sq, 0.12 + 0.62 * round);
      break;
    }
    case 'triangle':
    case 'polygon': {
      const n = kind === 'triangle' ? 3 : Math.max(3, Math.round(o.sides ?? 6));
      const inradius = Math.cos(Math.PI / n);
      poly = roundedPolygon(regular(n, 1, Math.PI / 2), inradius * (0.12 + 0.72 * round));
      break;
    }
    case 'star': {
      const n = Math.max(3, Math.round(o.sides ?? 5));
      const inner = Math.max(0.2, Math.min(0.9, o.starInner));
      const pts: V2[] = [];
      for (let i = 0; i < n * 2; i++) {
        const th = Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? 1 : inner;
        pts.push([Math.cos(th) * rr, Math.sin(th) * rr]);
      }
      poly = roundedPolygon(pts, 0.06 + 0.3 * round);
      break;
    }
    case 'heart': {
      const raw = Array.from({length: 240}, (_, i) => {
        const t = (i / 240) * Math.PI * 2;
        return [
          16 * Math.sin(t) ** 3,
          13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t),
        ] as V2;
      });
      // A sewn heart has a soft tip and a shallow notch.
      poly = smoothClosed(raw, Math.round(20 + 180 * round));
      break;
    }
    case 'pill':
      poly = roundedPolygon([[-0.62, -1], [0.62, -1], [0.62, 1], [-0.62, 1]], 0.61);
      break;
    case 'cloud': {
      const circles: [number, number, number][] = [
        [-0.62, -0.2, 0.42],
        [-0.25, 0.18, 0.5],
        [0.3, 0.22, 0.47],
        [0.68, -0.12, 0.4],
        [0.05, -0.28, 0.46],
      ];
      const raw = polar(360, th => {
        const ux = Math.cos(th);
        const uy = Math.sin(th);
        let best = 0;
        for (const [cx, cy, r] of circles) {
          const b = ux * cx + uy * cy;
          const disc = b * b - (cx * cx + cy * cy) + r * r;
          if (disc >= 0) best = Math.max(best, b + Math.sqrt(disc));
        }
        return best;
      });
      poly = smoothClosed(raw, Math.round(10 + 60 * round));
      break;
    }
    case 'blob': {
      const rand = mulberry32(o.seed * 9973 + 17);
      const waves = [2, 3, 4, 5].map(k => ({
        k,
        amp: (0.2 / k) * (0.5 + rand()),
        phase: rand() * Math.PI * 2,
      }));
      poly = polar(240, th =>
        waves.reduce((r, w) => r + w.amp * Math.cos(w.k * th + w.phase), 1),
      );
      break;
    }
    case 'egg':
      poly = polar(240, () => 1).map(([x, y]) => [x * 0.8 * (1 - 0.14 * y), y] as V2);
      break;
    case 'drop': {
      // Teardrop, tip up; `roundness` blunts the tip.
      const raw = Array.from({length: 240}, (_, i) => {
        const t = (i / 240) * Math.PI * 2;
        return [Math.sin(t) * Math.pow(Math.sin(t / 2), 1.3), Math.cos(t)] as V2;
      });
      poly = smoothClosed(raw, Math.round(4 + 60 * round));
      break;
    }
    case 'ghost': {
      // Dome on top, straight sides, three scallops along the hem.
      const raw: V2[] = [];
      for (let i = 0; i <= 60; i++) {
        const th = (i / 60) * Math.PI;
        raw.push([Math.cos(th), 0.15 + Math.sin(th)]);
      }
      for (let i = 1; i <= 20; i++) raw.push([-1, 0.15 - (i / 20) * 1.05]);
      for (let i = 0; i <= 90; i++) {
        const x = -1 + (i / 90) * 2;
        raw.push([x, -0.9 - 0.14 * Math.abs(Math.sin(((x + 1) / 2) * Math.PI * 3))]);
      }
      for (let i = 0; i < 20; i++) raw.push([1, -0.9 + (i / 20) * 1.05]);
      poly = smoothClosed(raw, Math.round(8 + 30 * round));
      break;
    }
    case 'bean':
      poly = polar(240, () => 1).map(([x, y]) => [x, 0.62 * y - 0.26 * Math.pow(Math.max(0, y), 6)] as V2);
      break;
    case 'flower': {
      const petals = Math.max(3, Math.round(o.sides ?? 6));
      // Round lobes meeting in creases; `roundness` softens the creases.
      poly = polar(360, th => 0.6 + 0.4 * Math.abs(Math.cos((petals * (th - Math.PI / 2)) / 2)));
      poly = smoothClosed(poly, Math.round(6 + 50 * round));
      break;
    }
    case 'diamond':
      poly = roundedPolygon([[0, 1], [-0.78, 0], [0, -1], [0.78, 0]], 0.08 + 0.3 * round);
      break;
    case 'squircle': {
      // Superellipse: roundness 1 → nearly a circle, 0 → nearly a square.
      const n = 2.2 + (1 - round) * 5;
      poly = polar(240, th =>
        Math.pow(Math.pow(Math.abs(Math.cos(th)), n) + Math.pow(Math.abs(Math.sin(th)), n), -1 / n),
      );
      break;
    }
    case 'arch': {
      // Tombstone: a semicircular top over a flat-bottomed body.
      const raw: V2[] = [[-0.8, -1], [0.8, -1]];
      for (let i = 0; i <= 40; i++) {
        const th = (i / 40) * Math.PI;
        raw.push([Math.cos(th) * 0.8, 0.2 + Math.sin(th) * 0.8]);
      }
      poly = roundedPolygon(raw, 0.1 + 0.3 * round, 10);
      break;
    }
    case 'circle':
    default:
      poly = polar(240, () => 1);
  }
  if (signedArea(poly) < 0) poly = poly.slice().reverse();
  poly = resampleClosed(poly, 150);
  // Fit the bounding box into [-1, 1], centred.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const s = 2 / Math.max(maxX - minX, maxY - minY);
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  return poly.map(([x, y]) => [(x - mx) * s, (y - my) * s] as V2);
}

function distanceToOutline(x: number, y: number, poly: V2[]) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    const dx = bx - ax;
    const dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, ay + dy * t - y));
  }
  return best;
}

interface BodyShape {
  outline: V2[];
  center: V2;
  /** Front-surface height at a point inside the silhouette (unit scale). */
  heightAt: (x: number, y: number) => number;
  geometry: TGeometry;
}

/**
 * Inflate a silhouette into a closed pillow: rings shrink from the outline to
 * an interior centre, each vertex is lifted by a round-edged profile of its
 * distance to the seam, and front and back share the seam ring — so normals
 * round smoothly over the edge instead of creasing there.
 */
function inflate(three: T3, outline: V2[], thickness: number): BodyShape {
  const N = outline.length;
  const K = 18;
  const center = centroid(outline);
  const [cx, cy] = center;
  let dmax = 0;
  for (let i = 0; i < 64; i++) {
    const th = (i / 64) * Math.PI * 2;
    const x = cx + Math.cos(th) * 0.15;
    const y = cy + Math.sin(th) * 0.15;
    dmax = Math.max(dmax, distanceToOutline(x, y, outline));
  }
  dmax = Math.max(dmax, distanceToOutline(cx, cy, outline));
  const H = thickness;
  // Edge radius: the seam rolls over like a stuffed cushion, then the middle
  // keeps swelling gently instead of going flat.
  const D = Math.min(dmax, H * 1.25);
  const profile = (d: number) => {
    const u = Math.min(1, Math.max(0, d / D));
    return H * (0.84 * Math.sqrt(u * (2 - u)) + 0.16 * Math.min(1, d / dmax));
  };

  // Grid of rings: ring 0 is the centre vertex, ring K the seam.
  const ringS = (k: number) => 1 - Math.pow(1 - k / K, 1.8);
  const xy: V2[] = [[cx, cy]];
  for (let k = 1; k <= K; k++) {
    const s = ringS(k);
    for (let i = 0; i < N; i++) {
      xy.push([cx + (outline[i][0] - cx) * s, cy + (outline[i][1] - cy) * s]);
    }
  }
  const idx = (k: number, i: number) => (k === 0 ? 0 : 1 + (k - 1) * N + (((i % N) + N) % N));
  let h = xy.map(([x, y], v) => (v >= 1 + (K - 1) * N ? 0 : profile(distanceToOutline(x, y, outline))));
  // Relax the height field: the distance field has ridges along the medial
  // axis (a star's spokes); a few passes turn them into soft stuffing.
  for (let it = 0; it < 6; it++) {
    const next = h.slice();
    let ring1 = 0;
    for (let i = 0; i < N; i++) ring1 += h[idx(1, i)];
    next[0] = h[0] * 0.5 + (ring1 / N) * 0.5;
    for (let k = 1; k < K; k++) {
      for (let i = 0; i < N; i++) {
        const v = idx(k, i);
        const avg = (h[idx(k, i - 1)] + h[idx(k, i + 1)] + h[idx(k - 1, i)] + h[idx(k + 1, i)]) / 4;
        next[v] = h[v] * 0.5 + avg * 0.5;
      }
    }
    h = next;
  }

  const V = xy.length; // front vertices, seam included
  const backStart = V;
  const backCount = 1 + (K - 1) * N; // back reuses the seam ring
  const positions = new Float32Array((V + backCount) * 3);
  for (let v = 0; v < V; v++) {
    positions.set([xy[v][0], xy[v][1], h[v]], v * 3);
  }
  for (let v = 0; v < backCount; v++) {
    positions.set([xy[v][0], xy[v][1], -h[v] * 0.9], (backStart + v) * 3);
  }
  const backIdx = (k: number, i: number) => (k === K ? idx(K, i) : backStart + idx(k, i));
  const index: number[] = [];
  for (let i = 0; i < N; i++) {
    index.push(0, idx(1, i), idx(1, i + 1));
    index.push(backStart, backIdx(1, i + 1), backIdx(1, i));
    for (let k = 1; k < K; k++) {
      const a = idx(k, i);
      const b = idx(k, i + 1);
      const c = idx(k + 1, i + 1);
      const d = idx(k + 1, i);
      index.push(a, d, c, a, c, b);
      const ba = backIdx(k, i);
      const bb = backIdx(k, i + 1);
      const bc = backIdx(k + 1, i + 1);
      const bd = backIdx(k + 1, i);
      index.push(ba, bc, bd, ba, bb, bc);
    }
  }
  const geometry = new three.BufferGeometry();
  geometry.setAttribute('position', new three.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return {
    outline,
    center,
    heightAt: (x, y) => profile(distanceToOutline(x, y, outline)),
    geometry,
  };
}

// ---------------------------------------------------------------------------
// Fur: shell texturing. The surface is repeated in `shells` layers pushed out
// along the normal; each layer keeps only the texels where a strand is still
// taller than that layer, so strands taper to fuzzy tips — which is also what
// makes the silhouette soft. All shells live in ONE geometry and ONE material
// (a per-vertex `shell` attribute), so the cost is a single draw call.
// ---------------------------------------------------------------------------

/** Most shells a body can draw; `pose` draws only as many as the fur's on-screen length needs. */
const FUR_SHELLS = 16;

function furShells(three: T3, base: TGeometry, shells = FUR_SHELLS) {
  type Attr = InstanceType<T3['BufferAttribute']>;
  const pos = base.getAttribute('position') as Attr;
  const nor = base.getAttribute('normal') as Attr;
  const baseIndex = base.getIndex();
  const count = pos.count;
  const layers = shells + 1;
  const positions = new Float32Array(count * layers * 3);
  const normals = new Float32Array(count * layers * 3);
  const shell = new Float32Array(count * layers);
  for (let l = 0; l < layers; l++) {
    positions.set(pos.array as Float32Array, l * count * 3);
    normals.set(nor.array as Float32Array, l * count * 3);
    shell.fill(l, l * count, (l + 1) * count);
  }
  const src = baseIndex
    ? Array.from(baseIndex.array as ArrayLike<number>)
    : Array.from({length: count}, (_, i) => i);
  const index = new Uint32Array(src.length * layers);
  for (let l = 0; l < layers; l++) {
    for (let i = 0; i < src.length; i++) index[l * src.length + i] = src[i] + l * count;
  }
  const g = new three.BufferGeometry();
  g.setAttribute('position', new three.BufferAttribute(positions, 3));
  g.setAttribute('normal', new three.BufferAttribute(normals, 3));
  g.setAttribute('shell', new three.BufferAttribute(shell, 1));
  g.setIndex(new three.BufferAttribute(index, 1));
  g.userData.indexPerLayer = src.length;
  return g;
}

type TShader = InstanceType<T3['ShaderMaterial']>;
type TColor = InstanceType<T3['Color']>;

interface FurUniforms {
  [name: string]: {value: unknown};
  uFur: {value: number};
  uStrand: {value: number};
  uGravity: {value: InstanceType<T3['Vector3']>};
  uRoot: {value: number};
  /** Shells drawn: the `shell` attribute is a layer index, normalised by this. */
  uLayers: {value: number};
  uColor: {value: TColor};
  uSheen: {value: TColor};
  /** Strength of the fibre sheen (velvet is high, felt low). */
  uSheenAmt: {value: number};
  /** Low-frequency blotchiness of the colour (felt, fleece). */
  uMottle: {value: number};
  /** Depth pulled toward the camera, in view units (see `depthBias`). */
  uBias: {value: number};
}

/**
 * The light rig, in the stage's world space (y up). The fur shades itself
 * from these rather than from Three's light loop: a physically based material
 * evaluated per fragment, twenty-odd times over (once per shell), is what made
 * a full-frame plush cost a second per frame in headless (software GL)
 * rendering. Fur hides shading detail anyway, so the lighting is computed per
 * vertex and the fragment stage only decides strand / no strand.
 */
const RIG = {
  sky: ['#fffaf2', 0.5],
  ground: ['#6e655d', 0.5],
  key: {dir: [-300, 420, 520], color: '#fff4e4', power: 0.78},
  rim: {dir: [380, 260, -420], color: '#ffffff', power: 0.8},
  fill: {dir: [420, -120, 400], color: '#e8eeff', power: 0.2},
} as const;

const FUR_VERTEX = /* glsl */ `
attribute float shell;
uniform float uFur;
uniform float uLayers;
uniform vec3 uGravity;
uniform float uRoot;
uniform vec3 uColor;
uniform vec3 uSheen;
uniform vec3 uSky;
uniform vec3 uGround;
uniform vec3 uKeyDir;
uniform vec3 uKeyColor;
uniform vec3 uRimDir;
uniform vec3 uRimColor;
uniform vec3 uFillDir;
uniform vec3 uFillColor;
uniform float uSheenAmt;
uniform float uMottle;
uniform float uBias;
varying float vShell;
varying vec3 vBase;
varying vec3 vBaseNormal;
varying vec3 vLit;
float mottleHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// Smooth 3D value noise — only evaluated per vertex, so it is cheap.
float mottleNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(mottleHash(i), mottleHash(i + vec3(1, 0, 0)), f.x),
        mix(mottleHash(i + vec3(0, 1, 0)), mottleHash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(mottleHash(i + vec3(0, 0, 1)), mottleHash(i + vec3(1, 0, 1)), f.x),
        mix(mottleHash(i + vec3(0, 1, 1)), mottleHash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
void main() {
  vShell = min(1.0, shell / uLayers);
  vec3 n = normalize(normal);
  vBase = position;
  vBaseNormal = n;
  vec3 p = position + n * uFur * vShell + uGravity * uFur * vShell * vShell;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vec4 shaded = mv;
  // Slide along the view ray: same pixel on screen, nearer depth.
  mv.xyz += normalize(-mv.xyz) * uBias;
  gl_Position = projectionMatrix * mv;
  mv = shaded;

  // Shading in view space (normalMatrix stays right under squash).
  vec3 N = normalize(normalMatrix * n);
  vec3 V = normalize(-mv.xyz);
  vec3 up = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
  vec3 K = normalize((viewMatrix * vec4(uKeyDir, 0.0)).xyz);
  vec3 R = normalize((viewMatrix * vec4(uRimDir, 0.0)).xyz);
  vec3 F = normalize((viewMatrix * vec4(uFillDir, 0.0)).xyz);
  vec3 ambient = mix(uGround, uSky, dot(N, up) * 0.5 + 0.5);
  // Wrapped diffuse: light bleeds round the terminator the way it does
  // through fibres, instead of a hard plastic falloff.
  float key = max(0.0, (dot(N, K) + 0.4) / 1.4);
  float rim = max(0.0, dot(N, R));
  float fill = max(0.0, dot(N, F));
  float grazing = pow(1.0 - max(0.0, dot(N, V)), 2.0);
  float blotch = 1.0;
  if (uMottle > 0.0) {
    blotch = 1.0 + uMottle * (mottleNoise(position * 5.0) + 0.5 * mottleNoise(position * 13.0) - 0.75) * 1.6;
  }
  vec3 lit = uColor * blotch * (ambient + uKeyColor * key + uFillColor * fill)
    + uSheenAmt * (uSheen * grazing * (0.35 + 0.5 * key)
    + uRimColor * uSheen * rim * (0.35 + grazing));
  // Roots sit in the shade of the strands around them.
  vLit = lit * mix(uRoot, 1.08, pow(vShell, 0.7));
}
`;

const FUR_FRAGMENT = /* glsl */ `
uniform float uFur;
uniform float uStrand;
varying float vShell;
varying vec3 vBase;
varying vec3 vBaseNormal;
varying vec3 vLit;
float plushHash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
// One jittered strand per lattice cell: (coverage of this pixel, strand height).
// The strand is a cylinder along the surface normal, so its radius is measured
// in the tangent plane — measured in 3D, every place where the surface crosses
// a cell boundary would read as "between strands" and draw a bald contour line.
// Its edge is blurred over one pixel (px = cells per pixel), not cut.
vec2 plushStrand(vec3 q, float t, vec3 n, float px) {
  vec3 c = floor(q);
  vec3 f = fract(q) - 0.5;
  f -= (vec3(plushHash(c + 1.7), plushHash(c + 4.3), plushHash(c + 7.9)) - 0.5) * 0.45;
  f -= n * dot(f, n);
  float h = 0.35 + 0.65 * plushHash(c);
  if (t > h) return vec2(0.0);
  float r = 0.62 * (1.0 - 0.85 * t / h);
  return vec2(clamp((r - length(f)) / px + 0.5, 0.0, 1.0), h);
}
void main() {
  vec3 q = vBase / uStrand;
  // Strands narrower than a couple of pixels can't be drawn one by one — they
  // would turn into per-pixel noise that crawls as the plush moves — so the
  // pattern fades into its average: how much of each shell strands cover
  // (fitted to plushStrand) and how tall they are there.
  float px = max(max(length(dFdx(q)), length(dFdy(q))), 1e-4);
  float fine = smoothstep(0.45, 1.1, px);
  float tone;
  float alpha = 1.0;
  if (vShell > 0.0) {
    if (uFur < 1e-4) discard;
    vec3 n = normalize(vBaseNormal);
    vec2 a = plushStrand(q, vShell, n, px);
    vec2 b = plushStrand(q + vec3(0.5, 0.31, 0.77), vShell, n, px);
    vec2 s = a.x > b.x ? a : b;
    alpha = mix(s.x, exp(-pow(vShell / 0.48, 2.1)), fine);
    if (alpha < 0.004) discard;
    tone = 0.9 + 0.2 * mix(s.y, 0.74 + 0.24 * vShell * vShell, fine);
  } else {
    tone = 0.92 + 0.12 * mix(plushHash(floor(q * 1.7)), 0.5, fine);
  }
  gl_FragColor = linearToOutputTexel(vec4(vLit * tone, alpha));
}
`;

function rigColor(three: T3, hex: string, power: number) {
  return new three.Color(hex).multiplyScalar(power);
}

function furMaterial(
  three: T3,
  opts: {
    length: number;
    strand: number;
    gravity?: number;
    root?: number;
    layers?: number;
    sheen?: number;
    mottle?: number;
    bias?: {value: number};
  },
): {material: TShader; uniforms: FurUniforms} {
  const dir = (d: readonly number[]) => new three.Vector3(d[0], d[1], d[2]).normalize();
  const uniforms: FurUniforms = {
    uFur: {value: opts.length},
    uStrand: {value: opts.strand},
    uGravity: {value: new three.Vector3(0, -(opts.gravity ?? 0.35), 0)},
    uRoot: {value: opts.root ?? 0.58},
    uLayers: {value: opts.layers ?? FUR_SHELLS},
    uColor: {value: new three.Color('#ffffff')},
    uSheen: {value: new three.Color('#ffffff')},
    uSheenAmt: {value: opts.sheen ?? 1},
    uMottle: {value: opts.mottle ?? 0},
    uBias: opts.bias ?? {value: 0},
    uSky: {value: rigColor(three, RIG.sky[0], RIG.sky[1])},
    uGround: {value: rigColor(three, RIG.ground[0], RIG.ground[1])},
    uKeyDir: {value: dir(RIG.key.dir)},
    uKeyColor: {value: rigColor(three, RIG.key.color, RIG.key.power)},
    uRimDir: {value: dir(RIG.rim.dir)},
    uRimColor: {value: rigColor(three, RIG.rim.color, RIG.rim.power)},
    uFillDir: {value: dir(RIG.fill.dir)},
    uFillColor: {value: rigColor(three, RIG.fill.color, RIG.fill.power)},
  };
  const material = new three.ShaderMaterial({
    uniforms,
    vertexShader: FUR_VERTEX,
    fragmentShader: FUR_FRAGMENT,
    // Strand edges are soft: shells blend over the ones beneath, which the
    // geometry draws first (layer by layer, root to tip).
    transparent: true,
  });
  return {material, uniforms};
}

function setFurColor(fur: {uniforms: FurUniforms}, color: Rgb) {
  const [r, g, b] = color;
  fur.uniforms.uColor.value.setRGB(r, g, b, 'srgb');
  // Sheen is the soft light raking across fibres: a paler version of the fur.
  fur.uniforms.uSheen.value.setRGB(
    r + (1 - r) * 0.55,
    g + (1 - g) * 0.55,
    b + (1 - b) * 0.55,
    'srgb',
  );
}

// ---------------------------------------------------------------------------
// Materials and textures for the floating parts.
// ---------------------------------------------------------------------------

function canvasTexture(three: T3, size: number, paint: (ctx: CanvasRenderingContext2D, size: number) => void, color = true) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paint(canvas.getContext('2d')!, size);
  const texture = new three.CanvasTexture(canvas);
  texture.wrapS = three.RepeatWrapping;
  texture.wrapT = three.RepeatWrapping;
  if (color) texture.colorSpace = three.SRGBColorSpace;
  return texture;
}

/** Twisted-thread pattern for embroidered strokes (u runs along the stroke). */
function threadTexture(three: T3) {
  return canvasTexture(three, 64, (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = '#7d7d7d';
    ctx.lineWidth = 7;
    for (let i = -2; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 22, 0);
      ctx.lineTo(i * 22 + s, s);
      ctx.stroke();
    }
  });
}

/** Seeded grain for felt / wool bump. */
function grainTexture(three: T3, seed: number) {
  const rand = mulberry32(seed);
  return canvasTexture(
    three,
    128,
    (ctx, s) => {
      const img = ctx.createImageData(s, s);
      for (let i = 0; i < s * s; i++) {
        const v = 110 + rand() * 145;
        img.data.set([v, v, v, 255], i * 4);
      }
      ctx.putImageData(img, 0, 0);
    },
    false,
  );
}

function stripeTexture(three: T3, a: string, b: string) {
  return canvasTexture(three, 128, (ctx, s) => {
    ctx.fillStyle = a;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = b;
    for (let i = -1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 64, 0);
      ctx.lineTo(i * 64 + 28, 0);
      ctx.lineTo(i * 64 + 28 + s, s);
      ctx.lineTo(i * 64 + s, s);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function shadowTexture(three: T3) {
  return canvasTexture(three, 128, (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.45)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
  });
}

/**
 * A small studio environment (soft boxes over a warm grey room) baked once per
 * renderer. It gives the beads and glasses real reflections and the fur a
 * gentle ambient wrap; without it glossy plastic and gold render flat.
 */
const ENV_CACHE = new WeakMap<object, TTexture>();
function studioEnvironment(three: T3, renderer: TRenderer | undefined): TTexture | null {
  if (!renderer) return null;
  try {
    const cached = ENV_CACHE.get(renderer);
    if (cached) return cached;
    const scene = new three.Scene();
    scene.background = new three.Color('#5d5752');
    const panel = (w: number, h: number, pos: [number, number, number], color: string, power: number) => {
      const mesh = new three.Mesh(
        new three.PlaneGeometry(w, h),
        new three.MeshBasicMaterial({
          color: new three.Color(color).multiplyScalar(power),
          side: three.DoubleSide,
        }),
      );
      mesh.position.set(...pos);
      mesh.lookAt(0, 0, 0);
      scene.add(mesh);
    };
    panel(5, 3.5, [-4, 5, 6], '#fff6ea', 5);
    panel(3, 5, [6, 2, -3], '#ffffff', 3);
    panel(8, 2, [0, -5, 3], '#b8a898', 0.9);
    panel(3, 3, [5, 1, 5], '#eaf0ff', 1.2);
    const pmrem = new three.PMREMGenerator(renderer);
    const env = pmrem.fromScene(scene, 0.03).texture;
    pmrem.dispose();
    ENV_CACHE.set(renderer, env);
    return env;
  } catch {
    return null;
  }
}

interface Kit {
  three: T3;
  env: TTexture | null;
  thread: TTexture;
  grain: TTexture;
  finish: PlushieFinish;
  /** Wrap a geometry in a short shell-fur coat (felt pieces, pompoms, beanie). */
  fuzzy: (geometry: TGeometry, color: string, length: number) => TMesh;
}

/**
 * The accessory material for the kit's finish. `felt` pieces that are simple
 * shapes get a fur coat via {@link bead}; everything else (frames, extrusions)
 * falls back to the matte look here.
 */
function finishMaterial(k: Kit, color: string, finish: PlushieFinish = k.finish): TMaterial {
  const three = k.three;
  switch (finish) {
    case 'gloss':
      return plastic(k, color);
    case 'satin':
      return new three.MeshPhysicalMaterial({
        color,
        roughness: 0.48,
        clearcoat: 0.12,
        clearcoatRoughness: 0.5,
        envMap: k.env,
        envMapIntensity: 0.55,
      });
    case 'matte':
    case 'felt':
      return new three.MeshStandardMaterial({
        color,
        roughness: 0.92,
        bumpMap: k.grain,
        bumpScale: 0.6,
        envMap: k.env,
        envMapIntensity: 0.3,
      });
  }
}

/** A scaled bead / disc in the kit's finish — a fuzzy felt disc when the finish is `felt`. */
function bead(k: Kit, color: string, sx: number, sy: number, sz: number, finish: PlushieFinish = k.finish): TMesh {
  if (finish === 'felt') {
    // Scaled in the geometry, not the mesh, so the fuzz keeps its length.
    const geometry = new k.three.SphereGeometry(1, 32, 20);
    geometry.scale(sx, sy, Math.max(sz, 0.012));
    return k.fuzzy(geometry, color, 0.009);
  }
  return blob(k, finishMaterial(k, color, finish), sx, sy, sz);
}

function plastic(k: Kit, color: string, opts: {roughness?: number; metal?: boolean} = {}) {
  return new k.three.MeshPhysicalMaterial({
    color,
    roughness: opts.roughness ?? 0.18,
    metalness: opts.metal ? 1 : 0,
    clearcoat: opts.metal ? 0 : 1,
    clearcoatRoughness: 0.08,
    envMap: k.env,
    envMapIntensity: opts.metal ? 1.3 : 1,
  });
}

function felt(k: Kit, color: string) {
  return new k.three.MeshPhysicalMaterial({
    color,
    roughness: 0.92,
    sheen: 1,
    sheenRoughness: 0.5,
    sheenColor: new k.three.Color(color).lerp(new k.three.Color('#ffffff'), 0.4),
    bumpMap: k.grain,
    bumpScale: 1.2,
    envMap: k.env,
    envMapIntensity: 0.5,
  });
}

function threadMaterial(k: Kit, color: string) {
  return new k.three.MeshStandardMaterial({
    color,
    roughness: 0.75,
    map: k.thread,
    bumpMap: k.thread,
    bumpScale: 2,
    envMap: k.env,
    envMapIntensity: 0.6,
  });
}

/** Scaled sphere — beads, discs, knots. */
function blob(k: Kit, material: TMaterial, sx: number, sy: number, sz: number): TMesh {
  const mesh = new k.three.Mesh(new k.three.SphereGeometry(1, 40, 28), material);
  mesh.scale.set(sx, sy, sz);
  return mesh;
}

/** A tube along a path (embroidered strokes, glasses frames), with round caps when open. */
function tube(
  k: Kit,
  points: [number, number, number][],
  radius: number,
  material: TMaterial,
  closed = false,
): TGroup {
  const three = k.three;
  if (closed) {
    const [a, b] = [points[0], points[points.length - 1]];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6) points = points.slice(0, -1);
  }
  const curve = new three.CatmullRomCurve3(
    points.map(p => new three.Vector3(...p)),
    closed,
    'centripetal',
  );
  const geometry = new three.TubeGeometry(curve, Math.max(32, points.length * 6), radius, 12, closed);
  // Stretch u so the thread twist has the same pitch on every stroke.
  const uv = geometry.getAttribute('uv');
  const repeat = curve.getLength() / (radius * 5);
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * repeat);
  const group = new three.Group();
  group.add(new three.Mesh(geometry, material));
  if (!closed) {
    for (const p of [points[0], points[points.length - 1]]) {
      const cap = new three.Mesh(new three.SphereGeometry(radius, 16, 12), material);
      cap.position.set(...p);
      group.add(cap);
    }
  }
  return group;
}

function arc(cx: number, cy: number, r: number, from: number, to: number, n = 16): [number, number, number][] {
  return Array.from({length: n + 1}, (_, i) => {
    const t = ((from + ((to - from) * i) / n) * Math.PI) / 180;
    return [cx + Math.cos(t) * r, cy + Math.sin(t) * r, 0] as [number, number, number];
  });
}

function roundedRectPath(w: number, h: number, r: number): [number, number, number][] {
  const pts = roundedPolygon(
    [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]],
    r,
    8,
  );
  return resampleClosed(pts, 48).map(([x, y]) => [x, y, 0] as [number, number, number]);
}

// ---------------------------------------------------------------------------
// Face and accessories.
// ---------------------------------------------------------------------------

interface Eye {
  /** Squashed by `blink`. */
  lid: TObject;
  /** Moved by the look direction. */
  pupil: TObject | null;
  range: number;
}

function buildEye(k: Kit, style: PlushieEyes, size: number, color: string): {group: TGroup; eye: Eye} {
  const three = k.three;
  const group = new three.Group();
  const lid = new three.Group();
  group.add(lid);
  let pupil: TObject | null = null;
  let range = 0;
  switch (style) {
    case 'dot': {
      const r = 0.075 * size;
      pupil = bead(k, color, r, r, r * 0.55);
      range = r * 0.4;
      break;
    }
    case 'oval': {
      const r = 0.062 * size;
      pupil = bead(k, color, r * 0.8, r * 1.35, r * 0.55);
      range = r * 0.4;
      break;
    }
    case 'googly': {
      const r = 0.145 * size;
      lid.add(bead(k, '#fbfaf6', r, r, r * 0.32));
      const pr = r * 0.46;
      pupil = bead(k, color, pr, pr, pr * 0.3);
      pupil.position.z = r * 0.34;
      range = (r - pr) * 0.85;
      break;
    }
    case 'ring': {
      const r = 0.13 * size;
      lid.add(tube(k, arc(0, 0, r, 0, 360, 40), 0.017 * size, threadMaterial(k, color), true));
      const pr = r * 0.34;
      pupil = bead(k, color, pr, pr, pr * 0.55);
      range = r - pr - 0.03 * size;
      break;
    }
    case 'happy':
      lid.add(tube(k, arc(0, -0.05 * size, 0.08 * size, 25, 155), 0.017 * size, threadMaterial(k, color)));
      range = 0.012 * size;
      break;
    case 'sleepy':
      lid.add(tube(k, arc(0, 0.045 * size, 0.08 * size, 205, 335), 0.017 * size, threadMaterial(k, color)));
      range = 0.012 * size;
      break;
    case 'none':
      break;
  }
  if (pupil) lid.add(pupil);
  // Strokes with no separate pupil drift as a whole.
  return {group, eye: {lid, pupil: pupil ?? lid, range}};
}

function buildMouth(k: Kit, style: PlushieMouth, color: string): TGroup | null {
  const three = k.three;
  const group = new three.Group();
  const stroke = 0.016;
  switch (style) {
    case 'smile':
      group.add(tube(k, arc(0, 0.06, 0.1, 215, 325), stroke, threadMaterial(k, color)));
      break;
    case 'flat':
      group.add(tube(k, [[-0.07, 0, 0], [0.07, 0, 0]], stroke, threadMaterial(k, color)));
      break;
    case 'cat':
      group.add(tube(k, arc(-0.045, 0.02, 0.045, 200, 340, 10), stroke, threadMaterial(k, color)));
      group.add(tube(k, arc(0.045, 0.02, 0.045, 200, 340, 10), stroke, threadMaterial(k, color)));
      break;
    case 'open': {
      group.add(bead(k, color, 0.075, 0.095, 0.03));
      const tongue = bead(k, '#e36a7a', 0.05, 0.035, 0.014, k.finish === 'felt' ? 'felt' : 'matte');
      tongue.position.set(0, -0.048, 0.022);
      group.add(tongue);
      break;
    }
    case 'grin': {
      const shape = new three.Shape();
      shape.moveTo(-0.11, 0.02);
      shape.lineTo(0.11, 0.02);
      shape.absarc(0, 0.02, 0.11, 0, -Math.PI, true);
      const geo = new three.ExtrudeGeometry(shape, {
        depth: 0.012,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 5,
        curveSegments: 28,
      });
      group.add(k.finish === 'felt' ? k.fuzzy(geo, color, 0.009) : new three.Mesh(geo, finishMaterial(k, color)));
      const tongue = bead(k, '#e36a7a', 0.055, 0.03, 0.01, k.finish === 'felt' ? 'felt' : 'matte');
      tongue.position.set(0, -0.055, 0.03);
      group.add(tongue);
      break;
    }
    case 'none':
      return null;
  }
  return group;
}

function buildGlasses(
  k: Kit,
  style: PlushieGlasses,
  eyeX: number,
  size: number,
  color: string,
): TGroup | null {
  if (style === 'none') return null;
  const three = k.three;
  const group = new three.Group();
  const frame = finishMaterial(k, color, k.finish === 'felt' ? 'matte' : k.finish);
  const t = 0.018;
  const r = 0.17 * size;
  const lensPath =
    style === 'square' ? roundedRectPath(r * 2.15, r * 1.65, r * 0.45) : arc(0, 0, r, 0, 360, 48);
  const sides = style === 'monocle' ? [1] : [-1, 1];
  for (const s of sides) {
    const lens = tube(k, lensPath, t, frame, true);
    lens.position.x = s * eyeX;
    group.add(lens);
    if (style === 'shades') {
      const glass = new three.Mesh(
        new three.CircleGeometry(r * 0.97, 48),
        new three.MeshPhysicalMaterial({
          color: '#1b1a24',
          roughness: k.finish === 'gloss' ? 0.05 : 0.3,
          transparent: true,
          opacity: 0.88,
          clearcoat: k.finish === 'gloss' ? 1 : 0.3,
          envMap: k.env,
          envMapIntensity: k.finish === 'gloss' ? 1.4 : 0.7,
        }),
      );
      glass.position.set(s * eyeX, 0, 0.004);
      group.add(glass);
    }
    // Temple: a short arm that runs back toward the body.
    const edge = style === 'square' ? r * 1.07 : r;
    group.add(
      tube(k, [[s * (eyeX + edge), 0.02, 0], [s * (eyeX + edge + 0.05), 0.03, -0.06], [s * (eyeX + edge + 0.07), 0.03, -0.14]], t * 0.8, frame),
    );
  }
  if (style === 'monocle') {
    // A little chain dropping off the lens.
    group.add(tube(k, [[eyeX, -r, 0], [eyeX + 0.05, -r - 0.12, -0.02], [eyeX + 0.14, -r - 0.2, -0.06]], t * 0.45, plastic(k, '#caa24a', {metal: true, roughness: 0.3})));
  } else {
    const inner = eyeX - (style === 'square' ? r * 1.07 : r);
    group.add(tube(k, arc(0, -0.01, inner, 30, 150, 12).map(([x, y]) => [x, y, 0] as [number, number, number]), t * 0.85, frame));
  }
  return group;
}

/** Hat, built with its brim/base at y = 0. Returns the group and its height. */
function buildHat(
  k: Kit,
  style: PlushieHat,
  color: string | undefined,
  accent: string,
  fur: (geometry: TGeometry, color: string, length: number) => TMesh,
): {group: TGroup; height: number} | null {
  const three = k.three;
  const group = new three.Group();
  switch (style) {
    case 'top': {
      const c = color ?? '#221f26';
      const mat = felt(k, c);
      const crown = new three.Mesh(new three.CylinderGeometry(0.28, 0.3, 0.42, 48), mat);
      crown.position.y = 0.23;
      const brim = new three.Mesh(new three.CylinderGeometry(0.5, 0.5, 0.03, 64), mat);
      brim.position.y = 0.015;
      const rim = new three.Mesh(new three.TorusGeometry(0.5, 0.022, 12, 64), mat);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.02;
      const band = new three.Mesh(new three.CylinderGeometry(0.305, 0.31, 0.085, 48), felt(k, accent));
      band.position.y = 0.09;
      group.add(crown, brim, rim, band);
      return {group, height: 0.44};
    }
    case 'beanie': {
      const c = color ?? '#e0533d';
      const dome = fur(new three.SphereGeometry(0.42, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), c, 0.03);
      dome.scale.y = 0.9;
      dome.position.y = 0.08;
      const cuff = new three.Mesh(new three.CylinderGeometry(0.44, 0.44, 0.14, 48, 1), felt(k, c));
      cuff.position.y = 0.07;
      const pom = fur(new three.SphereGeometry(0.1, 32, 20), '#fbf6ec', 0.07);
      pom.position.y = 0.08 + 0.42 * 0.9 + 0.06;
      group.add(dome, cuff, pom);
      return {group, height: 0.66};
    }
    case 'party': {
      const a = color ?? accent;
      const cone = new three.Mesh(
        new three.ConeGeometry(0.22, 0.55, 48, 1, true),
        new three.MeshPhysicalMaterial({
          map: stripeTexture(three, a, '#fdf7ea'),
          roughness: 0.55,
          side: three.DoubleSide,
          clearcoat: 0.3,
          envMap: k.env,
          envMapIntensity: 0.7,
        }),
      );
      cone.position.y = 0.275;
      const pom = fur(new three.SphereGeometry(0.07, 28, 18), '#fdf7ea', 0.05);
      pom.position.y = 0.58;
      group.add(cone, pom);
      return {group, height: 0.66};
    }
    case 'crown': {
      const gold = plastic(k, color ?? '#e8b949', {metal: true, roughness: 0.28});
      gold.side = three.DoubleSide;
      const geo = new three.CylinderGeometry(0.3, 0.28, 0.2, 80, 1, true);
      const p = geo.getAttribute('position');
      const points = 5;
      for (let i = 0; i < p.count; i++) {
        if (p.getY(i) > 0) {
          const th = Math.atan2(p.getZ(i), p.getX(i));
          const w = Math.abs(Math.cos((th * points) / 2));
          p.setY(i, 0.1 + 0.17 * Math.pow(w, 3));
        }
      }
      geo.computeVertexNormals();
      const band = new three.Mesh(geo, gold);
      band.position.y = 0.1;
      group.add(band);
      for (let i = 0; i < points; i++) {
        const th = (i / points) * Math.PI * 2;
        const ball = blob(k, gold, 0.03, 0.03, 0.03);
        ball.position.set(Math.cos(th) * 0.3, 0.38, Math.sin(th) * 0.3);
        group.add(ball);
      }
      const jewel = blob(k, plastic(k, accent, {roughness: 0.05}), 0.045, 0.045, 0.025);
      jewel.position.set(0, 0.12, 0.3);
      group.add(jewel);
      return {group, height: 0.42};
    }
    case 'none':
      return null;
  }
}

function buildBowtie(k: Kit, color: string): TGroup {
  const three = k.three;
  const shape = new three.Shape();
  shape.moveTo(0, 0.03);
  shape.bezierCurveTo(-0.08, 0.06, -0.2, 0.15, -0.26, 0.11);
  shape.bezierCurveTo(-0.3, 0.06, -0.3, -0.06, -0.26, -0.11);
  shape.bezierCurveTo(-0.2, -0.15, -0.08, -0.06, 0, -0.03);
  shape.bezierCurveTo(0.08, -0.06, 0.2, -0.15, 0.26, -0.11);
  shape.bezierCurveTo(0.3, -0.06, 0.3, 0.06, 0.26, 0.11);
  shape.bezierCurveTo(0.2, 0.15, 0.08, 0.06, 0, 0.03);
  const geo = new three.ExtrudeGeometry(shape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.03,
    bevelSize: 0.022,
    bevelSegments: 6,
    curveSegments: 24,
  });
  geo.center();
  const group = new three.Group();
  if (k.finish === 'felt') {
    group.add(k.fuzzy(geo, color, 0.01));
  } else {
    const cloth =
      k.finish === 'gloss'
        ? new three.MeshPhysicalMaterial({
            color,
            roughness: 0.35,
            sheen: 0.5,
            sheenColor: new three.Color('#3a3a3a'),
            clearcoat: 0.8,
            clearcoatRoughness: 0.25,
            envMap: k.env,
            envMapIntensity: 1,
          })
        : finishMaterial(k, color);
    group.add(new three.Mesh(geo, cloth));
  }
  const knot = bead(k, color, 0.055, 0.065, 0.05);
  knot.position.z = 0.02;
  group.add(knot);
  return group;
}

// ---------------------------------------------------------------------------
// The character.
// ---------------------------------------------------------------------------

interface Rig {
  outer: TGroup;
  pivot: TGroup;
  face: TGroup;
  eyes: Eye[];
  glasses: TGroup | null;
  hat: TGroup | null;
  hatRest: [number, number];
  floaters: {object: TObject; rest: number; lift: number}[];
  shadow: TMesh | null;
  bottom: number;
  fitW: number;
  fitH: number;
  fitMid: number;
  furs: {material: TShader; uniforms: FurUniforms}[];
  bodyFur: {material: TShader; uniforms: FurUniforms};
  bodyGeometry: TGeometry;
  compensate: TObject[];
  /** Depth bias shared by every floating part (view units, set per pose). */
  bias: {value: number};
}

interface Spec {
  kind: PlushieKind;
  outline: OutlineParams;
  thickness: number;
  furGrain: number;
  fabric: FabricPreset;
  finish: PlushieFinish;
  eyes: PlushieEyes;
  eyeSize: number;
  eyeSpacing: number;
  faceY: number;
  mouth: PlushieMouth;
  cheeks: boolean;
  glasses: PlushieGlasses;
  hat: PlushieHat;
  hatSize: number;
  bowtie: boolean;
  featureColor: string;
  glassesColor: string;
  hatColor: string | undefined;
  bowtieColor: string;
  accent: string;
  cheekColor: string;
  headroom: number;
  shadow: boolean;
  renderer: TRenderer | undefined;
}

interface FabricPreset {
  fur: number;
  grain: number;
  sheen: number;
  mottle: number;
  root: number;
  gravity: number;
}

const FABRICS: Record<PlushieFabric, FabricPreset> = {
  plush: {fur: 0.05, grain: 1, sheen: 1, mottle: 0, root: 0.58, gravity: 0.35},
  // Pressed wool: a haze of very fine fibres, no gloss, uneven density.
  felt: {fur: 0.016, grain: 0.8, sheen: 0.3, mottle: 0.17, root: 0.8, gravity: 0.08},
  velvet: {fur: 0.012, grain: 0.9, sheen: 2.1, mottle: 0, root: 0.45, gravity: 0},
  shaggy: {fur: 0.11, grain: 1.7, sheen: 0.8, mottle: 0.06, root: 0.5, gravity: 0.7},
  fleece: {fur: 0.06, grain: 2.8, sheen: 0.45, mottle: 0.14, root: 0.55, gravity: -0.2},
};

/**
 * Pull a standard material's depth toward the camera by `bias` (view units)
 * without moving it on screen: the vertex slides along its own view ray.
 * Floating parts use it so they always win against the fur in front of the
 * body, yet still hide behind it when the plush turns away.
 */
function applyDepthBias(material: TMaterial, bias: {value: number}) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uBias = bias;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uBias;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
mvPosition.xyz += normalize(-mvPosition.xyz) * uBias;
gl_Position = projectionMatrix * mvPosition;`,
      );
  };
  material.customProgramCacheKey = () => 'plushies-depth-bias';
}

/** Where the eye line sits per silhouette, relative to the centroid. */
const FACE_LIFT: Partial<Record<PlushieKind, number>> = {
  triangle: 0.2,
  heart: 0.14,
  star: 0.06,
  cloud: 0.04,
  ghost: 0.1,
  drop: -0.02,
  arch: 0.08,
  bean: -0.04,
};

function buildRig(three: T3, spec: Spec): Rig {
  const env = studioEnvironment(three, spec.renderer);
  const strand = 0.0115 * spec.furGrain;
  const bias = {value: 0};
  const furs: Rig['furs'] = [];
  const fuzzy = (geometry: TGeometry, color: string, length: number) => {
    const fur = furMaterial(three, {
      length,
      strand: Math.min(strand, 0.0115) * 0.8,
      gravity: 0.15,
      root: 0.7,
      layers: 10,
      sheen: 0.6,
      bias,
    });
    setFurColor(fur, toRgb(three, color));
    furs.push(fur);
    return new three.Mesh(furShells(three, geometry, 10), fur.material);
  };
  const kit: Kit = {
    three,
    env,
    thread: threadTexture(three),
    grain: grainTexture(three, 7),
    finish: spec.finish,
    fuzzy,
  };

  const outline = silhouette(spec.kind, spec.outline);
  const body = inflate(three, outline, spec.thickness);
  let minY = Infinity;
  let maxX = 0;
  for (const [x, y] of outline) {
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, Math.abs(x));
  }
  const bottom = minY;
  // Top of the head along the middle — where a hat perches.
  let top = -Infinity;
  for (const [x, y] of outline) if (Math.abs(x) < 0.35) top = Math.max(top, y);

  const outer = new three.Group();
  const pivot = new three.Group();
  pivot.position.y = bottom;
  outer.add(pivot);
  const inner = new three.Group();
  inner.position.y = -bottom;
  pivot.add(inner);

  const bodyFur = furMaterial(three, {
    length: spec.fabric.fur,
    strand,
    sheen: spec.fabric.sheen,
    mottle: spec.fabric.mottle,
    root: spec.fabric.root,
    gravity: spec.fabric.gravity,
  });
  const bodyMesh = new three.Mesh(furShells(three, body.geometry), bodyFur.material);
  inner.add(bodyMesh);

  const floaters: Rig['floaters'] = [];
  const compensate: TObject[] = [];
  const [cx, cy] = body.center;
  const eyeY = cy + 0.12 + (FACE_LIFT[spec.kind] ?? 0) + spec.faceY;
  const eyeX = 0.19 * spec.eyeSpacing * Math.max(0.8, spec.eyeSize);
  const gap = 0.07;
  const surface = (x: number, y: number) => body.heightAt(x, y) + gap;

  // The face turns about the body centre, so a look sweeps it across the
  // front like features on a ball.
  const face = new three.Group();
  face.position.set(cx, eyeY, 0);
  inner.add(face);
  const place = (object: TObject, x: number, y: number, lift = 0) => {
    object.position.set(x - cx, y - eyeY, surface(x, y) + lift);
    face.add(object);
    floaters.push({object, rest: object.position.z, lift: 1});
    compensate.push(object);
  };

  const eyes: Eye[] = [];
  if (spec.eyes !== 'none') {
    for (const s of [-1, 1]) {
      const {group, eye} = buildEye(kit, spec.eyes, spec.eyeSize, spec.featureColor);
      place(group, cx + s * eyeX, eyeY);
      eyes.push(eye);
    }
  }
  const mouth = buildMouth(kit, spec.mouth, spec.featureColor);
  if (mouth) place(mouth, cx, eyeY - 0.2 - 0.04 * spec.eyeSize);
  if (spec.cheeks) {
    for (const s of [-1, 1]) {
      // Scaled in the geometry, not the mesh, so the fur keeps its length.
      const disc = new three.SphereGeometry(1, 32, 16);
      disc.scale(0.085, 0.055, 0.022);
      const cheek = fuzzy(disc, spec.cheekColor, 0.014);
      const x = cx + s * (eyeX + 0.1);
      place(cheek, x, eyeY - 0.13);
    }
  }
  let glasses: TGroup | null = null;
  if (spec.glasses !== 'none') {
    glasses = buildGlasses(kit, spec.glasses, eyeX, Math.max(0.85, spec.eyeSize), spec.glassesColor);
    if (glasses) {
      place(glasses, cx, eyeY, 0.05);
      // Glasses go in front of whatever sits under the lenses. Measured from
      // the face centre alone, they sink behind the eyes and cheeks wherever
      // the face dips between them (the heart's cleft).
      face.updateWorldMatrix(true, true);
      const toFace = face.matrixWorld.clone().invert();
      const inFace = (object: TObject) => new three.Box3().setFromObject(object).applyMatrix4(toFace);
      const lenses = inFace(glasses);
      let front = -Infinity;
      for (const child of face.children) {
        if (child === glasses) continue;
        const box = inFace(child);
        if (box.max.x < lenses.min.x || box.min.x > lenses.max.x) continue;
        if (box.max.y < lenses.min.y || box.min.y > lenses.max.y) continue;
        front = Math.max(front, box.max.z);
      }
      // Clearance for the fur on fuzzy parts, which the boxes don't include.
      glasses.position.z += Math.max(0, front + 0.03 - lenses.min.z);
      floaters[floaters.length - 1].rest = glasses.position.z;
    }
  }
  if (spec.bowtie) {
    const tie = buildBowtie(kit, spec.bowtieColor);
    tie.scale.setScalar(0.85);
    // Floats over the bottom seam, like a collar with no neck behind it.
    const y = bottom + 0.17;
    tie.position.set(0, y, surface(0, y) + 0.04);
    tie.userData.bowtie = true;
    inner.add(tie);
    floaters.push({object: tie, rest: tie.position.z, lift: 0.6});
  }

  let hat: TGroup | null = null;
  let hatTop = top;
  const hatRest: [number, number] = [0, top];
  const hatParts = buildHat(kit, spec.hat, spec.hatColor, spec.accent, fuzzy);
  if (hatParts) {
    hat = new three.Group();
    hat.add(hatParts.group);
    hat.scale.setScalar(spec.hatSize);
    // Hovering just over the head, a touch sunk so it reads as worn.
    hatRest[1] = top - 0.1 * spec.hatSize;
    hat.position.set(0, hatRest[1], 0);
    hat.rotation.z = -0.12;
    inner.add(hat);
    hatTop = hatRest[1] + (hatParts.height + 0.1) * spec.hatSize;
  }

  // Every floating part beats the fur in depth (the fuzzy ones get the same
  // uniform through `fuzzy`).
  const biased = new Set<TMaterial>();
  for (const root of [face, hat, inner.children.find(c => c.userData.bowtie)]) {
    root?.traverse(child => {
      const material = (child as TMesh).material as TMaterial | TMaterial[] | undefined;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        if (!(m instanceof three.ShaderMaterial) && !biased.has(m)) {
          biased.add(m);
          applyDepthBias(m, bias);
        }
      }
    });
  }

  let shadow: TMesh | null = null;
  if (spec.shadow) {
    shadow = new three.Mesh(
      new three.PlaneGeometry(1, 1),
      new three.MeshBasicMaterial({
        map: shadowTexture(three),
        color: '#000000',
        transparent: true,
        depthWrite: false,
        opacity: 0.4,
      }),
    );
    shadow.renderOrder = -1;
    outer.add(shadow);
  }

  const shadowBottom = bottom - 0.14;
  const fitTop = hatTop + 0.08 + spec.headroom * 2;
  return {
    outer,
    pivot,
    face,
    eyes,
    glasses,
    hat,
    hatRest,
    floaters,
    shadow,
    bottom,
    fitW: 2 * (maxX + 0.12),
    fitH: fitTop - shadowBottom,
    fitMid: (fitTop + shadowBottom) / 2,
    furs,
    bodyFur,
    bodyGeometry: bodyMesh.geometry,
    compensate,
    bias,
  };
}

function addLights(three: T3, root: TGroup) {
  root.add(new three.HemisphereLight('#fffaf2', '#6e655d', 1.25));
  const key = new three.DirectionalLight('#fff4e4', 2.3);
  key.position.set(-300, 420, 520);
  const rim = new three.DirectionalLight('#ffffff', 2.4);
  rim.position.set(380, 260, -420);
  const fill = new three.DirectionalLight('#e8eeff', 0.55);
  fill.position.set(420, -120, 400);
  root.add(key, rim, fill);
}

// ---------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------

/** Build-time options: the character's look. Changing them means a new plushie. */
export interface PlushieOptions {
  /** Body silhouette. (default: 'circle') */
  kind?: PlushieKind;
  /** How soft the silhouette's corners are, 0..1. (default: 0.6) */
  roundness?: number;
  /** Corner count for `polygon` (default 6), points of a `star` (default 5), petals of a `flower` (default 6). */
  sides?: number;
  /** Inner radius of a `star` relative to its points, 0.2..0.9. (default: 0.55) */
  starInner?: number;
  /** Seed for the `blob` silhouette — each seed is a different lump. (default: 1) */
  seed?: number;
  /** Stuffing: how thick the pillow is relative to its half-width. (default: 0.42) */
  thickness?: number;
  /** Body fabric preset: plush, felt, velvet, shaggy, fleece. (default: 'plush') */
  fabric?: PlushieFabric;
  /** Size of one fur strand; smaller is finer, denser fur. (default: from `fabric`) */
  furGrain?: number;
  /** Surface of eyes, mouth, glasses and bow tie: gloss, satin, matte, felt. (default: 'satin') */
  finish?: PlushieFinish;
  /** Eye style. (default: 'dot') */
  eyes?: PlushieEyes;
  /** Eye size multiplier. (default: 1) */
  eyeSize?: number;
  /** Distance between the eyes, multiplier. (default: 1) */
  eyeSpacing?: number;
  /** Shift the face up (+) or down (−), as a fraction of the body's half-height. (default: 0) */
  faceY?: number;
  /** Mouth style. (default: 'none') */
  mouth?: PlushieMouth;
  /** Blush discs under the eyes. (default: false) */
  cheeks?: boolean;
  /** Glasses. (default: 'none') */
  glasses?: PlushieGlasses;
  /** Hat. (default: 'none') */
  hat?: PlushieHat;
  /** Hat size multiplier. (default: 1) */
  hatSize?: number;
  /** A bow tie floating at the bottom edge. (default: false) */
  bowtie?: boolean;
  /** Eyes / mouth / eyebrows colour. (default: '#18130f') */
  featureColor?: string;
  /** Glasses frame colour. (default: featureColor) */
  glassesColor?: string;
  /** Hat colour; each hat has a sensible default. */
  hatColor?: string;
  /** Bow-tie colour. (default: featureColor) */
  bowtieColor?: string;
  /** Second colour for hat bands, party-hat stripes and crown jewels. (default: '#5b6cff') */
  accentColor?: string;
  /** Blush colour. (default: '#f08a9b') */
  cheekColor?: string;
  /** Empty space kept above the character for hops and accessories, fraction of body height. (default: 0.22) */
  headroom?: number;
  /** Soft contact shadow under the body. (default: true) */
  shadow?: boolean;
  /** Add the built-in light rig to `object`. Turn off to light it yourself. (default: true) */
  lights?: boolean;
  /**
   * The renderer that will draw the plushie. Used once to bake a small studio
   * environment map that gives beads, glasses and the crown their reflections;
   * without it those render without reflections.
   */
  renderer?: TRenderer;
}

/** Everything that can change every frame. All fields are cheap to update. */
export interface PlushiePose {
  /** Box the character fits into, in pixels. (default: 600) */
  width: number;
  /** (default: 600) */
  height: number;
  /** Device pixels per pixel — picks how many fur shells are worth drawing. (default: 1) */
  pixelRatio: number;
  /** Eye direction, −1 left .. 1 right. */
  lookX: number;
  /** Eye direction, −1 up .. 1 down. */
  lookY: number;
  /** 0 open .. 1 closed. */
  blink: number;
  /** +1 squashed .. −1 stretched, volume preserving, pivoting on the bottom. */
  squash: number;
  /** Jump height in pixels. */
  hop: number;
  /** Lean in degrees, clockwise, about the bottom. */
  lean: number;
  /** Turn about the vertical axis in degrees. */
  turn: number;
  /** Accessory float multiplier (1 = rest). */
  float: number;
  /** Fur length as a fraction of the half-width. (default: from `fabric`) */
  fur: number;
  /** Fur colour. (default: '#f2b33d') */
  color: PlushieColor;
}

export interface Plushie {
  /** Add this to your scene. Laid out in pixels, y up, centred on the origin. */
  readonly object: TGroup;
  /** The current pose. */
  readonly pose: Readonly<PlushiePose>;
  /** Merge `pose` into the current pose and apply it. */
  set(pose: Partial<PlushiePose>): void;
  /** Free geometries, materials and textures (not the shared environment map). */
  dispose(): void;
}

export const DEFAULT_POSE: Readonly<Omit<PlushiePose, 'fur'>> = {
  width: 600,
  height: 600,
  pixelRatio: 1,
  lookX: 0,
  lookY: 0,
  blink: 0,
  squash: 0,
  hop: 0,
  lean: 0,
  turn: 0,
  float: 1,
  color: '#f2b33d',
};

/** The defaults `createPlushie` fills in for options you leave out (colours that follow other options are omitted). */
export const DEFAULT_OPTIONS = {
  kind: 'circle',
  roundness: 0.6,
  starInner: 0.55,
  seed: 1,
  thickness: 0.42,
  fabric: 'plush',
  finish: 'satin',
  eyes: 'dot',
  eyeSize: 1,
  eyeSpacing: 1,
  faceY: 0,
  mouth: 'none',
  cheeks: false,
  glasses: 'none',
  hat: 'none',
  hatSize: 1,
  bowtie: false,
  featureColor: '#18130f',
  accentColor: '#5b6cff',
  cheekColor: '#f08a9b',
  headroom: 0.22,
  shadow: true,
  lights: true,
} as const satisfies PlushieOptions;

/** Every body silhouette, in display order. */
export const PLUSHIE_KINDS: readonly PlushieKind[] = [
  'circle', 'square', 'triangle', 'heart', 'star', 'pill', 'cloud', 'polygon', 'blob',
  'egg', 'drop', 'ghost', 'bean', 'flower', 'diamond', 'squircle', 'arch',
];
export const PLUSHIE_FABRICS: readonly PlushieFabric[] = ['plush', 'felt', 'velvet', 'shaggy', 'fleece'];
export const PLUSHIE_FINISHES: readonly PlushieFinish[] = ['gloss', 'satin', 'matte', 'felt'];
export const PLUSHIE_EYES: readonly PlushieEyes[] = ['dot', 'oval', 'googly', 'ring', 'happy', 'sleepy', 'none'];
export const PLUSHIE_MOUTHS: readonly PlushieMouth[] = ['none', 'smile', 'grin', 'open', 'flat', 'cat'];
export const PLUSHIE_GLASSES: readonly PlushieGlasses[] = ['none', 'round', 'square', 'monocle', 'shades'];
export const PLUSHIE_HATS: readonly PlushieHat[] = ['none', 'top', 'beanie', 'party', 'crown'];

/** The default fur length of a fabric preset. */
export function fabricFur(fabric: PlushieFabric = 'plush'): number {
  return (FABRICS[fabric] ?? FABRICS.plush).fur;
}

/**
 * The flat silhouette a plushie is inflated from, as a closed counter-clockwise
 * polyline fitted into [-1, 1] (y up). Handy for icons and hit areas.
 */
export function plushieOutline(
  kind: PlushieKind = 'circle',
  options: Pick<PlushieOptions, 'roundness' | 'sides' | 'starInner' | 'seed'> = {},
): [number, number][] {
  const {roundness = 0.6, sides, starInner = 0.55, seed = 1} = options;
  return silhouette(kind, {roundness, sides, starInner, seed});
}

/** Number of fur shells drawn at most (each is one pass over the body). */
export const MAX_FUR_SHELLS = FUR_SHELLS;

/**
 * Build a plushie. `three` is your `three` module (`import * as THREE from 'three'`).
 * The second argument takes the look (`PlushieOptions`) and, optionally, the
 * initial pose.
 */
export function createPlushie(
  three: ThreeModule,
  options: PlushieOptions & Partial<PlushiePose> = {},
): Plushie {
  const {
    kind = 'circle',
    roundness = 0.6,
    sides,
    starInner = 0.55,
    seed = 1,
    thickness = 0.42,
    fabric = 'plush',
    furGrain,
    finish = 'satin',
    eyes = 'dot',
    eyeSize = 1,
    eyeSpacing = 1,
    faceY = 0,
    mouth = 'none',
    cheeks = false,
    glasses = 'none',
    hat = 'none',
    hatSize = 1,
    bowtie = false,
    featureColor = '#18130f',
    glassesColor,
    hatColor,
    bowtieColor,
    accentColor = '#5b6cff',
    cheekColor = '#f08a9b',
    headroom = 0.22,
    shadow = true,
    lights = true,
    renderer,
    ...initial
  } = options;
  const preset = FABRICS[fabric] ?? FABRICS.plush;
  const spec: Spec = {
    kind,
    outline: {roundness, sides, starInner, seed},
    thickness,
    furGrain: furGrain ?? preset.grain,
    fabric: preset,
    finish,
    eyes,
    eyeSize,
    eyeSpacing,
    faceY: faceY * 0.5,
    mouth,
    cheeks,
    glasses,
    hat,
    hatSize,
    bowtie,
    featureColor,
    glassesColor: glassesColor ?? featureColor,
    hatColor,
    bowtieColor: bowtieColor ?? featureColor,
    accent: accentColor,
    cheekColor,
    headroom,
    shadow,
    renderer,
  };

  const object = new three.Group();
  object.name = 'Plushie';
  if (lights) addLights(three, object);
  const rig = buildRig(three, spec);
  object.add(rig.outer);

  const pose: PlushiePose = {...DEFAULT_POSE, fur: preset.fur};
  for (const key of Object.keys(initial) as (keyof PlushiePose)[]) {
    if (initial[key] !== undefined) (pose as unknown as Record<string, unknown>)[key] = initial[key];
  }
  applyPose(rig, pose, toRgb(three, pose.color));

  return {
    object,
    pose,
    set(next) {
      Object.assign(pose, next);
      applyPose(rig, pose, toRgb(three, pose.color));
    },
    dispose() {
      const env = studioEnvironment(three, renderer);
      object.traverse(node => {
        const mesh = node as TMesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) {
          for (const value of Object.values(material)) {
            if (value instanceof three.Texture && value !== env) value.dispose();
          }
          material.dispose();
        }
      });
      object.removeFromParent();
    },
  };
}

/** Apply a pose to the rig. Idempotent: the same pose always gives the same object state. */
function applyPose(rig: Rig, p: PlushiePose, color: Rgb) {
  const k = Math.min(p.width / rig.fitW, p.height / rig.fitH) * 0.96;
  const hop = p.hop / k;
  rig.outer.scale.setScalar(k);
  rig.outer.position.y = -rig.fitMid * k;

  const sq = Math.max(-0.95, Math.min(0.95, p.squash));
  const sy = sq >= 0 ? 1 - 0.38 * sq : 1 + 0.32 * -sq;
  const sx = 1 / Math.sqrt(sy);
  const {pivot} = rig;
  pivot.position.y = rig.bottom + hop;
  pivot.scale.set(sx, sy, sx);
  pivot.rotation.set(0, (p.turn * Math.PI) / 180, (-p.lean * Math.PI) / 180);

  // Floating parts only half-follow the squash — they are not sewn on.
  for (const object of rig.compensate) {
    object.scale.x = object.scale.x / (object.userData.sx ?? 1);
    object.scale.y = object.scale.y / (object.userData.sy ?? 1);
    const cx = 1 + (1 / sx - 1) * 0.5;
    const cy = 1 + (1 / sy - 1) * 0.5;
    object.userData.sx = cx;
    object.userData.sy = cy;
    object.scale.x *= cx;
    object.scale.y *= cy;
  }
  const float = p.float;
  for (const f of rig.floaters) {
    f.object.position.z = f.rest + (float - 1) * 0.05 * f.lift;
  }
  if (rig.hat) {
    // Stretching throws the hat up; squashing presses it down less than the body.
    const lift = (float - 1) * 0.07 + Math.max(0, -sq) * 0.06;
    rig.hat.position.y = rig.hatRest[1] + lift;
    rig.hat.scale.x = (rig.hat.scale.z / sx) * (1 + (sx - 1) * 0.3);
    rig.hat.scale.y = (rig.hat.scale.z / sy) * (1 + (sy - 1) * 0.3);
  }

  const lx = Math.max(-1.5, Math.min(1.5, p.lookX));
  const ly = Math.max(-1.5, Math.min(1.5, p.lookY));
  rig.face.rotation.set(ly * 0.16, lx * 0.24, 0);
  const blink = Math.max(0, Math.min(1, p.blink));
  for (const eye of rig.eyes) {
    eye.lid.scale.y = 1 - 0.93 * blink;
    if (eye.pupil) {
      const pupilBase = eye.pupil.userData.base ?? [eye.pupil.position.x, eye.pupil.position.y];
      eye.pupil.userData.base = pupilBase;
      eye.pupil.position.x = pupilBase[0] + lx * eye.range;
      eye.pupil.position.y = pupilBase[1] - ly * eye.range;
    }
  }

  const fur = Math.max(0, p.fur);
  // Floating parts sit a gap in front of the body, but fur, squash and
  // turning can close it: pull their depth forward by the fur length plus a
  // margin — well under the body's own thickness, so they still hide behind
  // it when the plush turns its back.
  rig.bias.value = ((fur + 0.1) * k) / 100;
  rig.bodyFur.uniforms.uFur.value = fur;
  // Shells are the whole cost of the fur, so draw about one per 0.8 px of
  // on-screen fur length: a small plush needs a handful, a full-screen one
  // the lot.
  const furPx = fur * k * p.pixelRatio;
  const layers = Math.max(3, Math.min(FUR_SHELLS, Math.ceil(furPx / 0.8)));
  rig.bodyFur.uniforms.uLayers.value = layers;
  rig.bodyGeometry.setDrawRange(0, rig.bodyGeometry.userData.indexPerLayer * (layers + 1));
  setFurColor(rig.bodyFur, color);

  if (rig.shadow) {
    const air = Math.max(0, hop);
    const spread = 1 / (1 + air * 1.6);
    rig.shadow.scale.set(rig.fitW * 0.78 * sx * spread, 0.2 * spread, 1);
    rig.shadow.position.set(0, rig.bottom + 0.005, -0.25);
    (rig.shadow.material as InstanceType<T3['MeshBasicMaterial']>).opacity = 0.42 * spread;
  }
}
