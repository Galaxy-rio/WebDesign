import reference from '../../data/form-layouts.json' with { type: 'json' };
import { blurMask } from './glow.ts';

type Point = [number, number];
type RGB = [number, number, number];
interface Outline { width: number; height: number; paths: Array<{ data: string; windingRule: string }> }
export interface FormState { colors: string[]; params: Record<string, string | number>; soften?: number }
interface FormSettings { shape: string; x: number; y: number; size: number; rotate: number; fade: number; stretchX: number; stretchY: number; skew: number; bloom: number }
const outlines = reference.outlines as Record<string, Outline>;
export const FORM_SHAPES = Object.keys(outlines).map(id => ({ id, name: id.split('-').map(word => word[0].toUpperCase() + word.slice(1)).join(' ') }));
const preferred = ['svg-shape-26', 'svg-shape-22', 'svg-shape-20', 'svg-shape-14'];
export const FORM_PRESETS = [...preferred.map(id => reference.presets.find(preset => preset.id === id)!), ...reference.presets.filter(preset => !preferred.includes(preset.id))]
  .map(preset => ({ id: preset.id, name: preset.name, colors: preset.colors, grain: preset.grain, soften: preset.soften,
    params: { shape: preset.params.id, x: preset.params.x, y: preset.params.y, size: preset.params.size, rotate: preset.params.rotate, fade: preset.params.fade,
      stretchX: preset.params.stretchX, stretchY: preset.params.stretchY, skew: preset.params.skew, bloom: preset.params.bloom } }));
export const FORM_PALETTES = reference.palettes;
export const FORM_DEFAULTS = FORM_PRESETS[0].params;
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const rgb = (hex: string): RGB => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)) as RGB;
function settings(params: FormState['params']): FormSettings {
  const requested = String(params.shape ?? FORM_DEFAULTS.shape);
  const shape = outlines[requested] ? requested : FORM_SHAPES.find(item => item.name.toLowerCase() === requested.toLowerCase())?.id ?? FORM_DEFAULTS.shape;
  return { shape, x: Number(params.x ?? FORM_DEFAULTS.x), y: Number(params.y ?? FORM_DEFAULTS.y), size: Number(params.size ?? FORM_DEFAULTS.size),
    rotate: Number(params.rotate ?? 0), fade: Number(params.fade ?? FORM_DEFAULTS.fade), stretchX: Number(params.stretchX ?? 100), stretchY: Number(params.stretchY ?? 100),
    skew: Number(params.skew ?? 0), bloom: Number(params.bloom ?? FORM_DEFAULTS.bloom) };
}

type Command = { kind: string; values: number[] };
const commandsCache = new Map<string, Command[]>();
function commands(shape: string): Command[] {
  const cached = commandsCache.get(shape); if (cached) return cached;
  const tokens = outlines[shape].paths.map(path => path.data).join(' ').match(/[MCLZ]|[-+]?(?:\d*\.)?\d+(?:[eE][-+]?\d+)?/g)!;
  const result: Command[] = [];
  const sizes: Record<string, number> = { M: 2, L: 2, C: 6, Z: 0 };
  for (let i = 0; i < tokens.length;) {
    const kind = tokens[i++], count = sizes[kind];
    if (count === undefined) throw new Error(`Unsupported form path command: ${kind}`);
    result.push({ kind, values: tokens.slice(i, i + count).map(Number) }); i += count;
  }
  commandsCache.set(shape, result); return result;
}

/** Keep the original cubic paths for export, including holes and disjoint lobes. */
function trace(ctx: CanvasRenderingContext2D, shape: string) {
  ctx.beginPath();
  for (const { kind, values } of commands(shape)) {
    if (kind === 'M') ctx.moveTo(values[0], values[1]);
    else if (kind === 'L') ctx.lineTo(values[0], values[1]);
    else if (kind === 'C') ctx.bezierCurveTo(values[0], values[1], values[2], values[3], values[4], values[5]);
    else ctx.closePath();
  }
}
function surface(ctx: CanvasRenderingContext2D, width: number, height: number): HTMLCanvasElement {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas')
    : new (ctx.canvas.constructor as unknown as new (width: number, height: number) => HTMLCanvasElement)(width, height);
  canvas.width = width; canvas.height = height; return canvas;
}

