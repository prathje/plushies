/** What a cursor design is made of; the core moves it, the design draws it. */

export type CursorDesign = 'live' | 'buddy' | 'island';

export interface CursorStatus {
  /** What the helper is doing, in a few words: "Rewriting the headline". */
  text: string;
  /** A quieter second line. */
  detail?: string;
  /** 0..1 for a progress bar; leave out for none. */
  progress?: number | null;
  /** Step n of m. */
  step?: [number, number];
  /** Still working on it (default: true) — false for a plain note. */
  busy?: boolean;
}

/** Everything a design shows; it re-renders when any of it changes. */
export interface CursorView {
  name: string;
  status: CursorStatus | null;
  /** A one-off message (`say`), shown over the status for a moment. */
  said: string | null;
  /** The finished message (`done`), shown for a moment. */
  done: string | null;
}

export interface Motion {
  /** The pointer's spring (rad/s); critically damped. */
  tip: number;
  /** The floating part's spring (rad/s) and its damping ratio (< 1 overshoots and sways). */
  body: number;
  damping: number;
  /** Bob up and down by this many pixels while it floats. */
  bob: number;
  /** How high `done` jumps (px); 0 squashes in place. */
  hop: number;
}

export interface Design {
  readonly kind: CursorDesign;
  /** Rigid with the pointer's tip (the cursor's origin). */
  readonly root: HTMLElement;
  /** A point that floats after the tip on its own spring, at `anchor` from it. */
  readonly body: HTMLElement;
  /** Where the plushie's canvas goes. */
  readonly plushHost: HTMLElement;
  /** Body offset from the tip at rest, for a cursor hanging right and `vertical`. */
  readonly anchor: {x: number; y: number};
  readonly motion: Motion;
  /** Which way the content hangs off the tip: 1 below it, −1 above. */
  readonly vertical: 1 | -1;
  /** The room the content needs right of the tip and in its vertical direction (px). */
  room(): {x: number; y: number};
  render(view: CursorView): void;
  /** Every frame: the body's offset from the tip and its velocity (px/s). */
  frame?(body: {x: number; y: number; vx: number; vy: number}, flip: {x: boolean; y: boolean}): void;
  /** Mouse-down look for `click`. */
  press?(): void;
  dispose(): void;
}
