import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, applyPreset, defaultParams, initialState, normalizeState } from '../src/lib/pigment/model.ts';
import { gradientPixels, rgb } from '../src/lib/pigment/renderer.ts';

const soundwave = () => applyPreset(initialState(), PRESETS.find(p => p.type === 'bars' && p.name === 'Soundwave')!);
const sample = (pixels: Uint8ClampedArray, width: number, x: number, y: number) =>
  Array.from(pixels.slice((y * width + x) * 4, (y * width + x) * 4 + 3));

test('bar presets retain their overlap and original default envelope', () => {
  assert.deepEqual(defaultParams('bars'), { count: 7, gap: -20, envelope: 'Ramp' });
  assert.deepEqual(defaultParams('columns'), { count: 18, gap: -20, envelope: 'Ramp' });
  for (const preset of PRESETS.filter(p => p.type === 'bars' || p.type === 'columns')) {
    assert.equal(applyPreset(initialState(), preset).params.gap, -20, preset.name);
  }
  assert.equal(normalizeState({ ...soundwave(), params: { ...soundwave().params, envelope: 'Smooth' } }).params.envelope, 'Curve');
});

test('Soundwave has seven ascending steps at the initial animation phase', () => {
  const state = soundwave(), width = 700, height = 1000;
  const pixels = gradientPixels(width, height, state), background = rgb(state.colors[0]);
  const upperEdges = Array.from({ length: 7 }, (_, bar) => {
    const x = bar * 100 + 50;
    for (let y = 0; y < height; y++) {
      if (sample(pixels, width, x, y).some((channel, i) => channel !== background[i])) return y;
    }
    return height;
  });
  // Reference geometry at time 20.75, before animation advances.
  assert.deepEqual(upperEdges, [854, 738, 620, 469, 326, 190, 46]);
});

test('negative spread joins the staircase while positive spread opens gaps', () => {
  const state = soundwave(), width = 700, height = 300, background = rgb(state.colors[0]);
  const joined = gradientPixels(width, height, state);
  for (let x = 0; x < width; x++) {
    assert.notDeepEqual(sample(joined, width, x, height - 1), background, 'Continuous bottom edge at x=' + x);
  }
  const separated = gradientPixels(width, height, { ...state, params: { ...state.params, gap: 20 } });
  for (let bar = 1; bar < 7; bar++) assert.deepEqual(sample(separated, width, bar * 100, height - 1), background);
});

test('each strip contains a vertical colour gradient and Columns keeps that orientation', () => {
  const state = soundwave(), width = 700, height = 400, pixels = gradientPixels(width, height, state);
  for (let bar = 0; bar < 7; bar++) {
    const x = bar * 100 + 50, bottom = sample(pixels, width, x, height - 1);
    assert.ok(bottom[1] > 210 && bottom[2] > 170, 'Each bar reaches the mint end of the palette.');
    const verticalColours = new Set<string>();
    for (let y = 0; y < height; y++) verticalColours.add(sample(pixels, width, x, y).join(','));
    assert.ok(verticalColours.size > 30, 'Bar ' + bar + ' needs a continuous internal gradient.');
  }
  assert.deepEqual(gradientPixels(width, height, { ...state, type: 'columns' }), pixels,
    'Columns differs in density, not a 90-degree rotation.');
});

test('bar colour balance and animation time affect the intended independent dimensions', () => {
  const state = soundwave(), base = gradientPixels(140,100,state);
  assert.notDeepEqual(gradientPixels(140,100,{ ...state, divisions:[.02,.07,.16,.5,.8] }),base);
  assert.notDeepEqual(gradientPixels(140,100,state,state.time + 2),base);
  assert.deepEqual(gradientPixels(140,100,{ ...state,speed:0 }),base,
    'Speed controls the clock; pausing must preserve the current frame.');
  const curve = gradientPixels(140,100,{...state,params:{...state.params,envelope:'Curve'}});
  const flat = gradientPixels(140,100,{...state,params:{...state.params,envelope:'Flat'}});
  assert.notDeepEqual(curve,base);
  assert.notDeepEqual(flat,base);
});
