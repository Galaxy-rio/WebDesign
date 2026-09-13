import test from 'node:test';
import assert from 'node:assert/strict';
import { GLOW_ARRANGEMENTS, GLOW_PALETTES, GLOW_DEFAULTS, glowPixels, glowShapes, glowPath, blurMask } from '../src/lib/pigment/glow.ts';

const design = (name = 'Edge') => {
  const arrangement = GLOW_ARRANGEMENTS.find(entry => entry.name === name)!;
  return { colors: arrangement.colors, divisions: [1 / 3, 2 / 3], params: { ...GLOW_DEFAULTS, arrangement: name } };
};
const channel = (pixels: Uint8ClampedArray, width: number, x: number, y: number) => Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 3));

test('Glow has twelve distinct arrangements and thirteen independent colourways', () => {
  assert.equal(GLOW_ARRANGEMENTS.length, 12);
  assert.equal(GLOW_PALETTES.length, 13);
  assert.deepEqual(GLOW_ARRANGEMENTS.map(entry => entry.name), ['Edge', 'Circles', 'Scribble', 'Ellipses', 'Pebbles', 'Moons', 'Tiles', 'Bloom', 'Halo', 'Spark', 'Petals', 'Dunes']);
  assert.equal(GLOW_ARRANGEMENTS.find(entry => entry.name === 'Scribble')!.shapes[0].pts!.length, 14);
  assert.equal(new Set(GLOW_ARRANGEMENTS.flatMap(entry => entry.shapes.map(shape => shape.form))).size, 10);
});

test('Edge places two filled ellipses using portrait-specific reference anchors', () => {
  const [top, bottom] = glowShapes(GLOW_DEFAULTS, .8);
  assert.deepEqual([top.x, top.y, top.scale, top.rotate], [34, 1, 170, -45]);
  assert.deepEqual([bottom.x, bottom.y, bottom.scale, bottom.rotate], [53, 108, 158, -9]);
  const [wideTop] = glowShapes(GLOW_DEFAULTS, 16 / 9);
  assert.deepEqual([wideTop.x, wideTop.y, wideTop.scale], [82, -28, 165]);
});

test('Every Glow arrangement produces deterministic opaque geometry', () => {
  const signatures = new Set<string>();
  for (const arrangement of GLOW_ARRANGEMENTS) {
    const first = glowPixels(64, 80, design(arrangement.name));
    const second = glowPixels(64, 80, design(arrangement.name));
    assert.deepEqual(first, second, arrangement.name);
    for (let i = 3; i < first.length; i += 4) assert.equal(first[i], 255);
    signatures.add(Buffer.from(first).toString('base64'));
  }
  assert.equal(signatures.size, 12);
});

test('Edge leaves empty space dark and lights its two inner rims in different colours', () => {
  const pixels = glowPixels(160, 200, design());
  assert.deepEqual(channel(pixels, 160, 159, 95), [7, 43, 53]);
  assert.deepEqual(channel(pixels, 160, 90, 199), [7, 43, 53]);
  let lime = 0, mint = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] > 110 && pixels[i + 1] > 140 && pixels[i + 2] < 130) lime++;
    if (pixels[i] < 100 && pixels[i + 1] > 125 && pixels[i + 2] > 90) mint++;
  }
  assert.ok(lime > 50, 'upper ellipse should have a bright lime rim');
  assert.ok(mint > 50, 'lower ellipse should have a mint rim');
});

test('Glow palettes retint existing silhouettes without changing their geometry', () => {
  const state = design('Bloom');
  const before = glowShapes(state.params, .8);
  state.colors = GLOW_PALETTES[1].colors;
  assert.deepEqual(glowShapes(state.params, .8), before);
  assert.notDeepEqual(glowPixels(64, 80, state), glowPixels(64, 80, design('Bloom')));
});

test('Light strength zero restores a flat background with no exterior halo', () => {
  const state = design(); state.params.intensity = 0;
  const pixels = glowPixels(64, 80, state);
  for (let i = 0; i < pixels.length; i += 4) assert.deepEqual(Array.from(pixels.slice(i, i + 4)), [7, 43, 53, 255]);
});

test('Glow control changes preserve topology and alter the intended light or shape field', () => {
  const baseline = glowPixels(64, 80, design());
  for (const [key, value] of Object.entries({ size: 70, width: 40, intensity: 50, angle: 90 })) {
    const state = design(); state.params[key as 'size'] = value;
    assert.notDeepEqual(glowPixels(64, 80, state), baseline, key);
  }
  const moving = design(); moving.params.sway = 50;
  assert.notDeepEqual(glowPixels(64, 80, moving, 20.75), glowPixels(64, 80, moving, 23));
});

test('Gaussian mask filtering preserves a flat interior without seams', () => {
  const flat = new Float32Array(35 * 43).fill(1);
  const blurred = blurMask(flat, 35, 43, 3.4);
  assert.ok(blurred.every(value => Math.abs(value - 1) < 1e-6));
  const ring = glowShapes({ ...GLOW_DEFAULTS, arrangement: 'Halo' }, .8)[0];
  const path = glowPath(ring, 160, 200);
  assert.ok(Math.hypot(path[0][0] - path.at(-1)![0], path[0][1] - path.at(-1)![1]) < .001);
});
