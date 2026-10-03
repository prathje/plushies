/**
 * What every use case in the demo is made of: a Scene (its mock app's tasks
 * and a line about it) and the Tasks a helper can pick up there: a target to
 * glide to, a glow, a few steps, and a change to the page at the end.
 */
import type {Highlight, PlushieCursor, Target} from '../../src/index';

export const $ = <T extends Element = HTMLElement>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector)!;
export const $$ = <T extends HTMLElement = HTMLElement>(selector: string, root: ParentNode = document) => [...root.querySelectorAll<T>(selector)];
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
/** One of `xs` other than `current` (so a change is always visible). */
export const other = <T,>(xs: readonly T[], current: T) => pick(xs.filter(x => x !== current));

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export const inflate = (b: Rect, d: number): Rect => ({x: b.x - d, y: b.y - d, width: b.width + 2 * d, height: b.height + 2 * d});

/** Whoever works a task: what a task needs of a helper. */
export interface Worker {
  color: string;
  cursor: PlushieCursor;
}
export interface Glow {
  clear(delay?: number): void;
}

export interface Task {
  id: string;
  text: string;
  steps: string[];
  finish: string;
  click?: boolean;
  target: () => Target;
  glow: (h: Worker) => Glow;
  apply: () => void;
  /** Where the work happens, in viewport pixels, when the target isn't an element (canvas work). */
  rect?: () => Rect;
}

export interface Scene {
  /** In the URL (`?scene=`) and on the markup (`data-scene`). */
  id: string;
  label: string;
  /** One line for the panel. */
  note: string;
  tasks: Task[];
}

export const htmlGlow = (element: Element) => (h: Worker) => h.cursor.highlight(element) as Highlight;

/** A task on an HTML element (by selector): glide there, glow it, change it. */
export function htmlTask(selector: string, t: Omit<Task, 'id' | 'target' | 'glow' | 'rect'>): Task {
  const element = $(selector);
  return {id: selector.slice(1), target: () => element, glow: htmlGlow(element), ...t};
}

/** The box around several elements, as something a cursor can point at and glow. */
export function union(elements: Element[]) {
  return {
    getBoundingClientRect() {
      const rs = elements.map(e => e.getBoundingClientRect());
      const left = Math.min(...rs.map(r => r.left));
      const top = Math.min(...rs.map(r => r.top));
      const right = Math.max(...rs.map(r => r.right));
      const bottom = Math.max(...rs.map(r => r.bottom));
      return {x: left, y: top, left, top, width: right - left, height: bottom - top};
    },
  };
}

/** A task on a group of HTML elements: the cursor and the glow take their union. */
export function groupTask(id: string, elements: () => Element[], t: Omit<Task, 'id' | 'target' | 'glow' | 'rect'>): Task {
  const target = () => union(elements());
  return {id, target, glow: h => h.cursor.highlight(target()), ...t};
}
