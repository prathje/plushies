/**
 * The core paints a few small textures on a 2D canvas. Under Bun there is no
 * DOM, so hand it a canvas whose context swallows every call — the tests
 * check geometry and pose state, not texture pixels.
 */
const context = new Proxy(
  {},
  {
    get: (_, key) => {
      if (key === 'createLinearGradient' || key === 'createRadialGradient') return () => ({addColorStop() {}});
      if (key === 'createImageData' || key === 'getImageData') {
        return (w: number, h: number) => ({width: w, height: h, data: new Uint8ClampedArray(w * h * 4)});
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
