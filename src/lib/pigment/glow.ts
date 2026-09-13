import reference from '../../data/glow-layouts.json' with { type: 'json' };

type Point = [number, number];
type RGB = [number, number, number];
export interface GlowShape {
  id: string;
  form: string;
  seed: number;
  turns: number;
  curl: number;
  amp: number;
  width: number;
  taper: number;
  sway: number;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  reverse: boolean;
  shift: number;
  span: number;
  edgeGlow: boolean;
  edgeWidth: number;
  edgeStrength: number;
  edgeAngle: number;
  pts?: Point[];
}
export interface GlowArrangement {
  id: string;
  name: string;
  headline: string;
  colors: string[];
  shapes: GlowShape[];
}
export interface GlowState {
  colors: string[];
  divisions: number[];
  params: Record<string, number | string>;
}

export const GLOW_ARRANGEMENTS = reference.layouts as GlowArrangement[];
export const GLOW_PALETTES = reference.palettes;
export const GLOW_DEFAULTS = { arrangement: 'Edge', size: 100, width: 100, intensity: 100, angle: 0, sway: 0 };
const ASPECT_POSITIONS = reference.aspectPositions as Record<string, number[][]>;
const TAU = Math.PI * 2;
const INITIAL_TIME = 20.75;
const CLOSED_FORMS = new Set(['circle', 'ellipse', 'blob', 'squircle', 'egg', 'crescent', 'flower', 'spark']);
const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const rgb = (hex: string): RGB => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)) as RGB;

export function glowArrangement(name: string | number | undefined): GlowArrangement {
  const key = String(name ?? '').toLowerCase();
  return GLOW_ARRANGEMENTS.find(arrangement => arrangement.id === key || arrangement.name.toLowerCase() === key) ?? GLOW_ARRANGEMENTS[0];
}

/** Layout anchors preserve each composition when moving between portrait and landscape. */
function aspectAnchor(id: string, aspect: number): number[] | undefined {
  const anchors = ASPECT_POSITIONS[id];
  if (!anchors) return;
  const ratios = [9 / 16, .8, 1, 16 / 9];
  if (aspect <= ratios[0]) return anchors[0];
  if (aspect >= ratios[3]) {
    const [x, y, size] = anchors[3];
    return [100 - (100 - x) * ratios[3] / aspect, y, size];
  }
  const index = ratios.findIndex((ratio, i) => i < 3 && aspect >= ratio && aspect <= ratios[i + 1]);
  const fraction = (aspect - ratios[index]) / (ratios[index + 1] - ratios[index]);
  return anchors[index].map((value, i) => value + (anchors[index + 1][i] - value) * fraction);
}

/** Controls act on the arrangement without throwing away the individual shape settings. */
export function glowShapes(params: GlowState['params'], aspect: number): GlowShape[] {
  const arrangement = glowArrangement(params.arrangement);
  const size = clamp(Number(params.size ?? 100), 20, 180) / 100;
  const width = clamp(Number(params.width ?? 100), 1, 200) / 100;
  const intensity = clamp(Number(params.intensity ?? 100), 0, 200) / 100;
  const angle = Number(params.angle ?? 0);
  const sway = clamp(Number(params.sway ?? 0), 0, 100);
  return arrangement.shapes.map(shape => {
    const [x, y, scale] = aspectAnchor(shape.id, aspect) ?? [shape.x, shape.y, shape.scale];
    return {
      ...shape, x, y, scale: scale * size,
      edgeWidth: shape.edgeWidth * width,
      edgeStrength: shape.edgeStrength * intensity,
      edgeAngle: shape.edgeAngle + angle,
      sway,
    };
  });
}

