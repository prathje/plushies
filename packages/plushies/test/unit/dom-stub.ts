/**
 * The core paints a few small textures on a 2D canvas. Under Bun there is no
 * DOM, so hand it a canvas whose context swallows every call — the tests
 * check geometry and pose state, not texture pixels.
 */
/** What `getImageData` reads back (first pixel, RGBA); zeros when null. */
export const readback: {pixel: number[] | null} = {pixel: null};

const context = new Proxy(
  {},
  {
    get: (_, key) => {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({addColorStop() {}});
      if (key === 'createImageData') {
        return (w: number, h: number) => ({width: w, height: h, data: new Uint8ClampedArray(w * h * 4)});
      }
      if (key === 'getImageData') {
        return (_x: number, _y: number, w: number, h: number) => {
          const data = new Uint8ClampedArray(w * h * 4);
          if (readback.pixel) data.set(readback.pixel);
          return {width: w, height: h, data};
        };
      }
      return () => {};
    },
    set: () => true,
  },
);

if (typeof document === 'undefined') {
  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`dom-stub: no <${tag}>`);
      return {width: 0, height: 0, style: {}, getContext: () => context};
    },
  };
}
