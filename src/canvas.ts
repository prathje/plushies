/**
 * Canvas apps: point at things drawn on a canvas, and draw the "working on
 * this" glow into your own canvas instead of as an HTML overlay.
 *
 *   // Point at a shape the app draws at (x, y, w, h) in canvas pixels:
 *   cursor.pointAt(fromCanvas(canvas, () => shape.bounds()));
 *
 *   // In your render loop, after drawing the scene:
 *   paintHighlight(ctx, shape.bounds(), '#7c3aed', {busy: true});
 */
import type {Box, Target} from './index';

/** A box in a canvas's own coordinates: drawing-buffer pixels unless `size` says otherwise. */
export interface CanvasBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A pointing target for something drawn on `canvas`. `box` is in the canvas's
 * coordinates — its drawing buffer (canvas.width × canvas.height), or `size`
 * when you lay out in other units (scene pixels, CSS pixels). Re-read every
 * frame, so the cursor follows the shape as it moves.
 */
export function fromCanvas(canvas: HTMLCanvasElement, box: CanvasBox | (() => CanvasBox | null), size?: {width: number; height: number}): Target {
  return () => {
    const b = typeof box === 'function' ? box() : box;
    if (!b || !canvas.isConnected) return null;
    const layer = layerOrigin(canvas);
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / (size?.width ?? canvas.width);
    const sy = rect.height / (size?.height ?? canvas.height);
    return {
      left: rect.left - layer.left + b.x * sx,
      top: rect.top - layer.top + b.y * sy,
      width: b.width * sx,
      height: b.height * sy,
    } satisfies Box;
  };
}

/** The cursor layer's origin for a canvas: the nearest `.pc-layer` in its positioned ancestors, else the page. */
function layerOrigin(canvas: HTMLCanvasElement): {left: number; top: number} {
  for (let node: Element | null = canvas.parentElement; node; node = node.parentElement) {
    const layer = node.querySelector(':scope > .pc-layer');
    if (layer) return layer.getBoundingClientRect();
  }
  return {left: 0, top: 0};
}

export interface PaintHighlightOptions {
  /** Working: the tint breathes and a light runs round the border. (default: true) */
  busy?: boolean;
  /** Timestamp for the animation. (default: performance.now()) */
  now?: number;
  /** Line width in canvas pixels. (default: 2) */
  lineWidth?: number;
  /** Corner radius. (default: 6) */
  radius?: number;
}

const BREATH_MS = 2400;
const LAP_MS = 2200;

/**
 * Draw the glow round `box` (or a quad, for a rotated shape) into a 2D
 * context, in its current transform — VideoZero's agent mark: a tint that
 * breathes while working, a solid outline, and a light running round it.
 * Call it every frame while it should show; request frames while `busy`.
 */
export function paintHighlight(
  ctx: CanvasRenderingContext2D,
  box: CanvasBox | {x: number; y: number}[],
  color: string,
  options: PaintHighlightOptions = {},
) {
  const {busy = true, now = performance.now(), lineWidth = 2, radius = 6} = options;
  const quad = Array.isArray(box)
    ? box
    : [
        {x: box.x, y: box.y},
        {x: box.x + box.width, y: box.y},
        {x: box.x + box.width, y: box.y + box.height},
        {x: box.x, y: box.y + box.height},
      ];
  const outline = () => {
    ctx.beginPath();
    if (Array.isArray(box)) {
      quad.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.closePath();
    } else ctx.roundRect(box.x, box.y, box.width, box.height, radius);
  };
  ctx.save();
  const breath = 0.5 - 0.5 * Math.cos((now / BREATH_MS) * 2 * Math.PI);
  outline();
  ctx.globalAlpha = busy ? 0.14 + 0.14 * breath : 0.22;
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = color;
  ctx.stroke();
  if (busy) {
    // The light: a dash running round the outline, quick through the middle
    // of each lap and easing at its ends; a pale tint of the colour, glowing.
    const perimeter = quad.reduce((sum, p, i) => sum + Math.hypot(quad[(i + 1) % 4].x - p.x, quad[(i + 1) % 4].y - p.y), 0);
    const t = (now % LAP_MS) / LAP_MS;
    const head = (t - (0.92 / (2 * Math.PI)) * Math.sin(2 * Math.PI * t)) * perimeter;
    const tail = Math.min(perimeter * 0.3, 160);
    outline();
    ctx.setLineDash([tail, perimeter - tail]);
    ctx.lineDashOffset = -(head - tail);
    ctx.lineCap = 'round';
    ctx.strokeStyle = mixWhite(color, 0.72);
    ctx.shadowColor = mixWhite(color, 0.4);
    ctx.shadowBlur = 6;
    ctx.stroke();
  }
  ctx.restore();
}

function mixWhite(hex: string, w: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  const mix = (c: number) => Math.round(c + (255 - c) * w);
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`;
}