/** The first palette colour is paper; the rest are clipped to the exact SVG silhouette. */
export function paintForms(ctx: CanvasRenderingContext2D, width: number, height: number, state: FormState) {
  const form = settings(state.params), outline = outlines[form.shape];
  const size = Math.min(width, height) * form.size / 100, x = width * form.x / 100, y = height * form.y / 100;
  const layer = surface(ctx, width, height), paint = layer.getContext('2d')!;
  const colors = state.colors.length > 1 ? state.colors.slice(1) : state.colors;
  const transform = () => {
    paint.translate(x, y); paint.rotate(form.rotate * Math.PI / 180); paint.transform(1, 0, Math.tan(form.skew * Math.PI / 180), 1, 0, 0);
    paint.scale(size / Math.max(outline.width, outline.height) * form.stretchX / 100, size / Math.max(outline.width, outline.height) * form.stretchY / 100);
    paint.translate(-outline.width / 2, -outline.height / 2);
  };
  paint.save(); transform(); trace(paint, form.shape); paint.clip('evenodd'); paint.setTransform(1, 0, 0, 1, 0, 0);
  const gradient = paint.createLinearGradient(x - size / 2, y - size / 2, x + size / 2, y + size / 2);
  colors.forEach((color, i) => gradient.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), color));
  paint.fillStyle = gradient; paint.fillRect(x - size, y - size, size * 2, size * 2); paint.restore();
  const fadeAngle = (-32 + FORM_SHAPES.findIndex(shape => shape.id === form.shape) % 6 * 31) * Math.PI / 180;
  const fade = clamp(form.fade / 100), start = .72 - fade * .24, middle = start + (1 - start) * .62;
  const fadeGradient = paint.createLinearGradient(x - Math.cos(fadeAngle) * size * .55, y - Math.sin(fadeAngle) * size * .55,
    x + Math.cos(fadeAngle) * size * .55, y + Math.sin(fadeAngle) * size * .55);
  fadeGradient.addColorStop(0, 'rgba(255,255,255,1)'); fadeGradient.addColorStop(start, 'rgba(255,255,255,1)');
  fadeGradient.addColorStop(middle, `rgba(255,255,255,${1 - fade * .32})`); fadeGradient.addColorStop(1, `rgba(255,255,255,${.5 * (1 - fade) + .025})`);
  // The colour layer is already clipped. Applying the fade in canvas space avoids
  // transforming the gradient a second time, particularly on large SVG viewboxes.
  paint.save(); paint.globalCompositeOperation = 'destination-in'; paint.fillStyle = fadeGradient;
  paint.fillRect(0, 0, width, height); paint.restore();
  ctx.fillStyle = state.colors[0]; ctx.fillRect(0, 0, width, height);
  const bloom = clamp(form.bloom / 100);
  if (bloom > 0) {
    ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .12 + bloom * .24;
    ctx.filter = `blur(${Math.max(4, size * (.014 + bloom * .024))}px)`; ctx.drawImage(layer, 0, 0); ctx.restore();
  }
  ctx.save();
  const soft = form.shape.startsWith('soft-');
  const blur = Math.max(soft ? 1.2 : 0, size * (soft ? .006 : .0015) + (state.soften ?? 0) * .18);
  ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none'; ctx.drawImage(layer, 0, 0); ctx.restore();
}