function randomSequence(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = state + 1831565813 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/** Closed parametric outlines; the Scribble preset has its own recorded control points. */
export function glowControlPoints(shape: GlowShape): Point[] {
  if (shape.pts && shape.pts.length >= 2) return shape.pts.map(point => [...point]);
  const random = randomSequence(shape.seed * 7919 + shape.turns * 131 + 17);
  let points: Point[] = [];
  const sample = (count: number, point: (angle: number) => Point) => Array.from({ length: count + 1 }, (_, i) => point(i / count * TAU));
  switch (shape.form) {
    case 'circle': points = sample(64, angle => [.5 * Math.cos(angle), .5 * Math.sin(angle)]); break;
    case 'ellipse': points = sample(64, angle => [.5 * Math.cos(angle), .3 * Math.sin(angle)]); break;
    case 'blob': {
      const curl = shape.curl / 100, second = .035 + .035 * curl, third = .015 + .025 * curl;
      const phaseA = random() * TAU, phaseB = random() * TAU, stretch = 1.04 + random() * .14;
      points = sample(128, angle => {
        const radius = .43 * (1 + second * Math.cos(2 * angle + phaseA) + third * Math.cos(3 * angle + phaseB));
        const derivative = .43 * (-2 * second * Math.sin(2 * angle + phaseA) - 3 * third * Math.sin(3 * angle + phaseB));
        return [(radius * Math.cos(angle) - derivative * Math.sin(angle)) * stretch,
          (radius * Math.sin(angle) + derivative * Math.cos(angle)) / stretch];
      });
      break;
    }
    case 'squircle': {
      const power = 2 / (2.4 + 2.2 * shape.curl / 100);
      points = sample(96, angle => [.5 * Math.sign(Math.cos(angle)) * Math.abs(Math.cos(angle)) ** power,
        .5 * Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** power]);
      break;
    }
    case 'egg': {
      const pinch = .12 + .3 * shape.curl / 100, direction = random() < .5 ? 1 : -1;
      points = sample(72, angle => [.5 * Math.cos(angle) * direction, .36 * Math.sin(angle) * (1 - pinch * Math.cos(angle))]);
      break;
    }
    case 'crescent': {
      const offset = .16 + .26 * shape.curl / 100;
      const intersection = Math.acos(clamp((.25 + offset * offset - .46 ** 2) / offset, -.999, .999));
      const rotation = random() * TAU, cosine = Math.cos(rotation), sine = Math.sin(rotation);
      const rotate = (x: number, y: number): Point => [x * cosine - y * sine, x * sine + y * cosine];
      for (let i = 0; i <= 48; i++) {
        const angle = intersection + i / 48 * (TAU - 2 * intersection);
        points.push(rotate(.5 * Math.cos(angle), .5 * Math.sin(angle)));
      }
      const innerStart = Math.atan2(.5 * Math.sin(intersection), .5 * Math.cos(intersection) - offset);
      for (let i = 1; i < 40; i++) {
        const angle = -innerStart - i / 40 * (TAU - 2 * innerStart);
        points.push(rotate(offset + .46 * Math.cos(angle), .46 * Math.sin(angle)));
      }
      points.push(rotate(.5 * Math.cos(intersection), .5 * Math.sin(intersection)));
      break;
    }
    case 'flower': case 'spark': {
      const lobes = shape.form === 'spark' ? 4 : clamp(Math.round(shape.turns), 3, 8);
      const depth = (shape.form === 'spark' ? .23 : .08) + .17 * shape.curl / 100;
      points = sample(256, angle => {
        const radius = .5 * (1 + depth * Math.cos(lobes * angle)) / (1 + depth);
        return [radius * Math.cos(angle), radius * Math.sin(angle)];
      });
      break;
    }
    case 'ring': {
      const radius = .15 + .16 * shape.curl / 100, phase = random() * TAU;
      points = sample(60, angle => [radius * Math.cos(angle + phase), radius * Math.sin(angle + phase)]);
      break;
    }
    case 'curve': {
      const bends = shape.turns + 1, amplitude = .08 + .26 * shape.curl / 100;
      const phase = random() * TAU, modulation = random() * TAU, spacing = .9 + random() * .2;
      const count = Math.max(24, bends * 10);
      points = Array.from({ length: count + 1 }, (_, i) => {
        const t = i / count;
        return [-.5 + t ** spacing, amplitude * (.6 + .4 * Math.sin(Math.PI * t)) * (1 + .18 * Math.sin(modulation + t * Math.PI * 1.3)) * Math.sin(phase + t * Math.PI * bends)];
      });
      break;
    }
    case 'wave': {
      const amplitude = (.06 + .22 * shape.curl / 100) * 3 / Math.max(3, shape.turns);
      const phase = random() * TAU, modulation = .1 + random() * .22, modulationRate = .6 + random() * 1.2;
      const modulationPhase = random() * TAU, slope = (random() - .5) * .18, count = Math.max(24, shape.turns * 12);
      points = Array.from({ length: count + 1 }, (_, i) => {
        const t = i / count;
        return [-.5 + t, amplitude * (1 + modulation * Math.sin(modulationPhase + t * TAU * modulationRate)) * Math.sin(phase + t * TAU * shape.turns) + slope * (t - .5)];
      });
      break;
    }
    case 'loop': {
      const turns = Math.max(1, shape.turns), radius = Math.min(.1 + .16 * shape.curl / 100, .62 / turns);
      const direction = random() < .5 ? 1 : -1, slope = (random() - .5) * .16;
      points = Array.from({ length: turns * 28 + 1 }, (_, i) => {
        const t = i / (turns * 28), angle = -Math.PI / 2 + direction * t * turns * TAU;
        return [-.5 + t + radius * Math.cos(angle) * .9, radius * Math.sin(angle) + (t - .5) * slope];
      });
      const extend = (a: Point, b: Point): Point => {
        const length = Math.max(1e-6, Math.hypot(b[0] - a[0], b[1] - a[1]));
        return [b[0] + (b[0] - a[0]) / length * .07, b[1] + (b[1] - a[1]) / length * .07];
      };
      points.unshift(extend(points[1], points[0])); points.push(extend(points.at(-2)!, points.at(-1)!));
      break;
    }
    case 'scribble': {
      const steps = 15 + shape.turns * 5, step = 1.15 / steps, curl = shape.curl / 100;
      const twist = .3 + .62 * curl, correction = .32 - .24 * curl;
      const rateA = 1.2 + random() * 1.6, rateB = 2.6 + random() * 2.4, phaseA = random() * TAU, phaseB = random() * TAU;
      let x = -.42, y = (random() - .5) * .25, angle = (random() - .5) * 1.2;
      points = [[x, y]];
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        angle += twist * (Math.sin(phaseA + t * TAU * rateA) + .6 * Math.sin(phaseB + t * TAU * rateB));
        let attraction = Math.atan2(-y * .6, -.45 + .95 * t + .12 - x) - angle;
        while (attraction > Math.PI) attraction -= TAU;
        while (attraction < -Math.PI) attraction += TAU;
        angle += attraction * correction; x += Math.cos(angle) * step; y += Math.sin(angle) * step; points.push([x, y]);
      }
      const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
      const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]));
      const scale = .95 / Math.max(1e-6, maxX - minX, maxY - minY);
      points = points.map(([x, y]) => [(x - (minX + maxX) / 2) * scale, (y - (minY + maxY) / 2) * scale]);
      break;
    }
    case 'snake': {
      const count = shape.turns + 1, verticalStep = .24, halfStep = .12, halfWidth = .26;
      const bend = halfStep * (.75 + .5 * shape.curl / 100), slope = (random() - .5) * .08;
      for (let row = 0; row < count; row++) {
        const y = -((count - 1) * verticalStep) / 2 + row * verticalStep, direction = row % 2 === 0 ? 1 : -1;
        for (let i = 0; i <= 3; i++) points.push([direction * (-halfWidth + 2 * halfWidth * i / 3), y]);
        if (row < count - 1) {
          const radius = bend * (.96 + random() * .08);
          for (let i = 1; i <= 5; i++) {
            const angle = Math.PI * i / 6 - Math.PI / 2;
            points.push([direction * (halfWidth + radius * Math.cos(angle)), y + halfStep + halfStep * Math.sin(angle)]);
          }
        }
      }
      points = points.map(([x, y]) => [x, y + slope * x]);
      break;
    }
    case 'worm': {
      const turns = Math.max(1, shape.turns), amplitude = (.1 + .38 * shape.curl / 100) * .4 * 2 / (1 + turns);
      const phase = (random() - .5) * 1.1, modulation = random() * TAU, count = Math.max(18, turns * 8);
      points = Array.from({ length: count + 1 }, (_, i) => {
        const t = i / count;
        return [-.2 + .4 * t, amplitude * (1 + .22 * Math.sin(modulation + t * Math.PI * 1.2)) * Math.sin(phase + t * Math.PI * turns)];
      });
      break;
    }
    case 'pill': {
      const length = .004 + .2 * shape.curl / 100;
      points = Array.from({ length: 13 }, (_, i) => [-length + 2 * length * i / 12, 0]);
      break;
    }
    case 'arc': {
      const span = Math.PI * (.6 + shape.curl / 100), phase = random() * TAU;
      points = Array.from({ length: 37 }, (_, i) => [.21 * Math.cos(phase + i / 36 * span), .21 * Math.sin(phase + i / 36 * span)]);
      break;
    }
    case 'sq': {
      const outer = .13 + .14 * shape.curl / 100, corner = outer * .36, inner = outer - corner;
      const line = (a: Point, b: Point, steps: number) => {
        for (let i = 1; i <= steps; i++) points.push([a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]);
      };
      const arc = (x: number, y: number, start: number) => {
        for (let i = 1; i <= 6; i++) points.push([x + corner * Math.cos(start + Math.PI / 2 * i / 6), y + corner * Math.sin(start + Math.PI / 2 * i / 6)]);
      };
      points = [[0, -outer]]; line([0, -outer], [inner, -outer], 3); arc(inner, -inner, -Math.PI / 2);
      line([outer, -inner], [outer, inner], 5); arc(inner, inner, 0); line([inner, outer], [-inner, outer], 6);
      arc(-inner, inner, Math.PI / 2); line([-outer, inner], [-outer, -inner], 5); arc(-inner, -inner, Math.PI);
      line([-inner, -outer], [0, -outer], 3);
      break;
    }
    default: throw new Error(`Unsupported Glow outline: ${shape.form}`);
  }
  const minX = Math.min(...points.map(point => point[0])), maxX = Math.max(...points.map(point => point[0]));
  const minY = Math.min(...points.map(point => point[1])), maxY = Math.max(...points.map(point => point[1]));
  const amplitude = .4 + 1.2 * shape.amp / 100;
  return points.map(([x, y]) => [x - (minX + maxX) / 2, (y - (minY + maxY) / 2) * amplitude]);
}

