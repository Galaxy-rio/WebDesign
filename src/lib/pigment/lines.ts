import reference from '../../data/line-layouts.json' with { type: 'json' };
import { glowPath, strokePaletteColour, type GlowShape, type GlowState } from './glow.ts';

type RGB = [number, number, number];
type Point = [number, number];
interface LineLayout { id: string; name: string; shapes: Array<Partial<GlowShape>> }
export const LINE_ARRANGEMENTS = reference.layouts as LineLayout[];
export const LINE_PALETTES = reference.palettes;
export const LINE_DEFAULTS = { arrangement: 'Snake', size: 100, width: 100, amplitude: 100, curl: 100, sway: 0, body: 0, angle: 0 };
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const rgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const css = (colour: RGB) => `rgb(${colour.map(Math.round).join(' ')})`;
export function lineArrangement(name: string | number | undefined): LineLayout {
  const key = String(name ?? '').toLowerCase();
  return LINE_ARRANGEMENTS.find(layout => layout.id === key || layout.name.toLowerCase() === key) ?? LINE_ARRANGEMENTS[0];
}
export function lineShapes(params: GlowState['params']): GlowShape[] {
  return lineArrangement(params.arrangement).shapes.map((shape, index) => ({
    id: `stroke-${index}`, form: 'curve', seed: 1, turns: 3, taper: 0,
    x: 50, y: 50, reverse: false, shift: 0, span: 100,
    edgeGlow: false, edgeWidth: 36, edgeStrength: 100, edgeAngle: 90,
    ...shape,
    scale: Number(shape.scale) * clamp(Number(params.size ?? 100), 20, 180) / 100,
    width: Number(shape.width) * clamp(Number(params.width ?? 100), 1, 180) / 100,
    amp: Number(shape.amp) * clamp(Number(params.amplitude ?? 100), 0, 180) / 100,
    curl: Number(shape.curl) * clamp(Number(params.curl ?? 100), 0, 160) / 100,
    sway: clamp(Number(params.sway ?? 0), 0, 100),
    rotate: Number(shape.rotate) + Number(params.angle ?? 0),
  }));
}

function along(shape: GlowShape, position: number): number {
  const phase = (((shape.reverse ? 1 - position : position) * shape.span + shape.shift) / 200) % 1;
  return 1 - Math.abs(1 - 2 * (phase < 0 ? phase + 1 : phase));
}
const widthAt = (shape: GlowShape, position: number, width: number, height: number) => {
  const end = Math.min(1, Math.min(position, 1 - position) / .25);
  return Math.max(.6, shape.width / 100 * .09 * Math.min(width, height) * shape.scale / 100 * (1 - shape.taper / 100 * (1 - end) ** 2));
};
let cached: { key: string; pixels: Uint8ClampedArray<ArrayBuffer> } | undefined;

/** CPU preview shares the recorded paths, geometry and along-path colour mapping with export. */
export function linesPixels(width: number, height: number, state: GlowState, time = 20.75): Uint8ClampedArray<ArrayBuffer> {
  const key = JSON.stringify([width, height, state.colors, state.divisions, state.params, state.params.sway ? time : 0]);
  if (cached?.key === key) return cached.pixels;
  const background = rgb(state.colors[0]);
  const output = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    output[i * 4] = background[0]; output[i * 4 + 1] = background[1]; output[i * 4 + 2] = background[2]; output[i * 4 + 3] = 255;
  }
  const body = clamp(Number(state.params.body ?? 0) / 100);
  const lookup = Array.from({ length: 1024 }, (_, i) => strokePaletteColour(state.colors, state.divisions, i / 1023));
  for (const shape of lineShapes(state.params)) {
    const points = glowPath(shape, width, height, time);
    const coverage = new Float32Array(width * height), positions = new Float32Array(width * height), radiusFractions = new Float32Array(width * height);
    for (let segment = 0; segment < points.length - 1; segment++) {
      const [ax, ay] = points[segment], [bx, by] = points[segment + 1];
      const dx = bx - ax, dy = by - ay, lengthSquared = Math.max(1e-9, dx * dx + dy * dy);
      const start = segment / (points.length - 1), end = (segment + 1) / (points.length - 1);
      const radius = (widthAt(shape, start, width, height) + widthAt(shape, end, width, height)) / 2;
      const firstX = Math.max(0, Math.floor(Math.min(ax, bx) - radius - .5)), lastX = Math.min(width, Math.ceil(Math.max(ax, bx) + radius + .5));
      const firstY = Math.max(0, Math.floor(Math.min(ay, by) - radius - .5)), lastY = Math.min(height, Math.ceil(Math.max(ay, by) + radius + .5));
      for (let y = firstY; y < lastY; y++) for (let x = firstX; x < lastX; x++) {
        const projection = ((x + .5 - ax) * dx + (y + .5 - ay) * dy) / lengthSquared, t = clamp(projection);
        const distance = Math.hypot(x + .5 - ax - t * dx, y + .5 - ay - t * dy), amount = clamp(radius + .5 - distance);
        if (!amount) continue;
        const pixel = y * width + x;
        coverage[pixel] = Math.max(coverage[pixel], amount);
        positions[pixel] = along(shape, clamp(start + (end - start) * projection));
        radiusFractions[pixel] = clamp(distance / radius);
      }
    }
    for (let i = 0; i < width * height; i++) if (coverage[i]) {
      const colour = lookup[Math.round(positions[i] * 1023)], alpha = coverage[i];
      const shade = .34 * body * radiusFractions[i] ** 2;
      for (let channel = 0; channel < 3; channel++) {
        const surface = colour[channel] * (1 - shade) + background[channel] * shade;
        output[i * 4 + channel] = surface * alpha + output[i * 4 + channel] * (1 - alpha);
      }
    }
  }
  cached = { key, pixels: output };
  return output;
}

