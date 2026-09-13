import test from 'node:test';
import assert from 'node:assert/strict';
import palettes from '../src/data/prism-presets.json' with { type: 'json' };
import { prismPixels, prismStrips } from '../src/lib/pigment/prism.ts';

const colors = palettes[0].colors;
const divisions = [.2, .4, .6, .8];
const baseline = { count: 11, shape: 'Crest', direction: 'Up', size: 100, height: 60,
  focus: 50, position: 50, blend: 65, facets: 35, motion: 'Expand', reverse: 'Normal' };
const pixel = (image: Uint8ClampedArray, width: number, x: number, y: number) => [...image.slice((y * width + x) * 4, (y * width + x + 1) * 4)];

test('Prism palettes contain the twenty current named colour sets', () => {
  assert.equal(palettes.length, 20);
  assert.equal(new Set(palettes.map(palette => palette.name)).size, 20);
  assert.equal(palettes[0].name, 'Ultraviolet');
  assert.equal(palettes.at(-1)!.name, 'Pink salt');
  assert.ok(palettes.every(palette => palette.colors.length === 5 && palette.colors.every(color => /^#[0-9A-F]{6}$/i.test(color))));
});

test('Prism slats cover the entire field in mirrored pairs, with an internal vertical gradient', () => {
  const strips = prismStrips(colors, divisions, baseline);
  assert.equal(strips[0].start, 0);
  assert.equal(strips.at(-1)!.end, 1);
  for (const [index, strip] of strips.entries()) {
    if (index) assert.ok(Math.abs(strip.start - strips[index - 1].end) < 1e-12);
    const mirror = strips[strips.length - index - 1];
    assert.ok(Math.abs(strip.start - (1 - mirror.end)) < 1e-12);
    assert.equal(strip.colors.length, 96);
    assert.deepEqual(strip.colors, mirror.colors);
    assert.notDeepEqual(strip.colors[0], strip.colors.at(-1));
  }
});

test('Prism direction rotates the same field without changing the design', () => {
  const width = 41, height = 29;
  const up = prismPixels(width, height, colors, divisions, baseline);
  const right = prismPixels(height, width, colors, divisions, { ...baseline, direction: 'Right' });
  const down = prismPixels(width, height, colors, divisions, { ...baseline, direction: 'Down' });
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    assert.deepEqual(pixel(up, width, x, y), pixel(right, height, height - y - 1, x));
    assert.deepEqual(pixel(up, width, x, y), pixel(down, width, width - x - 1, height - y - 1));
  }
});

test('Prism shapes, balance, reversal and each field parameter visibly change the rendered field', () => {
  const draw = (params: Record<string, number | string>, stops = divisions) => prismPixels(64, 48, colors, stops, params);
  const base = draw(baseline);
  for (const shape of ['Valley', 'Tide', 'Slant', 'Lens']) assert.notDeepEqual(base, draw({ ...baseline, shape }));
  for (const [key, value] of Object.entries({ count: 6, size: 160, height: 15, focus: 20, position: 20, blend: 10, facets: 90 })) {
    assert.notDeepEqual(base, draw({ ...baseline, [key]: value }), key);
  }
  assert.notDeepEqual(base, draw({ ...baseline, reverse: 'Reversed' }));
  assert.notDeepEqual(base, draw(baseline, [.1, .4, .7, .9]));
});

test('Prism breathing keeps slats stationary while expansion and gathering move them', () => {
  const positions = (motion: string, time: number) => prismStrips(colors, divisions, { ...baseline, motion }, time).map(strip => [strip.start, strip.end]);
  assert.deepEqual(positions('Breathe', 20.75), positions('Breathe', 24));
  assert.notDeepEqual(positions('Expand', 20.75), positions('Expand', 24));
  assert.notDeepEqual(positions('Gather', 20.75), positions('Gather', 24));
  const breathe = { ...baseline, motion: 'Breathe' };
  assert.notDeepEqual(prismPixels(48, 36, colors, divisions, breathe, 20.75), prismPixels(48, 36, colors, divisions, breathe, 24));
});
