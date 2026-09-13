import type { StudioState } from './model.ts';
import { referencePalette, mixReferenceColour } from './reference-fields.ts';

type RGB = [number, number, number];
type Context = CanvasRenderingContext2D;
interface Grid { cols: number; rows: number; cw: number; ch: number; x0: number; y0: number }
interface Blob { x: number; y: number; rx: number; ry: number; c0: RGB; c1: RGB }
interface GlassCell { x: number; y: number; row: number; col: number; alpha: number; pop: number; paper: number; film: number; shade: number }
const TAU = Math.PI * 2, BASE_TIME = 20.75;
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const smooth = (value: number) => { const t = clamp(value); return t * t * (3 - 2 * t); };
const noise = (row: number, col: number) => { const value = Math.sin(row * 127.1 + col * 311.7) * 43758.5453; return value - Math.floor(value); };
const value = (state: StudioState, name: string, fallback: number) => Number(state.params[name] ?? fallback);
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const colour = (c: RGB) => `rgb(${c.map(Math.floor).join(',')})`;
const alpha = (c: RGB, a: number) => `rgba(${c.map(Math.floor).join(',')},${clamp(a)})`;
const rgb = (hex: string): RGB => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const white: RGB = [255, 255, 255];
function sampler(state: StudioState) {
  const palette = referencePalette(state.colors, state.divisions, 1025);
  return (at: number): RGB => palette[Math.round(clamp(at) * (palette.length - 1))];
}
type Sample = ReturnType<typeof sampler>;

export function pixelGrid(width: number, height: number, scale: number, style: string): Grid {
  const amount = clamp(scale, 0, 100);
  const count = style.toLowerCase() === 'glass' ? Math.round(6 + .08 * amount)
    : style.toLowerCase() === 'orbs' ? Math.round(8 + .12 * amount) : Math.round(8 + .1 * amount);
  const pitch = Math.min(width, height) / count;
  const cols = Math.max(4, Math.round(width / pitch)), rows = Math.max(4, Math.round(height / pitch));
  return { cols, rows, cw: width / cols, ch: height / rows, x0: 0, y0: 0 };
}

export function glassyGrid(width: number, height: number, state: StudioState): Grid {
  const pitch = Math.min(width, height) / (4 + .09 * clamp(value(state, 'scale', 50), 0, 100));
  const size = pitch * (.6 + .008 * clamp(value(state, 'rings', 50), 0, 100));
  const cover = .42 + .0068 * clamp(value(state, 'cover', 100), 0, 100);
  const cols = Math.max(3, Math.round(width * cover / size)), rows = Math.max(3, Math.round(height * cover / size));
  return { cols, rows, cw: size, ch: size, x0: (width - cols * size) / 2, y0: (height - rows * size) / 2 };
}

function quiltPosition(grid: Grid, row: number, col: number, time: number, steps: number, weave: number) {
  const x = (col + .5) / grid.cols, y = (row + .5) / grid.rows;
  const centerX = .82 + .014 * Math.sin(time * .72), centerY = .52 + .01 * Math.cos(time * .58);
  const breathing = 1 + .032 * Math.sin(time * 2.4);
  const lean = x + (y - centerY) * .14 + .028 * Math.sin(y * Math.PI * 1.15 + .35);
  const field = 1 - clamp(Math.max(Math.abs(lean - centerX) / (.86 * breathing), Math.abs(y - centerY) / (.64 * breathing)));
  const bias = clamp(x * .86 + (1 - Math.abs(y - centerY) * 2) * .14);
  const t = clamp(field * .78 + bias * .22), bands = Math.max(2, Math.round(steps));
  let step = Math.round(t * bands);
  const variation = Math.max(0, weave - 30) / 70 * .5;
  const random = noise(row * 3 + 17, col * 7 + 5);
  if (random < variation) step += random < variation / 2 ? -1 : 1;
  const seed = noise(row, col);
  return clamp(step / bands + (seed - .5) * .09 * Math.min(weave, 30) / 100 + .018 * Math.sin(time * 1.1 + seed * TAU));
}

function paintQuilt(ctx: Context, width: number, height: number, state: StudioState, time: number, sample: Sample) {
  const grid = pixelGrid(width, height, value(state, 'scale', 50), 'quilt');
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    ctx.fillStyle = colour(sample(quiltPosition(grid, row, col, time, value(state, 'rings', 12), value(state, 'weave', 20))));
    ctx.fillRect(Math.floor(col * grid.cw), Math.floor(row * grid.ch), Math.ceil(grid.cw) + 1, Math.ceil(grid.ch) + 1);
  }
  const seam = Math.max(.65, Math.min(grid.cw, grid.ch) * .014);
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  for (let col = 1; col < grid.cols; col++) ctx.fillRect(Math.round(col * grid.cw) - seam, 0, seam, height);
  for (let row = 1; row < grid.rows; row++) ctx.fillRect(0, Math.round(row * grid.ch) - seam, width, seam);
  ctx.fillStyle = alpha(sample(0), .075);
  for (let col = 1; col < grid.cols; col++) ctx.fillRect(Math.round(col * grid.cw), 0, seam, height);
  for (let row = 1; row < grid.rows; row++) ctx.fillRect(0, Math.round(row * grid.ch), width, seam);
}

const canvases = new Map<string, HTMLCanvasElement>();
function layer(name: string, width: number, height: number) {
  let canvas = canvases.get(name);
  if (!canvas) { canvas = document.createElement('canvas'); canvases.set(name, canvas); }
  if (canvas.width !== Math.ceil(width)) canvas.width = Math.max(1, Math.ceil(width));
  if (canvas.height !== Math.ceil(height)) canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext('2d')!;
  ctx.resetTransform(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none';
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

function roundedRect(ctx: Context, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath(); ctx.moveTo(r, 0); ctx.arcTo(width, 0, width, height, r);
  ctx.arcTo(width, height, 0, height, r); ctx.arcTo(0, height, 0, 0, r); ctx.arcTo(0, 0, width, 0, r); ctx.closePath();
}

function radial(ctx: Context, x: number, y: number, radius: number, stops: [number, string][]) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, Math.max(.001, radius));
  for (const [at, tone] of stops) gradient.addColorStop(clamp(at), tone);
  return gradient;
}

