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
import {mixWhite} from './dom';
import type {VirtualElement} from './index';

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
 * frame, so the cursor follows the shape as it moves. Works with cursors in
 * any container, and with borders, padding and CSS transforms on the canvas.
 */
export function fromCanvas(
  canvas: HTMLCanvasElement,
  box: CanvasBox | (() => CanvasBox | null),
  size?: {width: number; height: number},
): VirtualElement {
  return {
    getBoundingClientRect() {
      const b = typeof box === 'function' ? box() : box;
      if (!b || !canvas.isConnected) return null;
      // The drawing maps onto the content box: inside the border and padding.
      const rect = canvas.getBoundingClientRect();
      const scale = canvas.offsetWidth ? rect.width / canvas.offsetWidth : 1;
      const style = getComputedStyle(canvas);
      const left = canvas.clientLeft + parseFloat(style.paddingLeft);
      const top = canvas.clientTop + parseFloat(style.paddingTop);
      const width = canvas.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = canvas.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      const sx = (width * scale) / (size?.width ?? canvas.width);
      const sy = (height * scale) / (size?.height ?? canvas.height);
      return {
        left: rect.left + left * scale + b.x * sx,
        top: rect.top + top * scale + b.y * sy,
        width: b.width * sx,
        height: b.height * sy,
      };
    },
  };
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

type Point = {x: number; y: number};
const isPolygon = (box: CanvasBox | readonly Point[]): box is readonly Point[] => Array.isArray(box);

const BREATH_MS = 2400;
const LAP_MS = 2200;

/**
 * Draw the glow round `box` (or a polygon, e.g. a rotated shape's corners) into a 2D
 * context, in its current transform — VideoZero's agent mark: a tint that
 * breathes while working, a solid outline, and a light running round it.
 * Call it every frame while it should show; request frames while `busy`.
 */
export function paintHighlight(
  ctx: CanvasRenderingContext2D,
  box: CanvasBox | readonly Point[],
  color: string,
  options: PaintHighlightOptions = {},
) {
  const {busy = true, now = performance.now(), lineWidth = 2, radius = 6} = options;
  const points = isPolygon(box)
    ? box
    : [
        {x: box.x, y: box.y},
        {x: box.x + box.width, y: box.y},
        {x: box.x + box.width, y: box.y + box.height},
        {x: box.x, y: box.y + box.height},
      ];
  const n = points.length;
  if (n < 3) return;
  const outline = () => {
    ctx.beginPath();
    if (isPolygon(box)) {
      // Round each corner, never by more than half its shorter edge.
      const mid = (a: Point, b: Point) => ({x: (a.x + b.x) / 2, y: (a.y + b.y) / 2});
      const start = mid(points[n - 1], points[0]);
      ctx.moveTo(start.x, start.y);
      points.forEach((p, i) => {
        const prev = points[(i + n - 1) % n];
        const next = points[(i + 1) % n];
        const r = Math.min(radius, Math.hypot(p.x - prev.x, p.y - prev.y) / 2, Math.hypot(next.x - p.x, next.y - p.y) / 2);
        ctx.arcTo(p.x, p.y, next.x, next.y, r);
      });
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
    const perimeter = points.reduce((sum, p, i) => sum + Math.hypot(points[(i + 1) % n].x - p.x, points[(i + 1) % n].y - p.y), 0);
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
