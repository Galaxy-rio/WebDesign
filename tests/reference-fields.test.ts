import test from 'node:test';
import assert from 'node:assert/strict';
import { referenceFlowPixels, referenceStripePixels, referenceWaveLayers, referenceWavePixels } from '../src/lib/pigment/reference-fields.ts';

function pixel(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  return [...pixels.slice(index, index + 4)];
}

test('Stripes angle zero makes horizontal bands and 90 degrees makes vertical bands', () => {
  const colors = ['#FF0000', '#0000FF'], divisions = [.5];
  const horizontal = referenceStripePixels(8, 8, colors, divisions, { angle: 0, softness: 0, wave: 0 });
  assert.deepEqual(pixel(horizontal, 8, 0, 1), [255, 0, 0, 255]);
  assert.deepEqual(pixel(horizontal, 8, 7, 1), [255, 0, 0, 255]);
  assert.deepEqual(pixel(horizontal, 8, 0, 6), [0, 0, 255, 255]);
  const vertical = referenceStripePixels(8, 8, colors, divisions, { angle: 90, softness: 0, wave: 0 });
  assert.deepEqual(pixel(vertical, 8, 1, 0), [255, 0, 0, 255]);
  assert.deepEqual(pixel(vertical, 8, 1, 7), [255, 0, 0, 255]);
  assert.deepEqual(pixel(vertical, 8, 6, 0), [0, 0, 255, 255]);
});

test('Stripes preserve the band boundaries and interpolate softened edges in Oklab', () => {
  const colors = ['#FF0000', '#0000FF'];
  const shifted = referenceStripePixels(3, 100, colors, [.2], { angle: 0, softness: 0, wave: 0 });
  assert.deepEqual(pixel(shifted, 3, 1, 19), [255, 0, 0, 255]);
  assert.deepEqual(pixel(shifted, 3, 1, 20), [0, 0, 255, 255]);
  const midpoint = referenceStripePixels(1, 1, colors, [.5], { angle: 0, softness: 40, wave: 0 });
  // Oklab red/blue midpoint is a lighter violet than a simple sRGB average.
  assert.deepEqual(pixel(midpoint, 1, 0, 0), [140, 83, 162, 255]);
  const noWave = { angle: 0, softness: 14, wave: 0 };
  assert.deepEqual(referenceStripePixels(16, 16, colors, [.5], noWave, 10), referenceStripePixels(16, 16, colors, [.5], noWave, 20));
  assert.notDeepEqual(referenceStripePixels(16, 16, colors, [.5], { ...noWave, wave: 30 }, 10), referenceStripePixels(16, 16, colors, [.5], { ...noWave, wave: 30 }, 20));
});

test('Full-quality Flow uses Oklab at equal influence and honors a pinned colour location', () => {
  const params = { scale: 50, distortion: 0, swirl: 0 };
  const blend = referenceFlowPixels(1, 1, ['#FF0000', '#0000FF'], params, 20.75, [[0, .5], [1, .5]], [1, 1]);
  assert.deepEqual(pixel(blend, 1, 0, 0), [140, 83, 162, 255]);
  const weighted = referenceFlowPixels(1, 1, ['#FF0000', '#0000FF'], params, 20.75, [[0, .5], [1, .5]], [4, 1]);
  assert.ok(weighted[0] > blend[0] && weighted[2] < blend[2]);
  const pinned = referenceFlowPixels(3, 3, ['#FF0000', '#0000FF'], params, 20.75, [[.5, .5], [1, 1]]);
  assert.ok(pinned[(1 * 3 + 1) * 4] > 250);
  // At a grey blend, Oklab lightness is the cube root of linear RGB. This
  // independently checks the distance exponent, not just the colour space.
  const distanceBlend = referenceFlowPixels(1, 1, ['#000000', '#FFFFFF'], params, 20.75, [[0, .5], [1.2, .5]]);
  const lightness = (.5 ** 3.5 + .0001) / (.5 ** 3.5 + .7 ** 3.5 + .0002);
  const linear = lightness ** 3;
  const expected = Math.round((linear <= .0031308 ? linear * 12.92 : 1.055 * linear ** (1 / 2.4) - .055) * 255);
  assert.deepEqual(pixel(distanceBlend, 1, 0, 0), [expected, expected, expected, 255]);
});

test('Waves have one static shaded layer per colour, with boundary-controlled height', () => {
  const colors = ['#EAF4FC', '#A0D8EF', '#007BBB', '#274A78'];
  const divisions = [.22, .42, .72];
  const layers = referenceWaveLayers(colors, divisions);
  assert.equal(layers.length, colors.length);
  assert.deepEqual(layers.map(layer => layer.top), [0, ...divisions]);
  assert.deepEqual(layers.map(layer => layer.bottom), [...divisions, 1]);
  assert.equal(layers[0].path.length, 0);
  for (const [index, layer] of layers.entries()) {
    assert.equal(layer.colors[1], colors[index]);
    assert.notEqual(layer.colors[0], layer.colors[1]);
    assert.notEqual(layer.colors[1], layer.colors[2]);
    if (!index) continue;
    assert.ok(layer.path[0][0] < 0 && layer.path.at(-1)![0] > 1, 'curve extends beyond the canvas to avoid an exposed edge');
    assert.ok(layer.path.every(([, y]) => Math.abs(y - layer.top) < .055));
  }
  const moved = referenceWaveLayers(colors, [.22, .52, .72]);
  assert.deepEqual(moved[1].path, layers[1].path);
  assert.deepEqual(moved[3].path, layers[3].path);
  for (const [index, point] of moved[2].path.entries()) {
    assert.ok(Math.abs(point[1] - layers[2].path[index][1] - .1) < 1e-12);
  }
});

test('Waves pixels preserve shading within a layer and stay fully opaque', () => {
  const image = referenceWavePixels(80, 120, ['#808080', '#808080'], [.5]);
  // The first band fades from a lightened grey through its selected colour.
  assert.ok(pixel(image, 80, 40, 4)[0] > pixel(image, 80, 40, 30)[0] + 15);
  // Repeated palette colours still form independently shaded layers.
  assert.ok(pixel(image, 80, 40, 67)[0] > pixel(image, 80, 40, 93)[0]);
  assert.ok(image.every((value, index) => index % 4 !== 3 || value === 255));
});

test('Waves pixels follow the selected colour count and movable division boundaries', () => {
  const colors = ['#FF0000', '#00FF00', '#0000FF'];
  const width = 64, height = 120;
  const image = referenceWavePixels(width, height, colors, [1 / 3, 2 / 3]);
  const dominant = (y: number) => {
    const channels = pixel(image, width, 32, y).slice(0, 3);
    return channels.indexOf(Math.max(...channels));
  };
  assert.equal(dominant(15), 0);
  assert.equal(dominant(60), 1);
  assert.equal(dominant(105), 2);
  const fewerLayers = referenceWavePixels(width, height, [colors[0], colors[2]], [.5]);
  assert.ok(pixel(image, width, 32, 60)[1] > pixel(fewerLayers, width, 32, 60)[1] + 80);
  const moved = referenceWavePixels(width, height, colors, [.55, .8]);
  assert.notDeepEqual(image, moved);
  assert.ok(pixel(moved, width, 32, 49)[0] > pixel(image, width, 32, 49)[0] + 80);
  assert.deepEqual(image, referenceWavePixels(width, height, colors, [1 / 3, 2 / 3]));
});