function newSurface(ctx: CanvasRenderingContext2D, width: number, height: number): HTMLCanvasElement {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas')
    : new (ctx.canvas.constructor as unknown as new (width: number, height: number) => HTMLCanvasElement)(width, height);
  canvas.width = width; canvas.height = height;
  return canvas;
}
function strokePath(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.beginPath(); ctx.moveTo(...points[0]);
  for (let i = 1; i < points.length - 1; i++) ctx.quadraticCurveTo(...points[i], (points[i][0] + points[i + 1][0]) / 2, (points[i][1] + points[i + 1][1]) / 2);
  ctx.lineTo(...points.at(-1)!);
}

/** Canvas export retains round caps and layered colour gradients along every recorded tube. */
export function paintLines(ctx: CanvasRenderingContext2D, width: number, height: number, state: GlowState, time = 20.75) {
  const surface = newSurface(ctx, width, height), layer = surface.getContext('2d')!;
  const background = rgb(state.colors[0]), body = clamp(Number(state.params.body ?? 0) / 100);
  ctx.fillStyle = state.colors[0]; ctx.fillRect(0, 0, width, height);
  const lookup = Array.from({ length: 1024 }, (_, i) => strokePaletteColour(state.colors, state.divisions, i / 1023));
  const colourAt = (shape: GlowShape, position: number) => lookup[Math.round(along(shape, clamp(position)) * 1023)];
  for (const shape of lineShapes(state.params)) {
    const points = glowPath(shape, width, height, time), count = points.length;
    layer.save(); layer.clearRect(0, 0, width, height); layer.lineCap = 'round'; layer.lineJoin = 'round';
    layer.lineWidth = widthAt(shape, 0, width, height) * 2; layer.strokeStyle = css(colourAt(shape, .5));
    strokePath(layer, points); layer.stroke(); layer.globalCompositeOperation = 'source-atop';
    const paintColour = (target: CanvasRenderingContext2D, factor: number, shade: number) => {
      target.lineCap = 'round'; target.lineJoin = 'round';
      for (let i = 0; i < count - 1; i++) {
        const [ax, ay] = points[i], [bx, by] = points[i + 1], start = i / (count - 1), end = (i + 1) / (count - 1);
        const diameter = (widthAt(shape, start, width, height) + widthAt(shape, end, width, height)) * factor + 2;
        const radius = diameter / 2, length = Math.max(1e-6, Math.hypot(bx - ax, by - ay)), dx = (bx - ax) / length, dy = (by - ay) / length;
        const gradient = target.createLinearGradient(ax - dx * radius, ay - dy * radius, bx + dx * radius, by + dy * radius);
        const mix = (colour: RGB): RGB => colour.map((value, channel) => value * (1 - shade) + background[channel] * shade) as RGB;
        gradient.addColorStop(0, css(mix(colourAt(shape, start - (end - start) / length * radius))));
        gradient.addColorStop(1, css(mix(colourAt(shape, end + (end - start) / length * radius))));
        target.beginPath(); target.moveTo(ax, ay); target.lineTo(bx, by); target.lineWidth = diameter; target.strokeStyle = gradient; target.stroke();
      }
    };
    paintColour(layer, 1, .34 * body);
    if (body > .01) {
      const inner = newSurface(ctx, width, height), innerContext = inner.getContext('2d')!;
      paintColour(innerContext, 1 - .45 * body, 0);
      const radius = Math.max(...points.map((_, i) => widthAt(shape, i / (count - 1), width, height)));
      layer.filter = `blur(${Math.max(1, radius * (.28 + .22 * body))}px)`;
      layer.drawImage(inner, 0, 0); layer.filter = 'none';
    }
    layer.restore(); ctx.drawImage(surface, 0, 0);
  }
}