/** Centripetal interpolation avoids cusps in the recorded stroke and crescent outline. */
function smoothPath(points: Point[], steps = 8): Point[] {
  const padded = [points[0], ...points, points.at(-1)!];
  const result: Point[] = [];
  const distance = (a: Point, b: Point) => Math.max(.0001, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])));
  const interpolate = (a: Point, b: Point, start: number, end: number, t: number): Point => [
    ((end - t) * a[0] + (t - start) * b[0]) / (end - start),
    ((end - t) * a[1] + (t - start) * b[1]) / (end - start),
  ];
  for (let index = 1; index < padded.length - 2; index++) {
    const [a, b, c, d] = padded.slice(index - 1, index + 3);
    const t0 = 0, t1 = distance(a, b), t2 = t1 + distance(b, c), t3 = t2 + distance(c, d);
    for (let step = 0; step < steps; step++) {
      const t = t1 + (t2 - t1) * step / steps;
      const ab = interpolate(a, b, t0, t1, t), bc = interpolate(b, c, t1, t2, t), cd = interpolate(c, d, t2, t3, t);
      result.push(interpolate(interpolate(ab, bc, t0, t2, t), interpolate(bc, cd, t1, t3, t), t1, t2, t));
    }
  }
  result.push(points.at(-1)!);
  return result;
}