function ellipseFill(ctx: Context, width: number, height: number, x: number, y: number, rx: number, ry: number, stops: [number, string][]) {
  ctx.save(); ctx.translate(x, y); ctx.scale(1, Math.max(.08, ry / Math.max(1, rx)));
  ctx.fillStyle = radial(ctx, 0, 0, rx, stops); ctx.fillRect(-width * 3, -height * 3, width * 6, height * 6); ctx.restore();
}

const orbCenter = (time: number) => ({ x: .5 + .016 * Math.sin(time * .62), y: .5 + .013 * Math.cos(time * .54) });
function orbPosition(x: number, y: number, time: number) {
  const center = orbCenter(time), breathe = 1 + .018 * Math.sin(time * .86);
  return Math.pow(clamp(Math.hypot((x - center.x) / (.71 * breathe), (y - center.y) / (.57 * breathe))), .85);
}

function orbSprite(size: number, radius: number, shadowColour: RGB, glow: number) {
  const pad = Math.ceil(size * .2), shadow = layer('orb-shadow', size + pad * 2, size + pad * 2);
  shadow.ctx.save(); shadow.ctx.translate(pad, pad); shadow.ctx.shadowColor = alpha(shadowColour, .1);
  shadow.ctx.shadowBlur = size * .09; shadow.ctx.shadowOffsetY = size * .05;
  roundedRect(shadow.ctx, size, size, radius); shadow.ctx.fillStyle = '#000'; shadow.ctx.fill();
  shadow.ctx.shadowColor = 'transparent'; shadow.ctx.globalCompositeOperation = 'destination-out'; shadow.ctx.fill(); shadow.ctx.restore();
  const overlay = layer('orb-overlay', size, size), ctx = overlay.ctx;
  ctx.save(); roundedRect(ctx, size, size, radius); ctx.clip();
  ctx.fillStyle = radial(ctx, size * .3, size * .243, size * .78,
    Array.from({ length: 5 }, (_, i) => [i / 4, `rgba(255,255,255,${(.07 + glow * .26) * (1 - i / 4) ** 1.8})`]));
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = radial(ctx, size * .76, size * .81, size * .82,
    Array.from({ length: 5 }, (_, i) => [i / 4, alpha(shadowColour, (.04 + glow * .12) * (1 - i / 4) ** 1.8)]));
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = radial(ctx, size * .47, size * .46, size * .56, [[.9, alpha(shadowColour, 0)], [1, alpha(shadowColour, .08)]]);
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = radial(ctx, size * .53, size * .54, size * .56, [[.93, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,.16)']]);
  ctx.fillRect(0, 0, size, size); ctx.restore();
  return { shadow: shadow.canvas, overlay: overlay.canvas, pad };
}

function paintOrbs(ctx: Context, width: number, height: number, state: StudioState, time: number, sample: Sample) {
  const center = orbCenter(time), entry = clamp((time - (BASE_TIME - .9)) / .9);
  ctx.fillStyle = colour(sample(1)); ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.globalAlpha = smooth((entry - .21) / (.55 - .21));
  ellipseFill(ctx, width, height, center.x * width, center.y * height, width * .63, height * .52,
    Array.from({ length: 18 }, (_, i) => [i / 17, colour(sample(.14 + .86 * (i / 17) ** .8))]));
  ctx.restore();
  const shimmer = smooth((entry - .35) / .4), pulse = Math.sin(time * 2.9), breathing = 1.0175 + .0175 * pulse;
  const highlight = sample(.62), light = rgb(mixReferenceColour('#' + highlight.map(c => c.toString(16).padStart(2, '0')).join(''), '#FFFFFF', .38));
  ctx.save(); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = (.26 + .05 * pulse) * shimmer;
  ellipseFill(ctx, width, height, center.x * width, (center.y + .026) * height, width * .568 * breathing, height * .658 * breathing,
    [[0, alpha(highlight, .75)], [.42, alpha(light, .28)], [1, alpha(light, 0)]]); ctx.restore();
  const grid = pixelGrid(width, height, value(state, 'scale', 50), 'orbs'), pitch = Math.min(grid.cw, grid.ch);
  const size = Math.max(2, pitch * (1 - clamp(value(state, 'cover', 4) / 100)));
  const corner = size / 2 * clamp(value(state, 'rings', 100) / 100), glow = clamp(value(state, 'weave', 45) / 100);
  const sprite = orbSprite(size, corner, sample(0), glow);
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const x = (col + .5) / grid.cols, y = (row + .5) / grid.rows;
    const distance = Math.min(1, Math.hypot((x - .5) / .5, (y - .52) / .52) / Math.SQRT2);
    let pop = 1;
    if (entry < 1) { const t = clamp((entry - (.06 + distance * .41)) / .21), offset = t - 1; pop = t <= 0 ? 0 : t >= 1 ? 1 : 1 + 2.2 * offset ** 3 + 1.2 * offset ** 2; }
    if (pop < .02) continue;
    const phase = time * 2.9 - distance * 6.5;
    const offset = pitch * (.026 + .052 * (1 - distance)) * Math.sin(phase);
    const scale = pop < 1 ? pop : 1 + .016 * Math.sin(phase - .7);
    const cx = (col + .5) * grid.cw, cy = (row + .5) * grid.ch + offset;
    const cell = size * scale, shadowSize = (size + sprite.pad * 2) * scale;
    ctx.save(); ctx.globalAlpha = pop < 1 ? Math.min(1, pop * 1.4) : 1;
    ctx.drawImage(sprite.shadow, cx - shadowSize / 2, cy - shadowSize / 2, shadowSize, shadowSize);
    ctx.translate(cx - cell / 2, cy - cell / 2); roundedRect(ctx, cell, cell, corner * scale);
    ctx.fillStyle = colour(sample(orbPosition(x, y, time))); ctx.fill();
    ctx.drawImage(sprite.overlay, 0, 0, cell, cell); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = (.2 + .03 * pulse) * shimmer;
  ellipseFill(ctx, width, height, center.x * width, (center.y + .026) * height, width * .568 * breathing, height * .658 * breathing,
    [[0, alpha(sample(Math.pow(clamp(.1 * .568 / .71), .85)), 0)], [.28, alpha(sample(Math.pow(.28 * .568 / .71, .85)), .4)],
      [.5, alpha(sample(Math.pow(.5 * .568 / .71, .85)), 1)], [.72, alpha(sample(Math.pow(.72 * .568 / .71, .85)), .35)], [.95, alpha(sample(Math.pow(.95 * .568 / .71, .85)), 0)]]);
  ctx.restore();
}

const glassCenter = (time: number) => ({ x: .4 + .024 * Math.sin(time * .62), y: .78 + .024 * Math.cos(time * .54) });
function glassPosition(x: number, y: number, time: number) {
  const center = glassCenter(time); return clamp(Math.hypot((x - center.x) / .72, (y - center.y) / .62));
}
function paintGlassBackground(ctx: Context, width: number, height: number, time: number, sample: Sample) {
  const center = glassCenter(time);
  ctx.fillStyle = colour(sample(1)); ctx.fillRect(0, 0, width, height);
  ellipseFill(ctx, width, height, center.x * width, center.y * height, width * .72, height * .62,
    Array.from({ length: 14 }, (_, i) => [i / 13, colour(sample(i / 13))]));
}
function glassCells(grid: Grid, time: number, cover: number): GlassCell[] {
  const entry = clamp((time - (BASE_TIME - 1.15)) / 1.15), candidates: { row: number; col: number; start: number; seed: number }[] = [];
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const x = (col + .5) / grid.cols;
    const start = Math.min(grid.rows - 1, Math.floor(grid.rows * .78 * (1 - clamp(cover / 100))) + (x < .4 ? 0 : x < .5 ? 1 : x < .7 ? 2 : 1));
    if (row < start) continue;
    const depth = (row - start) / Math.max(1, grid.rows - start - 1);
    if (noise(row * 5 + 11, col * 13 + 7) < .28 * (1 - depth) ** 3.5) continue;
    candidates.push({ row, col, start, seed: noise(row, col) });
  }
  const ordered = [...candidates].sort((a, b) => a.seed - b.seed || a.row - b.row || a.col - b.col);
  const order = new Map(ordered.map((cell, i) => [cell.row * 4096 + cell.col, ordered.length > 1 ? i / (ordered.length - 1) : 0]));
  return candidates.flatMap(({ row, col, start, seed }) => {
    const pop = entry >= 1 ? 1 : smooth((entry - order.get(row * 4096 + col)! * .95) / .05);
    if (pop <= .01) return [];
    const depth = (row - start) / Math.max(1, grid.rows - start - 1);
    return [{ row, col, x: col * grid.cw, y: row * grid.ch, pop,
      alpha: clamp(.88 + depth * .06 + (seed - .5) * .04 + .045 * Math.sin(time * 1.1 + seed * TAU)) * pop,
      paper: .5 * smooth(1 - (row - start) / 2.6), film: 0, shade: 0 }];
  });
}

function paintPixelGlass(ctx: Context, width: number, height: number, state: StudioState, time: number, sample: Sample) {
  const grid = pixelGrid(width, height, value(state, 'scale', 50), 'glass'), pitch = Math.min(grid.cw, grid.ch);
  const tw = grid.cw * .984, th = grid.ch * .984, insetX = (grid.cw - tw) / 2, insetY = (grid.ch - th) / 2, radius = Math.min(tw, th) * .19;
  const cells = glassCells(grid, time, value(state, 'cover', 50));
  ctx.fillStyle = colour(sample(1)); ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.globalAlpha = .68; paintGlassBackground(ctx, width, height, time, sample); ctx.restore();
  const shadow = layer('pixel-glass-shadow', width, height), ink = sample(0);
  for (const cell of cells) {
    const scale = .82 + .18 * cell.pop;
    shadow.ctx.save(); shadow.ctx.translate(cell.x + insetX + tw / 2, cell.y + insetY + th / 2 + pitch * .045);
    shadow.ctx.scale(scale, scale); shadow.ctx.translate(-tw / 2, -th / 2); roundedRect(shadow.ctx, tw, th, radius);
    shadow.ctx.globalAlpha = cell.alpha * .14; shadow.ctx.fillStyle = colour(ink); shadow.ctx.fill(); shadow.ctx.restore();
  }
  ctx.save(); ctx.filter = `blur(${2 * pitch * .075}px)`; ctx.drawImage(shadow.canvas, 0, 0); ctx.restore();
  const source = layer('pixel-glass-source', width, height); paintGlassBackground(source.ctx, width, height, time, sample);
  source.ctx.fillStyle = 'rgba(255,255,255,.03)'; source.ctx.fillRect(0, 0, width, height);
  const angle = 128.1 * Math.PI / 180, dx = Math.sin(angle), dy = -Math.cos(angle), reach = (Math.abs(dx) * tw + Math.abs(dy) * th) / 2;
  for (const cell of cells) {
    const pop = .82 + .18 * cell.pop, wobble = .011 * Math.sin(time * 1.35 + noise(cell.col + 5, cell.row + 43) * TAU);
    const cx = cell.x + grid.cw / 2, cy = cell.y + grid.ch / 2;
    const variation = (noise(cell.col + 37, cell.row + 11) - .5) * .03;
    const first = mix(sample(glassPosition((cx - dx * reach) / width, (cy - dy * reach) / height, time) + variation), white, cell.paper);
    const second = mix(sample(glassPosition((cx + dx * reach) / width, (cy + dy * reach) / height, time) + variation), white, cell.paper);
    ctx.save(); ctx.translate(cell.x + insetX + tw / 2, cell.y + insetY + th / 2); ctx.scale(pop * (1 + wobble), pop * (1 - wobble)); ctx.translate(-tw / 2, -th / 2);
    roundedRect(ctx, tw, th, radius); ctx.clip();
    const cropW = tw * .84, cropH = th * .84;
    const cropX = clamp(cell.x + insetX + (tw - cropW) / 2 - pitch * .16 * (.7 + .6 * (noise(cell.col + 91, cell.row + 53) - .5)), 0, Math.max(0, width - cropW));
    const cropY = clamp(cell.y + insetY + (th - cropH) / 2 - pitch * .16 * (.55 + .6 * (noise(cell.col + 17, cell.row + 71) - .5)), 0, Math.max(0, height - cropH));
    ctx.globalAlpha = cell.alpha * .14; ctx.drawImage(source.canvas, cropX, cropY, cropW, cropH, 0, 0, tw, th);
    const body = ctx.createLinearGradient(tw / 2 - dx * reach, th / 2 - dy * reach, tw / 2 + dx * reach, th / 2 + dy * reach);
    body.addColorStop(0, colour(mix(first, white, .36))); body.addColorStop(.5, colour(mix(mix(first, second, .5), white, .06)));
    body.addColorStop(1, colour(mix(second, ink, .17 * (1 - cell.paper)))); ctx.globalAlpha = cell.alpha * .09; ctx.fillStyle = body; ctx.fillRect(0, 0, tw, th);
    ctx.globalAlpha = cell.alpha;
    ctx.fillStyle = radial(ctx, tw * .3, th * .24, pitch * .85, [[0, 'rgba(255,255,255,.28)'], [.55, 'rgba(255,255,255,.05)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = radial(ctx, tw * .72, th * .86, pitch * .9, [[0, alpha(ink, .09)], [.6, alpha(ink, .03)], [1, alpha(ink, 0)]]); ctx.fillRect(0, 0, tw, th);
    const upper = ctx.createLinearGradient(0, 0, 0, th); upper.addColorStop(0, 'rgba(255,255,255,.22)'); upper.addColorStop(.16, 'rgba(255,255,255,.1)'); upper.addColorStop(.48, 'rgba(255,255,255,0)');
    ctx.fillStyle = upper; ctx.fillRect(0, 0, tw, th);
    ctx.fillStyle = radial(ctx, tw * .21, th * .15, pitch * .1, [[0, 'rgba(255,255,255,.34)'], [.7, 'rgba(255,255,255,.1)'], [1, 'rgba(255,255,255,0)']]); ctx.fillRect(0, 0, tw, th);
    const edge = ctx.createLinearGradient(0, 0, tw, th); edge.addColorStop(0, 'rgba(255,255,255,.55)'); edge.addColorStop(.42, 'rgba(255,255,255,.2)'); edge.addColorStop(.72, alpha(ink, .1)); edge.addColorStop(1, alpha(ink, .26));
    roundedRect(ctx, tw, th, radius); ctx.strokeStyle = edge; ctx.lineWidth = Math.max(1.2, pitch * .022); ctx.stroke(); ctx.restore();
  }
  const fillRow = Math.floor(grid.rows * .78 * (1 - clamp(value(state, 'cover', 50) / 100)));
  const top = (fillRow - 1.6) * grid.ch, bottom = (fillRow + 1.2) * grid.ch;
  const veil = ctx.createLinearGradient(0, top, 0, bottom);
  veil.addColorStop(0, 'rgba(255,255,255,0)'); veil.addColorStop(.45, 'rgba(255,255,255,.32)'); veil.addColorStop(.7, 'rgba(255,255,255,.1)'); veil.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = veil; ctx.fillRect(0, Math.max(0, top), width, bottom - Math.max(0, top));
}

export function glassyLens(x: number, y: number, width: number, height: number, warp: number) {
  const amount = clamp(warp, -100, 100), strength = amount / 100 * (amount >= 0 ? .6 : .45);
  if (Math.abs(strength) < .001) return { x, y, a: 1, b: 0, c: 0, d: 1 };
  const cx = width / 2, cy = height / 2, maximum = Math.max(1, Math.hypot(cx, cy));
  const dx = x - cx, dy = y - cy, distance = Math.hypot(dx, dy), square = (distance / maximum) ** 2;
  const denominator = 1 + strength * square;
  const stretch = clamp((1 + strength) / denominator, .3, 1.8);
  const radialStretch = clamp((1 + strength) * (1 - strength * square) / denominator ** 2, .22, 1.8);
  const nx = distance > .001 ? dx / distance : 1, ny = distance > .001 ? dy / distance : 0;
  const shear = (radialStretch - stretch) * nx * ny;
  return { x: cx + dx * stretch, y: cy + dy * stretch, a: radialStretch * nx * nx + stretch * ny * ny, b: shear, c: shear, d: radialStretch * ny * ny + stretch * nx * nx };
}

function glassyBlobs(grid: Grid, width: number, height: number, time: number, cover: number, sample: Sample): Blob[] {
  const cx = width / 2, cy = height / 2, rx = grid.cols * grid.cw / 2, ry = grid.rows * grid.ch / 2, zoom = .95 + .3 * clamp(cover / 100);
  return [
    { x: cx + rx * zoom * (.4 + .03 * Math.sin(time * .42 + 2.1)), y: cy - ry * zoom * (.34 + .03 * Math.cos(time * .5 + .7)), rx: rx * zoom * .56, ry: ry * zoom * .6, c0: sample(.3), c1: sample(.55) },
    { x: cx - rx * zoom * (.26 + .03 * Math.sin(time * .5)), y: cy + ry * zoom * (.1 + .03 * Math.cos(time * .44 + 1.3)), rx: rx * zoom * .75, ry: ry * zoom * .8, c0: sample(.1), c1: sample(.42) },
    { x: cx + rx * zoom * (.06 + .03 * Math.cos(time * .38 + .4)), y: cy + ry * zoom * (.38 + .03 * Math.sin(time * .46 + 2.6)), rx: rx * zoom * .52, ry: ry * zoom * .46, c0: sample(0), c1: sample(.18) },
  ];
}
function paperAt(blobs: Blob[], x: number, y: number) {
  return 1 - Math.max(...blobs.map(blob => clamp((1 - Math.hypot((x - blob.x) / blob.rx, (y - blob.y) / blob.ry)) / .5)));
}
function glassyCells(grid: Grid, width: number, height: number, time: number, blobs: Blob[], frost: number): GlassCell[] {
  const cells: GlassCell[] = [], entry = clamp((time - (BASE_TIME - .9)) / .9);
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) {
    const x = grid.x0 + (col + .5) * grid.cw, y = grid.y0 + (row + .5) * grid.ch;
    const paper = paperAt(blobs, x, y), seed = noise(row + 29, col + 61), scatter = noise(row * 3 + 7, col * 5 + 31);
    const film = clamp((.06 + .12 * smooth((paper - .45) / .55) + (seed - .5) * .1 + smooth((scatter - .62) / .38) * .24) * frost ** 1.3 + .02 * Math.sin(time * 1.1 + seed * TAU));
    const shade = smooth((.38 - scatter) / .38) * .14 * (1 - paper * .7);
    const distance = clamp(Math.hypot((x - width / 2) / Math.max(1, grid.cols * grid.cw * .6), (y - height / 2) / Math.max(1, grid.rows * grid.ch * .6)) * .75 + noise(row + 3, col + 17) * .25);
    const pop = entry < 1 ? smooth((entry - distance * .76) / .24) : 1;
    if (pop > .01) cells.push({ row, col, x: grid.x0 + col * grid.cw, y: grid.y0 + row * grid.ch, paper, film, shade, pop, alpha: pop });
  }
  return cells;
}
function paintBlobs(ctx: Context, width: number, height: number, sample: Sample, blobs: Blob[]) {
  ctx.fillStyle = colour(sample(1)); ctx.fillRect(0, 0, width, height);
  for (const blob of blobs) ellipseFill(ctx, width, height, blob.x, blob.y, blob.rx, blob.ry,
    [[0, alpha(blob.c0, 1)], [.5, alpha(blob.c1, .95)], [.8, alpha(blob.c1, .5)], [1, alpha(blob.c1, 0)]]);
}

function roundedPolygon(points: [number, number][], radius: number) {
  let path = '';
  points.forEach(([x, y], i) => {
    const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const incoming = Math.hypot(x - previous[0], y - previous[1]) || 1, outgoing = Math.hypot(next[0] - x, next[1] - y) || 1;
    const before = Math.min(radius, incoming / 2) / incoming, after = Math.min(radius, outgoing / 2) / outgoing;
    path += `${i ? 'L' : 'M'}${x - (x - previous[0]) * before} ${y - (y - previous[1]) * before}Q${x} ${y} ${x + (next[0] - x) * after} ${y + (next[1] - y) * after}`;
  });
  return path + 'Z';
}

export function glassyTilePath(shape: string, width: number, height: number, radius: number): string {
  const kind = shape.toLowerCase(), min = Math.min(width, height), x = (t: number) => t * width, y = (t: number) => t * height;
  if (kind === 'circle') return `M${x(.5)} 0A${x(.5)} ${y(.5)} 0 1 1 ${x(.5)} ${height}A${x(.5)} ${y(.5)} 0 1 1 ${x(.5)} 0Z`;
  if (kind === 'hex' || kind === 'hexagon') return roundedPolygon([[x(.5), 0], [width, y(.25)], [width, y(.75)], [x(.5), height], [0, y(.75)], [0, y(.25)]], min * .12);
  if (kind === 'heart') return `M${x(.5)} ${y(.9)}C${x(.13)} ${y(.66)} ${x(.02)} ${y(.42)} ${x(.08)} ${y(.26)}C${x(.13)} ${y(.12)} ${x(.27)} ${y(.05)} ${x(.38)} ${y(.09)}C${x(.44)} ${y(.11)} ${x(.48)} ${y(.15)} ${x(.5)} ${y(.2)}C${x(.52)} ${y(.15)} ${x(.56)} ${y(.11)} ${x(.62)} ${y(.09)}C${x(.73)} ${y(.05)} ${x(.87)} ${y(.12)} ${x(.92)} ${y(.26)}C${x(.98)} ${y(.42)} ${x(.87)} ${y(.66)} ${x(.5)} ${y(.9)}Z`;
  if (kind === 'star') return roundedPolygon(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? .5 : 1; return [x(.5 + Math.cos(a) * .5 * r), y(.5 + Math.sin(a) * .5 * r)]; }), min * .06);
  if (kind === 'clover') return `M${x(.28)} ${y(.28)}A${x(.22)} ${y(.22)} 0 1 1 ${x(.72)} ${y(.28)}A${x(.22)} ${y(.22)} 0 1 1 ${x(.72)} ${y(.72)}A${x(.22)} ${y(.22)} 0 1 1 ${x(.28)} ${y(.72)}A${x(.22)} ${y(.22)} 0 1 1 ${x(.28)} ${y(.28)}Z`;
  if (kind === 'flower' || kind === 'scallop') {
    const petals = kind === 'flower' ? 6 : 12, r = kind === 'flower' ? .32 : .42, lobe = kind === 'flower' ? .19 : .13;
    let path = '';
    for (let i = 0; i <= petals; i++) { const a = -Math.PI / 2 + i % petals * TAU / petals; path += `${i ? `A${x(lobe)} ${y(lobe)} 0 ${kind === 'flower' ? 1 : 0} 1 ` : 'M'}${x(.5 + Math.cos(a) * r)} ${y(.5 + Math.sin(a) * r)}`; }
    return path + 'Z';
  }
  if (kind === 'leaf') return `M${x(.14)} ${y(.86)}A${x(.54)} ${y(.54)} 0 0 1 ${x(.86)} ${y(.14)}A${x(.54)} ${y(.54)} 0 0 1 ${x(.14)} ${y(.86)}Z`;
  if (kind === 'drop') return `M${x(.5)} ${y(.05)}C${x(.63)} ${y(.24)} ${x(.87)} ${y(.4)} ${x(.87)} ${y(.61)}A${x(.37)} ${y(.34)} 0 1 1 ${x(.13)} ${y(.61)}C${x(.13)} ${y(.4)} ${x(.37)} ${y(.24)} ${x(.5)} ${y(.05)}Z`;
  const r = Math.min(radius, width / 2, height / 2);
  return `M${r} 0H${width - r}A${r} ${r} 0 0 1 ${width} ${r}V${height - r}A${r} ${r} 0 0 1 ${width - r} ${height}H${r}A${r} ${r} 0 0 1 0 ${height - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
}

function paintGlassy(ctx: Context, width: number, height: number, state: StudioState, time: number, sample: Sample) {
  const cover = clamp(value(state, 'cover', 100), 0, 100), frost = clamp(value(state, 'weave', 50), 0, 100) / 50;
  const grid = glassyGrid(width, height, state), pitch = Math.min(grid.cw, grid.ch), gap = .115 - .09 * cover / 100;
  const tw = grid.cw * (1 - gap), th = grid.ch * (1 - gap), insetX = (grid.cw - tw) / 2, insetY = (grid.ch - th) / 2;
  const shape = new Path2D(glassyTilePath(String(state.params.shape ?? 'Square'), tw, th, Math.min(tw, th) * (.22 - .1 * cover / 100)));
  const blobs = glassyBlobs(grid, width, height, time, cover, sample), cells = glassyCells(grid, width, height, time, blobs, frost), ink = sample(0);
  const source = layer('glassy-source', width, height); paintBlobs(source.ctx, width, height, sample, blobs);
  ctx.fillStyle = colour(sample(1)); ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.globalAlpha = .48; ctx.filter = `blur(${2 * pitch * .4}px)`; ctx.drawImage(source.canvas, 0, 0); ctx.restore();
  const shadowOpacity = .17 * smooth((88 - cover) / 34);
  if (shadowOpacity > .005) {
    const shadow = layer('glassy-shadow', width, height);
    for (const cell of cells) {
      const lens = glassyLens(cell.x + grid.cw / 2, cell.y + grid.ch / 2, width, height, value(state, 'warp', 0)), pop = .82 + .18 * cell.pop;
      shadow.ctx.save(); shadow.ctx.translate(lens.x, lens.y + pitch * .05); shadow.ctx.transform(lens.a, lens.b, lens.c, lens.d, 0, 0);
      shadow.ctx.scale(pop, pop); shadow.ctx.translate(-tw / 2, -th / 2); shadow.ctx.globalAlpha = cell.alpha * shadowOpacity * (1 - cell.paper * .6);
      shadow.ctx.fillStyle = colour(ink); shadow.ctx.fill(shape); shadow.ctx.restore();
    }
    ctx.save(); ctx.filter = `blur(${2 * pitch * .085}px)`; ctx.drawImage(shadow.canvas, 0, 0); ctx.restore();
  }
  const refract = Math.max(.15, 1 - .0088 * clamp(value(state, 'refract', 50), 0, 100)), cropW = tw * refract, cropH = th * refract;
  for (const cell of cells) {
    const pop = .82 + .18 * cell.pop, wobble = 1 + .006 * Math.sin(time * 1.1 + noise(cell.col + 5, cell.row + 43) * TAU);
    const lens = glassyLens(cell.x + grid.cw / 2, cell.y + grid.ch / 2, width, height, value(state, 'warp', 0));
    ctx.save(); ctx.translate(lens.x, lens.y); ctx.transform(lens.a, lens.b, lens.c, lens.d, 0, 0); ctx.scale(pop * wobble, pop / wobble); ctx.translate(-tw / 2, -th / 2);
    ctx.globalAlpha = cell.alpha; ctx.clip(shape);
    const cropX = clamp(cell.x + insetX + (tw - cropW) / 2 - pitch * .08 * (noise(cell.col + 91, cell.row + 53) - .5) * 2, 0, Math.max(0, width - cropW));
    const cropY = clamp(cell.y + insetY + (th - cropH) / 2 - pitch * .08 * (noise(cell.col + 17, cell.row + 71) - .5) * 2, 0, Math.max(0, height - cropH));
    ctx.drawImage(source.canvas, cropX, cropY, cropW, cropH, 0, 0, tw, th);
    ctx.fillStyle = alpha(white, cell.film); ctx.fillRect(0, 0, tw, th);
    if (cell.shade > .004) { ctx.fillStyle = alpha(ink, cell.shade); ctx.fillRect(0, 0, tw, th); }
    const top = ctx.createLinearGradient(0, 0, 0, th); top.addColorStop(0, alpha(white, Math.min(.42, .22 * (.55 + .45 * frost)))); top.addColorStop(.32, alpha(white, .03)); top.addColorStop(1, alpha(white, 0));
    ctx.fillStyle = top; ctx.fillRect(0, 0, tw, th);
    const shade = ctx.createLinearGradient(0, 0, tw, th); shade.addColorStop(0, alpha(ink, 0)); shade.addColorStop(.55, alpha(ink, 0)); shade.addColorStop(1, alpha(ink, .06));
    ctx.fillStyle = shade; ctx.fillRect(0, 0, tw, th);
    const bottom = ctx.createLinearGradient(0, th * .72, 0, th); bottom.addColorStop(0, alpha(ink, 0)); bottom.addColorStop(1, alpha(ink, .06)); ctx.fillStyle = bottom; ctx.fillRect(0, 0, tw, th);
    ctx.strokeStyle = alpha(white, Math.min(.6, .16 * frost * (.18 + .82 * cell.paper))); ctx.lineWidth = pitch * .11; ctx.stroke(shape);
    const rim = ctx.createLinearGradient(0, 0, tw, th); rim.addColorStop(0, alpha(white, .42)); rim.addColorStop(.45, alpha(white, .14)); rim.addColorStop(1, alpha(ink, .12));
    ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1, pitch * .016); ctx.stroke(shape); ctx.restore();
  }
}

/** Full-resolution canvas renderer; every style uses the reference geometry and optical layers. */
export function paintNativeTexture(ctx: Context, width: number, height: number, state: StudioState, time = state.time): boolean {
  if (state.type !== 'pixel' && state.type !== 'glassy') return false;
  const sample = sampler(state);
  ctx.save(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  if (state.type === 'glassy') paintGlassy(ctx, width, height, state, time, sample);
  else if (String(state.params.style ?? 'Quilt').toLowerCase() === 'orbs') paintOrbs(ctx, width, height, state, time, sample);
  else if (String(state.params.style ?? 'Quilt').toLowerCase() === 'glass') paintPixelGlass(ctx, width, height, state, time, sample);
  else paintQuilt(ctx, width, height, state, time, sample);
  ctx.restore(); return true;
}

/** Browser-side pixel requests also use the exact canvas path rather than a second approximation. */
export function nativeTexturePixels(width: number, height: number, state: StudioState, time = state.time): Uint8ClampedArray<ArrayBuffer> | null {
  if (typeof document === 'undefined' || typeof Path2D === 'undefined') return null;
  const output = layer('texture-pixels', width, height);
  if (!paintNativeTexture(output.ctx, width, height, state, time)) return null;
  return new Uint8ClampedArray(output.ctx.getImageData(0, 0, width, height).data);
}

/** Document-free rendering for static analysis/server consumers. Browser preview and exports use Canvas above. */
export function texturePixels(width: number, height: number, state: StudioState, time = state.time): Uint8ClampedArray<ArrayBuffer> {
  const native = nativeTexturePixels(width, height, state, time);
  if (native) return native;
  const output = new Uint8ClampedArray(width * height * 4), sample = sampler(state), style = String(state.params.style ?? 'Quilt').toLowerCase();
  const grid = state.type === 'glassy' ? glassyGrid(width, height, state) : pixelGrid(width, height, value(state, 'scale', 50), style);
  const pitch = Math.min(grid.cw, grid.ch), ink = sample(0), paper = sample(1);
  const blobs = glassyBlobs(grid, width, height, time, value(state, 'cover', 100), sample);
  const cells = state.type === 'glassy' ? glassyCells(grid, width, height, time, blobs, clamp(value(state, 'weave', 50), 0, 100) / 50)
    : style === 'glass' ? glassCells(grid, time, value(state, 'cover', 50)) : [];
  const cellMap = new Map(cells.map(cell => [cell.row * 4096 + cell.col, cell]));
  const blobColour = (x: number, y: number) => {
    let result = paper;
    for (const blob of blobs) {
      const distance = Math.hypot((x - blob.x) / blob.rx, (y - blob.y) / blob.ry);
      if (distance >= 1) continue;
      const weight = distance < .5 ? 1 - distance * .1 : distance < .8 ? .95 - (distance - .5) / .3 * .45 : .5 * (1 - distance) / .2;
      result = mix(result, mix(blob.c0, blob.c1, Math.min(1, distance * 2)), weight);
    }
    return result;
  };
  for (let py = 0; py < height; py++) for (let px = 0; px < width; px++) {
    const x = px + .5, y = py + .5;
    let col = Math.floor((x - grid.x0) / grid.cw), row = Math.floor((y - grid.y0) / grid.ch), tone: RGB;
    if (state.type !== 'glassy' && style === 'quilt') {
      tone = sample(quiltPosition(grid, row, col, time, value(state, 'rings', 12), value(state, 'weave', 20)));
      const localX = x - col * grid.cw, localY = y - row * grid.ch, seam = Math.max(.65, pitch * .014);
      if ((col > 0 && localX < seam) || (row > 0 && localY < seam)) tone = mix(tone, ink, .075);
      if ((col < grid.cols - 1 && grid.cw - localX < seam) || (row < grid.rows - 1 && grid.ch - localY < seam)) tone = mix(tone, white, .12);
    } else if (state.type !== 'glassy' && style === 'orbs') {
      const center = orbCenter(time);
      tone = sample(.14 + .86 * clamp(Math.hypot((x / width - center.x) / .63, (y / height - center.y) / .52)) ** .8);
      const cx = (col + .5) * grid.cw, cy = (row + .5) * grid.ch;
      const distance = Math.min(1, Math.hypot(((col + .5) / grid.cols - .5) / .5, ((row + .5) / grid.rows - .52) / .52) / Math.SQRT2);
      const phase = time * 2.9 - distance * 6.5, size = Math.max(2, pitch * (1 - clamp(value(state, 'cover', 4) / 100))) * (1 + .016 * Math.sin(phase - .7));
      const dy = y - cy - pitch * (.026 + .052 * (1 - distance)) * Math.sin(phase);
      const corner = size / 2 * clamp(value(state, 'rings', 100) / 100), qx = Math.abs(x - cx) - size / 2 + corner, qy = Math.abs(dy) - size / 2 + corner;
      const edge = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - corner;
      if (edge < .5) {
        let body = sample(orbPosition((col + .5) / grid.cols, (row + .5) / grid.rows, time));
        const nx = (x - cx) / size + .5, ny = dy / size + .5, glow = clamp(value(state, 'weave', 45) / 100);
        body = mix(body, white, (.07 + glow * .26) * Math.max(0, 1 - Math.hypot(nx - .3, ny - .243) / .78) ** 1.8);
        body = mix(body, ink, (.04 + glow * .12) * Math.max(0, 1 - Math.hypot(nx - .76, ny - .81) / .82) ** 1.8);
        tone = mix(tone, body, clamp(.5 - edge));
      }
    } else if (state.type === 'glassy') {
      tone = mix(paper, blobColour(x, y), .48);
      // Invert the radial camera lens before finding the tile and its local optical patch.
      const warp = clamp(value(state, 'warp', 0), -100, 100), strength = warp / 100 * (warp >= 0 ? .6 : .45);
      const dx = x - width / 2, dy = y - height / 2, radius = Math.hypot(dx, dy), maximum = Math.hypot(width / 2, height / 2);
      let original = radius;
      for (let iteration = 0; iteration < 5; iteration++) { const square = (original / maximum) ** 2, d = 1 + strength * square; original -= (original * (1 + strength) / d - radius) / Math.max(.05, (1 + strength) * (1 - strength * square) / d ** 2); }
      const unwarpedX = width / 2 + dx * original / Math.max(.00001, radius), unwarpedY = height / 2 + dy * original / Math.max(.00001, radius);
      col = Math.floor((unwarpedX - grid.x0) / grid.cw); row = Math.floor((unwarpedY - grid.y0) / grid.ch);
      const cell = cellMap.get(row * 4096 + col);
      if (cell) {
        const gap = .115 - .09 * clamp(value(state, 'cover', 100) / 100), tw = grid.cw * (1 - gap), th = grid.ch * (1 - gap);
        const lens = glassyLens(cell.x + grid.cw / 2, cell.y + grid.ch / 2, width, height, warp);
        const determinant = lens.a * lens.d - lens.b * lens.c;
        const localX = ((x - lens.x) * lens.d - (y - lens.y) * lens.c) / determinant / tw + .5;
        const localY = ((y - lens.y) * lens.a - (x - lens.x) * lens.b) / determinant / th + .5;
        const edge = tileDistance(localX, localY, String(state.params.shape ?? 'Square'));
        if (edge < 0) {
          const refract = Math.max(.15, 1 - .0088 * clamp(value(state, 'refract', 50), 0, 100));
          let body = blobColour(cell.x + grid.cw / 2 + (localX - .5) * tw * refract - pitch * .08 * (noise(col + 91, row + 53) - .5) * 2,
            cell.y + grid.ch / 2 + (localY - .5) * th * refract - pitch * .08 * (noise(col + 17, row + 71) - .5) * 2);
          body = mix(body, white, cell.film); body = mix(body, ink, cell.shade);
          body = mix(body, white, Math.max(0, 1 - localY / .32) * Math.min(.42, .22 * (.55 + .45 * value(state, 'weave', 50) / 50)));
          if (edge > -.025) body = mix(body, localX + localY < 1 ? white : ink, .3);
          tone = mix(tone, body, cell.alpha * clamp(-edge * Math.min(tw, th)));
        }
      }
    } else {
      tone = mix(paper, sample(glassPosition(x / width, y / height, time)), .68);
      const cell = cellMap.get(row * 4096 + col);
      if (cell) {
        const localX = x / grid.cw - col, localY = y / grid.ch - row, edge = tileDistance(localX, localY, 'Square');
        if (edge < -.008) {
          const body = sample(glassPosition((col + .5) / grid.cols, (row + .5) / grid.rows, time));
          tone = mix(tone, body, cell.alpha * .14);
          tone = mix(tone, white, cell.alpha * (.28 * Math.max(0, 1 - Math.hypot(localX - .3, localY - .24) / .85) + .22 * Math.max(0, 1 - localY / .48)));
          if (edge > -.03) tone = mix(tone, localX + localY < 1 ? white : ink, .25 * cell.alpha);
        }
      }
    }
    const offset = (py * width + px) * 4; output[offset] = tone[0]; output[offset + 1] = tone[1]; output[offset + 2] = tone[2]; output[offset + 3] = 255;
  }
  return output;
}

function tileDistance(x: number, y: number, shape: string) {
  const dx = x - .5, dy = y - .5, radius = Math.hypot(dx, dy), angle = Math.atan2(dy, dx);
  switch (shape.toLowerCase()) {
    case 'circle': return radius - .5;
    case 'hexagon': case 'hex': return Math.max(Math.abs(dx) * .866 + Math.abs(dy) * .5, Math.abs(dy)) - .43;
    case 'star': return radius - (.36 + .12 * Math.cos((angle + Math.PI / 2) * 5));
    case 'clover': return radius - (.38 - .1 * Math.cos(angle * 4));
    case 'flower': return radius - (.41 - .07 * Math.cos((angle + Math.PI / 2) * 6));
    case 'scallop': return radius - (.46 - .025 * Math.cos((angle + Math.PI / 2) * 12));
    case 'leaf': return Math.max(Math.hypot(dx + .13, dy + .13), Math.hypot(dx - .13, dy - .13)) - .54;
    case 'drop': return radius - (.36 + .09 * Math.sin(angle));
    case 'heart': return Math.max(Math.abs(dx) * .7 + dy * .7 - .3, Math.hypot(Math.abs(dx) - .22, dy + .11) - .32);
    default: { const qx = Math.abs(dx) - .31, qy = Math.abs(dy) - .31; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - .19; }
  }
}
