import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { glassyLens, pixelGrid, texturePixels } from '../src/lib/pigment/native-textures.ts';
import type { StudioState } from '../src/lib/pigment/model.ts';

function design(type: 'pixel' | 'glassy', params: Record<string, string | number>): StudioState {
  return { version: 1, type, name: 'Texture regression', colors: ['#7A1FD9', '#9D4BEA', '#C77FF2', '#E7C9FA', '#F5F2F8'],
    divisions: [.2, .4, .6, .8], points: [], params, time: 20.75, speed: 30, soften: 0, grain: 0,
    frame: 'free', seed: 42, texts: [], image: null };
}
const hash = (state: StudioState, time = state.time) => createHash('sha256').update(texturePixels(96, 72, state, time)).digest('hex');

test('Pixel styles keep distinct geometry, with stable stills and animated frames', () => {
  const styles = [design('pixel', { style: 'Quilt', scale: 40, rings: 12, weave: 20 }),
    design('pixel', { style: 'Orbs', scale: 50, cover: 4, rings: 100, weave: 45 }),
    design('pixel', { style: 'Glass', scale: 40, cover: 55 })];
  assert.equal(new Set(styles.map(state => hash(state))).size, 3);
  for (const state of styles) {
    assert.equal(hash(state), hash(state));
    assert.notEqual(hash(state), hash(state, 22));
  }
});

test('Quilt renders flat cell interiors rather than shaded spheres', () => {
  const state = design('pixel', { style: 'Quilt', scale: 40, rings: 12, weave: 20 });
  const width = 312, height = 240, pixels = texturePixels(width, height, state), grid = pixelGrid(width, height, 40, 'Quilt');
  const at = (x: number, y: number) => pixels.slice((Math.floor(y) * width + Math.floor(x)) * 4, (Math.floor(y) * width + Math.floor(x)) * 4 + 3);
  for (let row = 1; row < grid.rows - 1; row++) for (let col = 1; col < grid.cols - 1; col++) {
    assert.deepEqual(at((col + .3) * grid.cw, (row + .3) * grid.ch), at((col + .7) * grid.cw, (row + .7) * grid.ch));
  }
});

test('Glassy camera preserves the centre and never folds or collapses tiles', () => {
  for (const warp of [-100, -45, 0, 45, 100]) {
    const center = glassyLens(450, 300, 900, 600, warp);
    assert.equal(center.x, 450); assert.equal(center.y, 300);
    for (const [x, y] of [[0, 0], [100, 550], [890, 590], [400, 120]]) {
      const lens = glassyLens(x, y, 900, 600, warp);
      assert.ok(Object.values(lens).every(Number.isFinite));
      assert.ok(lens.a * lens.d - lens.b * lens.c > 0, 'The camera transform must preserve orientation.');
    }
  }
  assert.deepEqual(glassyLens(230, 370, 900, 600, 0), { x: 230, y: 370, a: 1, b: 0, c: 0, d: 1 });
});

test('Glassy tile shape, refraction, frost and camera alter the same colour field independently', () => {
  const state = design('glassy', { shape: 'Square', scale: 45, cover: 100, rings: 50, weave: 50, refract: 50, warp: 0 });
  const baseline = hash(state);
  const changes: Record<string, string | number>[] = [{ shape: 'Heart' }, { refract: 100 }, { weave: 100 }, { warp: 75 }, { cover: 45 }, { rings: 90 }];
  for (const change of changes) {
    assert.notEqual(hash({ ...state, params: { ...state.params, ...change } }), baseline);
  }
  assert.notEqual(hash(state, 22), baseline);
});