function resamplePath(points: Point[], count: number): Point[] {
  const distances = [0];
  for (let i = 1; i < points.length; i++) distances.push(distances[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  const length = distances.at(-1)!;
  let segment = 1;
  return Array.from({ length: count }, (_, i) => {
    const distance = length * i / (count - 1);
    while (segment < distances.length - 1 && distances[segment] < distance) segment++;
    const fraction = (distance - distances[segment - 1]) / Math.max(1e-9, distances[segment] - distances[segment - 1]);
    return [points[segment - 1][0] + (points[segment][0] - points[segment - 1][0]) * fraction,
      points[segment - 1][1] + (points[segment][1] - points[segment - 1][1]) * fraction];
  });
}

export function glowPath(shape: GlowShape, width: number, height: number, time = INITIAL_TIME): Point[] {
  const scale = Math.min(width, height) * shape.scale / 100;
  const angle = shape.rotate * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  const controls = glowControlPoints(shape);
  const count = Math.max(420, Math.min(1200, Math.ceil(Math.max(width, height))));
  const points: Point[] = resamplePath(smoothPath(controls, Math.max(8, Math.ceil(count * 2 / (controls.length - 1)))), count)
    .map(([x, y]) => [(x * cosine - y * sine) * scale + shape.x / 100 * width,
      (x * sine + y * cosine) * scale + shape.y / 100 * height]);
  if (!shape.sway) return points;
  const motion = shape.sway / 100 * .022 * scale;
  const phaseA = shape.seed % 977 / 977 * TAU, phaseB = shape.seed % 641 / 641 * TAU;
  return points.map(([x, y], i) => {
    const previous = points[Math.max(0, i - 1)], next = points[Math.min(points.length - 1, i + 1)];
    const dx = next[0] - previous[0], dy = next[1] - previous[1], length = Math.max(1e-6, Math.hypot(dx, dy));
    const position = i / (points.length - 1), envelope = Math.min(1, 4 * position * (1 - position) + .3);
    const wave = (clock: number) => Math.sin(clock * 1.1 + phaseA + position * 3) + .35 * Math.sin(clock * 2.3 + phaseB + position * 5);
    const displacement = motion * envelope * (wave(time) - wave(INITIAL_TIME));
    return [x - dy / length * displacement, y + dx / length * displacement];
  });
}

/** Gaussian approximation using three separable box passes; radius is physical pixels. */
export function blurMask(input: Float32Array, width: number, height: number, sigma: number): Float32Array {
  const ideal = Math.floor(Math.sqrt(4 * sigma * sigma + 1));
  const narrow = Math.max(1, ideal % 2 ? ideal : ideal - 1), wide = narrow + 2;
  const narrowPasses = clamp(Math.round((12 * sigma * sigma - 3 * narrow * narrow - 12 * narrow - 9) / (-4 * narrow - 4)), 0, 3);
  const temporary = new Float32Array(input.length), output = new Float32Array(input.length);
  let source = input;
  for (let pass = 0; pass < 3; pass++) {
    const radius = ((pass < narrowPasses ? narrow : wide) - 1) / 2, divisor = 1 / (radius * 2 + 1);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let sum = 0;
      for (let x = -radius; x <= radius; x++) sum += source[row + clamp(x, 0, width - 1)];
      for (let x = 0; x < width; x++) {
        temporary[row + x] = sum * divisor;
        sum += source[row + Math.min(width - 1, x + radius + 1)] - source[row + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) sum += temporary[clamp(y, 0, height - 1) * width + x];
      for (let y = 0; y < height; y++) {
        output[y * width + x] = sum * divisor;
        sum += temporary[Math.min(height - 1, y + radius + 1) * width + x] - temporary[Math.max(0, y - radius) * width + x];
      }
    }
    source = output;
  }
  return output;
}

function polygonIntervals(points: Point[], scanY: number): Point[] {
  const intersections: number[] = [];
  for (let i = 0, previous = points.length - 1; i < points.length; previous = i++) {
    const [ax, ay] = points[previous], [bx, by] = points[i];
    if ((ay <= scanY && by > scanY) || (by <= scanY && ay > scanY)) intersections.push(ax + (scanY - ay) / (by - ay) * (bx - ax));
  }
  intersections.sort((a, b) => a - b);
  const intervals: Point[] = [];
  for (let i = 0; i + 1 < intersections.length; i += 2) intervals.push([intersections[i], intersections[i + 1]]);
  return intervals;
}

/** Four subscanlines plus exact horizontal coverage give antialiased, seam-free silhouettes. */
function rasterMask(points: Point[], width: number, height: number, radius: number, closed: boolean): Float32Array {
  const mask = new Float32Array(width * height);
  const segments = closed ? [] : points.slice(1).map((point, i) => {
    const start = points[i], dx = point[0] - start[0], dy = point[1] - start[1];
    const length = Math.max(1e-9, Math.hypot(dx, dy)), nx = -dy / length * radius, ny = dx / length * radius;
    return { low: Math.min(start[1], point[1]) - radius, high: Math.max(start[1], point[1]) + radius,
      polygon: [[start[0] + nx, start[1] + ny], [point[0] + nx, point[1] + ny], [point[0] - nx, point[1] - ny], [start[0] - nx, start[1] - ny]] as Point[] };
  });
  const lower = Math.max(0, Math.floor(Math.min(...points.map(point => point[1])) - radius));
  const upper = Math.min(height, Math.ceil(Math.max(...points.map(point => point[1])) + radius));
  for (let y = lower; y < upper; y++) for (let sample = 0; sample < 4; sample++) {
    const scanY = y + (sample + .5) / 4;
    const intervals = closed ? polygonIntervals(points, scanY) : [];
    if (!closed) {
      for (const segment of segments) if (scanY >= segment.low && scanY <= segment.high) intervals.push(...polygonIntervals(segment.polygon, scanY));
      // Round joins/caps are circles at each sampled path point, merged with the stroke strips.
      for (const point of points) {
        const dy = scanY - point[1];
        if (Math.abs(dy) >= radius) continue;
        const dx = Math.sqrt(radius * radius - dy * dy);
        intervals.push([point[0] - dx, point[0] + dx]);
      }
      intervals.sort((a, b) => a[0] - b[0]);
    }
    let left = -Infinity, right = -Infinity;
    const fill = () => {
      for (let x = Math.max(0, Math.floor(left)); x < Math.min(width, Math.ceil(right)); x++)
        mask[y * width + x] += Math.max(0, Math.min(right, x + 1) - Math.max(left, x)) / 4;
    };
    for (const interval of intervals) {
      if (interval[0] > right) { fill(); [left, right] = interval; }
      else right = Math.max(right, interval[1]);
    }
    fill();
  }
  return mask;
}

interface ShapeField { coverage: Float32Array; lighting: Float32Array }
const fieldCache = new Map<string, ShapeField>();
let cachedPixels = 0;
function shapeField(shape: GlowShape, width: number, height: number, time: number): ShapeField {
  const key = JSON.stringify([width, height, shape, shape.sway ? time : 0]);
  const cached = fieldCache.get(key);
  if (cached) return cached;
  const edgeWidth = Math.min(width, height) * (.012 + shape.edgeWidth * .0018);
  const padding = Math.ceil(edgeWidth * 4 + 8), paddedWidth = width + padding * 2, paddedHeight = height + padding * 2;
  const points: Point[] = glowPath(shape, width, height, time).map(([x, y]) => [x + padding, y + padding]);
  const radius = Math.max(.6, shape.width / 100 * .09 * Math.min(width, height) * shape.scale / 100);
  const mask = rasterMask(points, paddedWidth, paddedHeight, radius, CLOSED_FORMS.has(shape.form));
  const sigma = Math.max(.8, edgeWidth * 1.05);
  const broad = blurMask(mask, paddedWidth, paddedHeight, sigma);
  const narrow = blurMask(mask, paddedWidth, paddedHeight, Math.max(.65, edgeWidth * .24));
  const angle = shape.edgeAngle * Math.PI / 180, cosine = Math.cos(angle), sine = Math.sin(angle);
  const normalizer = sigma * Math.sqrt(TAU) / 2, tanhOne = Math.tanh(1);
  const coverage = new Float32Array(width * height), lighting = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const destination = y * width + x, index = (y + padding) * paddedWidth + x + padding;
    coverage[destination] = mask[index];
    if (!mask[index]) continue;
    const dx = broad[index - 1] - broad[index + 1], dy = broad[index - paddedWidth] - broad[index + paddedWidth];
    const facing = clamp(((dx * cosine + dy * sine) * normalizer + .45) / 1.45);
    const directional = facing * facing * (3 - 2 * facing);
    const wideFalloff = Math.tanh(Math.max(0, 2 * (1 - broad[index]))) / tanhOne;
    const sharpRim = Math.tanh(Math.max(0, 2 * (1 - narrow[index]))) / tanhOne;
    lighting[destination] = shape.edgeGlow ? (.13 + .87 * directional) * (.88 * wideFalloff + .2 * sharpRim) * shape.edgeStrength / 100 : 1;
  }
  while (fieldCache.size && cachedPixels + width * height > 6_000_000) {
    const oldest = fieldCache.keys().next().value!;
    cachedPixels -= fieldCache.get(oldest)!.coverage.length;
    fieldCache.delete(oldest);
  }
  const result = { coverage, lighting };
  fieldCache.set(key, result); cachedPixels += width * height;
  return result;
}

function toLab(color: RGB): RGB {
  const [r, g, b] = color.map(channel => channel / 255 <= .04045 ? channel / 255 / 12.92 : ((channel / 255 + .055) / 1.055) ** 2.4);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  return [.2104542553 * l + .793617785 * m - .0040720468 * s, 1.9779984951 * l - 2.428592205 * m + .4505937099 * s, .0259040371 * l + .7827717662 * m - .808675766 * s];
}
function fromLab([l, a, b]: RGB): RGB {
  const x = (l + .3963377774 * a + .2158037573 * b) ** 3, y = (l - .1055613458 * a - .0638541728 * b) ** 3, z = (l - .0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * x - 3.3077115913 * y + .2309699292 * z, -1.2684380046 * x + 2.6097574011 * y - .3413193965 * z, -.0041960863 * x - .7034186147 * y + 1.707614701 * z]
    .map(channel => 255 * clamp(channel <= .0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - .055)) as RGB;
}
const blendLab = (a: RGB, b: RGB, fraction: number): RGB => a.map((value, i) => value + (b[i] - value) * fraction) as RGB;

export function strokePaletteColour(colors: string[], divisions: number[], fraction: number): RGB {
  const lights = colors.slice(Math.min(1, colors.length - 1));
  const backgroundEnd = divisions[0] ?? 1 / colors.length;
  const edges = divisions.length === colors.length - 1 ? divisions.slice(1).map(value => clamp((value - backgroundEnd) / Math.max(1e-6, 1 - backgroundEnd)))
    : Array.from({ length: lights.length - 1 }, (_, i) => (i + 1) / lights.length);
  const bounds = [0, ...edges, 1], centers = lights.map((_, i) => (bounds[i] + bounds[i + 1]) / 2);
  if (fraction <= centers[0]) return rgb(lights[0]);
  if (fraction >= centers.at(-1)!) return rgb(lights.at(-1)!);
  let index = 0; while (index < centers.length - 2 && fraction > centers[index + 1]) index++;
  return fromLab(blendLab(toLab(rgb(lights[index])), toLab(rgb(lights[index + 1])), (fraction - centers[index]) / (centers[index + 1] - centers[index]))).map(Math.floor) as RGB;
}

function lightColour(shape: GlowShape, colors: string[], divisions: number[]): RGB {
  const phase = ((.5 * shape.span + shape.shift) / 200) % 1;
  return strokePaletteColour(colors, divisions, 1 - Math.abs(1 - 2 * (phase < 0 ? phase + 1 : phase)));
}

/** Opaque background, filled silhouettes, and light that fades strictly inside their edges. */
let lastRender: { key: string; pixels: Uint8ClampedArray<ArrayBuffer> } | undefined;
export function glowPixels(width: number, height: number, state: GlowState, time = INITIAL_TIME): Uint8ClampedArray<ArrayBuffer> {
  const key = JSON.stringify([width, height, state.colors, state.divisions, state.params, state.params.sway ? time : 0]);
  if (lastRender?.key === key) return lastRender.pixels;
  const colors = state.colors.length ? state.colors : GLOW_ARRANGEMENTS[0].colors;
  const background = rgb(colors[0]), backgroundLab = toLab(background);
  const result = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    result[i * 4] = background[0]; result[i * 4 + 1] = background[1]; result[i * 4 + 2] = background[2]; result[i * 4 + 3] = 255;
  }
  for (const shape of glowShapes(state.params, width / height)) {
    const { coverage, lighting } = shapeField(shape, width, height, time);
    const light = toLab(lightColour(shape, colors, state.divisions));
    const lookup = Array.from({ length: 1024 }, (_, i) => {
      const strength = i / 1023 * 1.25;
      if (strength <= 1) return fromLab(blendLab(backgroundLab, light, strength));
      const white = (strength - 1) / .25 * .2;
      return fromLab([light[0] + (1 - light[0]) * white, light[1] * (1 - white * .6), light[2] * (1 - white * .6)]);
    });
    for (let i = 0; i < width * height; i++) {
      if (!coverage[i]) continue;
      const amount = clamp(lighting[i] / 1.25) * 1023, lower = Math.floor(amount), fraction = amount - lower;
      const first = lookup[lower], second = lookup[Math.min(1023, lower + 1)], alpha = clamp(coverage[i]);
      const x = i % width, y = Math.floor(i / width);
      let hash = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263);
      hash = Math.imul(hash ^ hash >>> 13, 1274126177);
      const dither = lighting[i] > .001 ? (hash >>> 0) / 4294967296 - .5 : 0;
      for (let channel = 0; channel < 3; channel++) result[i * 4 + channel] =
        Math.round((first[channel] + (second[channel] - first[channel]) * fraction + dither) * alpha + result[i * 4 + channel] * (1 - alpha));
    }
  }
  lastRender = { key, pixels: result }; return result;
}

/** Bounded working resolution prevents large exports from allocating oversized blur masks. */
export function paintGlow(ctx: CanvasRenderingContext2D, width: number, height: number, state: GlowState, time = INITIAL_TIME) {
  const ratio = Math.min(1, 2200 / Math.max(width, height));
  const renderWidth = Math.max(1, Math.round(width * ratio)), renderHeight = Math.max(1, Math.round(height * ratio));
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas')
    : new (ctx.canvas.constructor as unknown as new (width: number, height: number) => HTMLCanvasElement)(renderWidth, renderHeight);
  canvas.width = renderWidth; canvas.height = renderHeight;
  const paint = canvas.getContext('2d')!, pixels = paint.createImageData(renderWidth, renderHeight);
  pixels.data.set(glowPixels(renderWidth, renderHeight, state, time)); paint.putImageData(pixels, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, width, height); ctx.restore();
}
