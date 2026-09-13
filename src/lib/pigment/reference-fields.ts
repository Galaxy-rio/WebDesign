/**
 * Field geometry and colour interpolation used by the reference designs.
 * These are self-contained drawing algorithms, without the reference site's UI
 * or runtime. Coordinates are normalized so preview and export share a design.
 */

type Triple = [number, number, number];
type Coordinates = [number, number];
type FieldParameters = Record<string, number | string>;

const TAU = Math.PI * 2;
const BASE_TIME = 20.75;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };

function rgb(hex: string): Triple {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toLab(hex: string): Triple {
  const [r, g, b] = rgb(hex).map(value => {
    const channel = value / 255;
    return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + .4505937099 * s,
    .0259040371 * l + .7827717662 * m - .808675766 * s];
}

function fromLab([l, a, b]: Triple): Triple {
  const x = (l + .3963377774 * a + .2158037573 * b) ** 3;
  const y = (l - .1055613458 * a - .0638541728 * b) ** 3;
  const z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * x - 3.3077115913 * y + .2309699292 * z,
    -1.2684380046 * x + 2.6097574011 * y - .3413193965 * z,
    -.0041960863 * x - .7034186147 * y + 1.707614701 * z].map(value => {
    const channel = value <= .0031308 ? value * 12.92 : 1.055 * Math.max(0, value) ** (1 / 2.4) - .055;
    return Math.round(clamp(channel) * 255);
  }) as Triple;
}

function mixLab(a: Triple, b: Triple, fraction: number): Triple {
  return [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction, a[2] + (b[2] - a[2]) * fraction];
}

function cssColor(color: Triple): string { return `rgb(${color.join(',')})`; }

export function mixReferenceColour(a: string, b: string, fraction: number): string {
  return '#' + fromLab(mixLab(toLab(a), toLab(b), clamp(fraction))).map(value => value.toString(16).padStart(2, '0')).join('');
}

export function referenceStops(colors: string[], positions: number[], eased = false): [string, number][] {
  const stops: [string, number][] = [[colors[0], positions[0]]];
  for (let i = 0; i < colors.length - 1; i++) {
    for (let step = 1; step <= 7; step++) {
      const t = step / 7;
      stops.push([mixReferenceColour(colors[i], colors[i + 1], eased ? smooth(t) : t), positions[i] + (positions[i + 1] - positions[i]) * t]);
    }
  }
  return stops;
}

export function referenceCentres(colors: string[], divisions: number[]): number[] {
  const edges = boundaries(colors.length, divisions);
  return colors.map((_, i) => (edges[i] + edges[i + 1]) / 2);
}

function boundaries(count: number, divisions: number[]): number[] {
  return [0, ...(divisions.length === count - 1 ? divisions : Array.from({ length: count - 1 }, (_, i) => (i + 1) / count)), 1];
}

/** The reference ramp interpolates linearly in Oklab at band-centre stops. */
export function referencePalette(colors: string[], divisions: number[], count = 256): Triple[] {
  const edges = boundaries(colors.length, divisions);
  const centers = colors.map((_, i) => (edges[i] + edges[i + 1]) / 2);
  const palette = colors.map(toLab);
  return Array.from({ length: count }, (_, index) => {
    const position = count <= 1 ? .5 : index / (count - 1);
    if (position <= centers[0]) return rgb(colors[0]);
    if (position >= centers.at(-1)!) return rgb(colors.at(-1)!);
    let left = 0;
    while (left < centers.length - 2 && position > centers[left + 1]) left++;
    const fraction = (position - centers[left]) / Math.max(.000001, centers[left + 1] - centers[left]);
    return fromLab(mixLab(palette[left], palette[left + 1], fraction));
  });
}

/** Angle zero is horizontal bands; angle 90 is vertical bands. */
export function referenceStripePixels(
  width: number, height: number, colors: string[], divisions: number[],
  params: FieldParameters, time = BASE_TIME, fast = false,
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const palette = colors.map(fast ? rgb : toLab);
  const edges = boundaries(colors.length, divisions);
  const angle = Number(params.angle ?? 0) / 180 * Math.PI;
  const sin = Math.sin(angle), cos = Math.cos(angle);
  const extent = Math.abs(sin) + Math.abs(cos) || 1;
  const feather = Number(params.softness ?? 14) / 100 * .5;
  const amplitude = Number(params.wave ?? 12) / 100 * .35;

  for (let py = 0; py < height; py++) {
    const y = (py + .5) / height - .5;
    for (let px = 0; px < width; px++) {
      const x = (px + .5) / width - .5;
      const alongBand = -x * cos + y * sin;
      const position = .5 + (x * sin + y * cos) / extent
        + amplitude * Math.sin(alongBand * 2.4 * TAU + time);
      let color: Triple = [...palette[0]];
      for (let i = 1; i < palette.length; i++) {
        const fraction = feather === 0 ? Number(position >= edges[i])
          : smooth((position - (edges[i] - feather)) / (feather * 2));
        color = mixLab(color, palette[i], fraction);
      }
      const output = fast ? color : fromLab(color);
      const offset = (py * width + px) * 4;
      pixels[offset] = output[0]; pixels[offset + 1] = output[1]; pixels[offset + 2] = output[2]; pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function flowCenter(index: number, time: number): Coordinates {
  const phase = index * .37;
  return [.5 + .5 * Math.sin(time * (.6 + (index / 3 % 1) * .9) + phase),
    .5 + .5 * Math.cos(time * (.8 + ((index + 1) / 4 % 1)) + phase * 1.5)];
}

/** Full-quality Flow blends in Oklab with inverse distance to the power 3.5. */
export function referenceFlowPixels(
  width: number, height: number, colors: string[], params: FieldParameters,
  time = BASE_TIME, points: Coordinates[] = [], weights: number[] = [],
): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(width * height * 4);
  const palette = colors.map(toLab);
  const scale = .4 + Number(params.scale ?? 50) / 100 * 1.2;
  const distortion = Number(params.distortion ?? 60) / 100;
  const swirl = Number(params.swirl ?? 10) / 100;
  const centers = colors.map((_, index) => {
    const current = flowCenter(index, time), point = points[index];
    if (!point) return current;
    const base = flowCenter(index, BASE_TIME);
    return [(point[0] - .5) / scale + .5 + .2 * (current[0] - base[0]) / scale,
      (point[1] - .5) / scale + .5 + .2 * (current[1] - base[1]) / scale];
  });

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let x = ((px + .5) / width - .5) / scale + .5;
      let y = ((py + .5) / height - .5) / scale + .5;
      const radius = smooth(Math.hypot(x - .5, y - .5));
      const influence = 1 - radius;
      for (let pass = 1; pass <= 2; pass++) {
        x += distortion * influence / pass * Math.sin(time + pass * .4 * smooth(y))
          * Math.cos(.2 * time + pass * 2.4 * smooth(y));
        y += distortion * influence / pass * Math.cos(time + pass * 2 * smooth(x));
      }
      const rotation = -3 * swirl * radius;
      const cos = Math.cos(rotation), sin = Math.sin(rotation), dx = x - .5, dy = y - .5;
      x = cos * dx - sin * dy + .5; y = sin * dx + cos * dy + .5;
      const mixed: Triple = [0, 0, 0];
      let total = 0;
      for (let i = 0; i < palette.length; i++) {
        const dx = x - centers[i][0], dy = y - centers[i][1];
        const weight = (weights[i] ?? 1) / ((dx * dx + dy * dy) ** 1.75 + .0001);
        mixed[0] += palette[i][0] * weight; mixed[1] += palette[i][1] * weight; mixed[2] += palette[i][2] * weight;
        total += weight;
      }
      const inverseTotal = 1 / Math.max(.0001, total);
      const color = fromLab(mixed.map(value => value * inverseTotal) as Triple);
      const offset = (py * width + px) * 4;
      pixels[offset] = color[0]; pixels[offset + 1] = color[1]; pixels[offset + 2] = color[2]; pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

export interface WaveLayer {
  top: number;
  bottom: number;
  path: Coordinates[];
  colors: [string, string, string];
}

/** Static, alternating shallow curves: one layer for each selected colour. */
export function referenceWaveLayers(colors: string[], divisions: number[]): WaveLayer[] {
  const edges = boundaries(colors.length, divisions);
  const white = toLab('#FFFFFF'), ink = toLab('#1C1C2E');
  return colors.map((color, index) => {
    const top = edges[index], bottom = edges[index + 1];
    const lab = toLab(color);
    const path: Coordinates[] = [];
    if (index > 0) {
      const waveIndex = index - 1;
      const edgeStrength = Math.min(1, 4 * top * (1 - top) + .5);
      const amplitude = (waveIndex % 2 === 0 ? .046 : .035) * edgeStrength;
      const frequency = .75 + waveIndex % 3 * .3;
      const phase = waveIndex * 1.9 + .6;
      for (let sample = -8; sample <= 104; sample++) {
        const x = sample / 96;
        const y = top + amplitude * Math.sin(x * TAU * frequency + phase)
          + amplitude * .16 * Math.sin(x * TAU * frequency * 2.15 + phase + Math.PI / 2 + waveIndex * .8);
        path.push([x, y]);
      }
    }
    return { top, bottom, path, colors: [cssColor(fromLab(mixLab(lab, white, .22))), color, cssColor(fromLab(mixLab(lab, ink, .14)))] };
  });
}

function waveColor(value: string): Triple {
  return value.startsWith('#') ? rgb(value) : value.slice(value.indexOf('(') + 1, -1).split(',').map(Number) as Triple;
}

function waveShade(layer: WaveLayer, palette: Triple[], height: number, y: number): Triple {
  const top = layer.top * height, end = Math.max(layer.bottom * height, top + 1);
  const position = clamp((y - top) / (end - top));
  return position <= .55 ? mixLab(palette[0], palette[1], position / .55)
    : mixLab(palette[1], palette[2], (position - .55) / .45);
}

function waveBoundary(path: Coordinates[], x: number): number {
  if (x < path[0][0] || x > path.at(-1)![0]) return Infinity;
  const at = clamp((x - path[0][0]) * 96, 0, path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(at));
  const fraction = at - index;
  return path[index][1] + (path[index + 1][1] - path[index][1]) * fraction;
}

/**
 * DOM-free counterpart to paintReferenceWaves. Blur premultiplied layer colour
 * and coverage together, with an extended field so canvas edges stay filled.
 * The direct Canvas painter remains preferable for full-resolution display.
 */
export function referenceWavePixels(
  width: number, height: number, colors: string[], divisions: number[],
): Uint8ClampedArray<ArrayBuffer> {
  const layers = referenceWaveLayers(colors, divisions);
  const composite = new Float64Array(width * height * 3);
  const background = layers[0], backgroundPalette = background.colors.map(waveColor);
  for (let y = 0; y < height; y++) {
    const color = waveShade(background, backgroundPalette, height, y + .5);
    for (let x = 0; x < width; x++) composite.set(color, (y * width + x) * 3);
  }

  // CSS blur's argument is the Gaussian standard deviation. As in the direct
  // painter, round it to a tenth of a pixel before constructing the filter.
  const sigma = Number((height * .022).toFixed(1));
  const radius = sigma > 0 ? Math.ceil(sigma * 3) : 0;
  const kernel = Array.from({ length: radius * 2 + 1 }, (_, i) => radius ? Math.exp(-((i - radius) ** 2) / (2 * sigma * sigma)) : 1);
  const total = kernel.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < kernel.length; i++) kernel[i] /= total;
  const paddedWidth = width + radius * 2, paddedHeight = height + radius * 2;

  for (const layer of layers.slice(1)) {
    const palette = layer.colors.map(waveColor);
    // Two horizontal subpixel samples retain edge coverage before filtering.
    const edgeA = Array.from({ length: paddedWidth }, (_, x) => waveBoundary(layer.path, (x - radius + .25) / width) * height);
    const edgeB = Array.from({ length: paddedWidth }, (_, x) => waveBoundary(layer.path, (x - radius + .75) / width) * height);
    const horizontal = new Float64Array(width * paddedHeight);
    const rowColors: Triple[] = [];
    const mask = new Float64Array(paddedWidth);
    for (let row = 0; row < paddedHeight; row++) {
      const y = row - radius;
      rowColors.push(waveShade(layer, palette, height, y + .5));
      for (let x = 0; x < paddedWidth; x++) {
        const bottom = Math.min(y + 1, height * 1.2);
        mask[x] = (clamp(bottom - Math.max(y, edgeA[x])) + clamp(bottom - Math.max(y, edgeB[x]))) / 2;
      }
      for (let x = 0; x < width; x++) {
        let coverage = 0;
        for (let sample = 0; sample < kernel.length; sample++) coverage += mask[x + sample] * kernel[sample];
        horizontal[row * width + x] = coverage;
      }
    }

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let alpha = 0, red = 0, green = 0, blue = 0;
        for (let sample = 0; sample < kernel.length; sample++) {
          const row = y + sample, coverage = horizontal[row * width + x] * kernel[sample];
          const color = rowColors[row];
          alpha += coverage;
          red += color[0] * coverage; green += color[1] * coverage; blue += color[2] * coverage;
        }
        const offset = (y * width + x) * 3, remaining = 1 - clamp(alpha);
        composite[offset] = red + composite[offset] * remaining;
        composite[offset + 1] = green + composite[offset + 1] * remaining;
        composite[offset + 2] = blue + composite[offset + 2] * remaining;
      }
    }
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    pixels[index * 4] = composite[index * 3];
    pixels[index * 4 + 1] = composite[index * 3 + 1];
    pixels[index * 4 + 2] = composite[index * 3 + 2];
    pixels[index * 4 + 3] = 255;
  }
  return pixels;
}

/** Draw at the final canvas dimensions, keeping the curved layers and blur crisp. */
export function paintReferenceWaves(
  ctx: CanvasRenderingContext2D, width: number, height: number,
  colors: string[], divisions: number[],
): void {
  const layers = referenceWaveLayers(colors, divisions);
  for (const [index, layer] of layers.entries()) {
    ctx.save();
    const start = layer.top * height;
    const gradient = ctx.createLinearGradient(0, start, 0, Math.max(layer.bottom * height, start + 1));
    gradient.addColorStop(0, layer.colors[0]);
    gradient.addColorStop(.55, layer.colors[1]);
    gradient.addColorStop(1, layer.colors[2]);
    ctx.fillStyle = gradient;
    if (index === 0) {
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.filter = `blur(${(height * .022).toFixed(1)}px)`;
      ctx.beginPath();
      ctx.moveTo(layer.path[0][0] * width, layer.path[0][1] * height);
      for (const [x, y] of layer.path) ctx.lineTo(x * width, y * height);
      ctx.lineTo(layer.path.at(-1)![0] * width, height * 1.2);
      ctx.lineTo(layer.path[0][0] * width, height * 1.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
