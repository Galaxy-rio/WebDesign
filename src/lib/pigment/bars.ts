import type { StudioState } from './model.ts';

type RGB = [number, number, number];
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const edgeCoverage = (start: number, end: number, position: number) => {
  const t = clamp((position - start) / (end - start));
  return t * t * (3 - 2 * t);
};

/** Both Bars and Columns rise vertically. Columns is the denser configuration. */
export function barHeights(count: number, envelope: string, time: number): number[] {
  const phase = time * 1.6;
  return Array.from({ length: count }, (_, index) => {
    const position = count === 1 ? .5 : index / (count - 1);
    const curve = position ** 3 * (10 + position * (-15 + position * 6));
    const base = envelope.toLowerCase() === 'flat' ? .82
      : .14 + .76 * (envelope.toLowerCase() === 'ramp' ? position : curve);
    const motion = .5 * Math.sin(position * Math.PI + phase * .55)
      + .32 * Math.sin(position * Math.PI * 1.9 - phase * .38 + 1.7)
      + .12 * Math.sin(position * Math.PI * 3.4 + phase * .8 + .5)
      + .3 * Math.sin(phase * .27 + .8);
    return clamp(base + .11 * motion, .05, 1);
  });
}

/**
 * Spread is signed: negative values overlap neighbouring strips, while positive
 * values reveal the background between them. Every strip contains the palette
 * from its own upper edge to the bottom, with small independent colour shifts.
 */
export function barsPixels(
  width: number,
  height: number,
  state: StudioState,
  time: number,
  lookup: RGB[],
  background: RGB,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const count = Math.max(1, Math.round(Number(state.params.count ?? (state.type === 'columns' ? 18 : 7))));
  const spread = clamp(Number(state.params.gap ?? -20) / 100, -.5, .9);
  const phase = time * 1.6;
  const heights = barHeights(count, String(state.params.envelope ?? 'Ramp'), time);
  const pitch = width / count;
  const softness = Math.max(.5, pitch * .006);
  const toneAmount = spread > 0 ? .035 : .06;

  for (let pixel = 0; pixel < pixels.length; pixel += 4) {
    pixels[pixel] = background[0];
    pixels[pixel + 1] = background[1];
    pixels[pixel + 2] = background[2];
    pixels[pixel + 3] = 255;
  }

  // Draw left to right so an overlapping taller strip covers the preceding one.
  for (let bar = 0; bar < count; bar++) {
    const top = (1 - heights[bar]) * height;
    const extent = Math.max(1, height - top);
    const left = (bar + spread / 2) * pitch;
    const right = (bar + 1 - spread / 2) * pitch;
    const firstX = Math.max(0, Math.floor(left - softness));
    const lastX = Math.min(width, Math.ceil(right + softness));
    const firstY = Math.max(0, Math.ceil(top - .5));
    const shade = toneAmount * (bar % 2 === 0 ? -1 : 1)
      * (.7 + .3 * Math.sin(phase * .5 + bar * 1.7));
    const colourShift = .04 * Math.sin(phase * .45 + bar * .9);
    const coverage = new Float64Array(lastX - firstX);
    for (let x = firstX; x < lastX; x++) {
      coverage[x - firstX] = edgeCoverage(left - softness, left + softness, x + .5)
        * (1 - edgeCoverage(right - softness, right + softness, x + .5));
    }

    for (let y = firstY; y < height; y++) {
      const fraction = clamp((y + .5 - top) / extent + colourShift);
      const colour = lookup[Math.floor(fraction * (lookup.length - 1))];
      // Match the 8-bit strip buffers before compositing the anti-aliased edges.
      const adjusted = new Uint8ClampedArray(colour.map(channel =>
        shade > 0 ? channel + (255 - channel) * shade : channel * (1 + shade)));
      let pixel = (y * width + firstX) * 4;
      for (let x = firstX; x < lastX; x++, pixel += 4) {
        const alpha = coverage[x - firstX];
        if (alpha <= .001) continue;
        pixels[pixel] += (adjusted[0] - pixels[pixel]) * alpha;
        pixels[pixel + 1] += (adjusted[1] - pixels[pixel + 1]) * alpha;
        pixels[pixel + 2] += (adjusted[2] - pixels[pixel + 2]) * alpha;
      }
    }
  }
  return pixels;
}
