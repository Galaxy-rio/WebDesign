import { referencePalette } from './reference-fields.ts';

type RGB = [number, number, number];
type Parameters = Record<string, number | string>;
const BASE_TIME = 20.75;
const SAMPLES = 96;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

export interface PrismStrip {
  start: number;
  end: number;
  colors: RGB[];
}

interface PrismParameters {
  count: number;
  shape: string;
  direction: number;
  size: number;
  height: number;
  focus: number;
  position: number;
  blend: number;
  facets: number;
  motion: string;
  reverse: boolean;
}

function settings(params: Parameters): PrismParameters {
  const number = (key: string, fallback: number, min = 0, max = 100) => {
    const value = Number(params[key] ?? fallback);
    return Number.isFinite(value) ? clamp(value, min, max) : fallback;
  };
  const option = (key: string, fallback: string, values: string[]) => {
    const value = String(params[key] ?? fallback).toLowerCase();
    return values.includes(value) ? value : fallback;
  };
  return {
    count: Math.round(number('count', 11, 3, 16)),
    shape: option('shape', 'crest', ['crest', 'valley', 'tide', 'slant', 'lens']),
    direction: ['up', 'right', 'down', 'left'].indexOf(option('direction', 'up', ['up', 'right', 'down', 'left'])),
    size: number('size', 100, 40, 180),
    height: number('height', 60), focus: number('focus', 50), position: number('position', 50),
    blend: number('blend', 65), facets: number('facets', 35),
    motion: option('motion', 'expand', ['expand', 'gather', 'breathe']),
    reverse: String(params.reverse ?? 'Normal').toLowerCase() === 'reversed',
  };
}

function sampleRamp(ramp: RGB[], position: number): RGB {
  const at = clamp(position) * (ramp.length - 1), index = Math.floor(at), fraction = at - index;
  const first = ramp[index], next = ramp[Math.min(ramp.length - 1, index + 1)];
  return [first[0] + (next[0] - first[0]) * fraction,
    first[1] + (next[1] - first[1]) * fraction,
    first[2] + (next[2] - first[2]) * fraction];
}

/** Paired slats expand from the centre, each carrying a smooth vertical field. */
export function prismStrips(colors: string[], divisions: number[], params: Parameters, time = BASE_TIME): PrismStrip[] {
  const options = settings(params);
  const phase = options.motion === 'breathe' ? BASE_TIME * .48 : time * .48 * (options.motion === 'gather' ? -1 : 1);
  const reveal = smooth((time - BASE_TIME + .6) / .6);
  const revealFront = 1 - (1 - reveal) ** 3;
  const ramp = referencePalette(colors, divisions, 256);
  const background = ramp[options.reverse ? ramp.length - 1 : 0];
  const strips: PrismStrip[] = [];

  for (const side of [-1, 1]) {
    for (let band = Math.floor(-phase); band < Math.ceil(options.count - phase); band++) {
      const inner = Math.max(0, (band + phase) / options.count);
      const outer = Math.min(1, (band + 1 + phase) / options.count);
      if (outer <= inner) continue;
      const start = side < 0 ? (1 - outer) / 2 : (1 + inner) / 2;
      const end = side < 0 ? (1 - inner) / 2 : (1 + outer) / 2;
      const center = (start + end) / 2;
      const focusDistance = (center - options.focus / 100) * 2 / (options.size / 100);
      const crest = .5 - .5 * Math.cos(Math.min(1, Math.abs(focusDistance)) * Math.PI);
      const envelope = options.shape === 'valley' ? 1 - crest
        : options.shape === 'tide' ? .5 + .34 * Math.sin(focusDistance * Math.PI * 1.3 + .6) + .14 * Math.sin(focusDistance * Math.PI * 2.1 - .8)
        : options.shape === 'slant' ? smooth(.5 + focusDistance * .5) : crest;
      const breath = (options.motion === 'breathe' ? .045 : .015) * Math.sin(time * .32);
      const position = (options.position - 50) * .009;
      const bend = .28 + envelope * options.height * .006 + (options.shape === 'lens' ? 0 : position) + breath;
      const facet = (.025 * Math.sin(band * 1.8) + .012 * Math.sin(band * .73 + time * .24)) * options.facets / 35;
      const distance = Math.abs(center - .5) * 2;
      const visibility = reveal >= 1 ? 1 : reveal * (1 - smooth((distance - revealFront) / .16));
      const field: RGB[] = [];

      for (let sample = 0; sample < SAMPLES; sample++) {
        const along = sample / (SAMPLES - 1);
        const altitude = options.shape === 'lens' ? Math.abs(along - .5 - position) * 2 : along;
        const blendExtent = .22 + options.blend * .008;
        const progress = smooth((altitude - bend + .22) / blendExtent);
        const base = options.shape === 'lens' ? .16 : .02;
        const palettePosition = clamp(base + (.98 - base) * progress + facet);
        const color = sampleRamp(ramp, options.reverse ? 1 - palettePosition : palettePosition);
        field.push(color.map((value, channel) => Number((background[channel] + (value - background[channel]) * visibility).toFixed(3))) as RGB);
      }
      strips.push({ start, end, colors: field });
    }
  }
  return strips.sort((a, b) => a.start - b.start);
}

function transform(width: number, height: number, direction: number): [number, number, number, number, number, number] {
  if (direction === 1) return [0, height, -width, 0, width, 0];
  if (direction === 2) return [-width, 0, 0, -height, width, height];
  if (direction === 3) return [0, -height, width, 0, 0, height];
  return [width, 0, 0, height, 0, 0];
}

/** Render directly at display/export resolution; no low-resolution slat edges. */
export function paintPrism(
  ctx: CanvasRenderingContext2D, width: number, height: number, colors: string[],
  divisions: number[], params: Parameters, time = BASE_TIME,
): void {
  const options = settings(params);
  ctx.save();
  ctx.fillStyle = options.reverse ? colors.at(-1)! : colors[0];
  ctx.fillRect(0, 0, width, height);
  ctx.transform(...transform(width, height, options.direction));
  // One device-pixel overlap prevents antialiasing seams between adjacent slats.
  const overlap = 1 / (options.direction % 2 ? height : width);
  for (const strip of prismStrips(colors, divisions, params, time)) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 1);
    strip.colors.forEach((color, index) => gradient.addColorStop(index / (SAMPLES - 1), `rgb(${color.join(',')})`));
    ctx.fillStyle = gradient;
    ctx.fillRect(strip.start, 0, strip.end - strip.start + overlap, 1);
  }
  ctx.restore();
}

/** Pixel counterpart for deterministic tests and environments without Canvas. */
export function prismPixels(
  width: number, height: number, colors: string[], divisions: number[],
  params: Parameters, time = BASE_TIME,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const { direction } = settings(params), strips = prismStrips(colors, divisions, params, time);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = (px + .5) / width, y = (py + .5) / height;
      const across = direction === 1 ? y : direction === 2 ? 1 - x : direction === 3 ? 1 - y : x;
      const along = direction === 1 ? 1 - x : direction === 2 ? 1 - y : direction === 3 ? x : y;
      const strip = strips.find(strip => across >= strip.start && across < strip.end) ?? strips.at(-1)!;
      const color = sampleRamp(strip.colors, along);
      const offset = (py * width + px) * 4;
      pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