/** Adaptive tessellation is used only for CPU thumbnails; Canvas exports retain cubic paths. */
export function formPolygons(params: FormState['params'], width: number, height: number): Point[][] {
  const form = settings(params), outline = outlines[form.shape], result: Point[][] = [];
  let current: Point[] = [], last: Point = [0, 0];
  const scale = Math.min(width, height) * form.size / 100 / Math.max(outline.width, outline.height);
  for (const { kind, values } of commands(form.shape)) {
    if (kind === 'M') { current = [[values[0], values[1]]]; result.push(current); last = current[0]; }
    else if (kind === 'L') { last = [values[0], values[1]]; current.push(last); }
    else if (kind === 'C') {
      const start = last, a: Point = [values[0], values[1]], b: Point = [values[2], values[3]], end: Point = [values[4], values[5]];
      const length = Math.hypot(a[0] - start[0], a[1] - start[1]) + Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(end[0] - b[0], end[1] - b[1]);
      const steps = clamp(Math.ceil(length * scale / 2), 8, 180);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t;
        current.push([u ** 3 * start[0] + 3 * u ** 2 * t * a[0] + 3 * u * t ** 2 * b[0] + t ** 3 * end[0],
          u ** 3 * start[1] + 3 * u ** 2 * t * a[1] + 3 * u * t ** 2 * b[1] + t ** 3 * end[1]]);
      }
      last = end;
    }
  }
  const rotation = form.rotate * Math.PI / 180, cosine = Math.cos(rotation), sine = Math.sin(rotation), skew = Math.tan(form.skew * Math.PI / 180);
  return result.map(polygon => polygon.map(([px, py]) => {
    let x = (px - outline.width / 2) * scale * form.stretchX / 100;
    const y = (py - outline.height / 2) * scale * form.stretchY / 100;
    x += y * skew;
    return [x * cosine - y * sine + width * form.x / 100, x * sine + y * cosine + height * form.y / 100];
  }));
}
function coverage(polygons: Point[][], width: number, height: number) {
  const mask = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let sample = 0; sample < 4; sample++) {
    const scanY = y + (sample + .5) / 4, intersections: number[] = [];
    for (const polygon of polygons) for (let i = 0, previous = polygon.length - 1; i < polygon.length; previous = i++) {
      const [ax, ay] = polygon[previous], [bx, by] = polygon[i];
      if ((ay <= scanY && by > scanY) || (by <= scanY && ay > scanY)) intersections.push(ax + (scanY - ay) / (by - ay) * (bx - ax));
    }
    intersections.sort((a, b) => a - b);
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const left = intersections[i], right = intersections[i + 1];
      for (let x = Math.max(0, Math.floor(left)); x < Math.min(width, Math.ceil(right)); x++) mask[y * width + x] += Math.max(0, Math.min(right, x + 1) - Math.max(left, x)) / 4;
    }
  }
  return mask;
}
let cached: { key: string; pixels: Uint8ClampedArray<ArrayBuffer> } | undefined;
export function formsPixels(width: number, height: number, state: FormState): Uint8ClampedArray<ArrayBuffer> {
  const key = JSON.stringify([width, height, state.colors, state.params, state.soften]);
  if (cached?.key === key) return cached.pixels;
  const form = settings(state.params), size = Math.min(width, height) * form.size / 100;
  const centerX = width * form.x / 100, centerY = height * form.y / 100;
  const mask = coverage(formPolygons(state.params, width, height), width, height), colors = (state.colors.length > 1 ? state.colors.slice(1) : state.colors).map(rgb);
  const angle = (-32 + FORM_SHAPES.findIndex(shape => shape.id === form.shape) % 6 * 31) * Math.PI / 180;
  const fade = clamp(form.fade / 100), start = .72 - fade * .24, middle = start + (1 - start) * .62;
  const channels = Array.from({ length: 4 }, () => new Float32Array(width * height));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x, dx = x + .5 - centerX, dy = y + .5 - centerY;
    if (!mask[index] || Math.abs(dx) > size || Math.abs(dy) > size) continue;
    const position = clamp(.5 + (dx * Math.cos(angle) + dy * Math.sin(angle)) / (size * 1.1));
    const fadeAlpha = position <= start ? 1 : position <= middle ? 1 - fade * .32 * (position - start) / (middle - start)
      : 1 - fade * .32 + ((.5 * (1 - fade) + .025) - (1 - fade * .32)) * (position - middle) / (1 - middle);
    const alpha = clamp(mask[index]) * fadeAlpha;
    const gradientPosition = clamp(.5 + (dx + dy) / (size * 2)) * (colors.length - 1), lower = Math.floor(gradientPosition);
    const first = colors[lower], last = colors[Math.min(colors.length - 1, lower + 1)], fraction = gradientPosition - lower;
    for (let channel = 0; channel < 3; channel++) channels[channel][index] = (first[channel] + (last[channel] - first[channel]) * fraction) * alpha;
    channels[3][index] = alpha;
  }
  const background = rgb(state.colors[0]), bloom = clamp(form.bloom / 100), soft = form.shape.startsWith('soft-');
  const blur = Math.max(soft ? 1.2 : 0, size * (soft ? .006 : .0015) + (state.soften ?? 0) * .18);
  const smooth = channels.map(channel => blurMask(channel, width, height, blur));
  const light = bloom > 0 ? channels.map(channel => blurMask(channel, width, height, Math.max(4, size * (.014 + bloom * .024)))) : null;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index++) {
    const alpha = clamp(smooth[3][index]);
    for (let channel = 0; channel < 3; channel++) {
      const paper = background[channel] + (light ? (255 - background[channel]) * light[channel][index] / 255 * (.12 + bloom * .24) : 0);
      pixels[index * 4 + channel] = smooth[channel][index] + paper * (1 - alpha);
    }
    pixels[index * 4 + 3] = 255;
  }
  cached = { key, pixels }; return pixels;
}
