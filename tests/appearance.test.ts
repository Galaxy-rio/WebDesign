import test from 'node:test';
import assert from 'node:assert/strict';
import { balanceGradient, backdropColours } from '../src/lib/pigment/appearance.ts';

test('colour bands blend through their midpoints and follow the draggable proportions', () => {
  assert.equal(balanceGradient(['#000000', '#FFFFFF'], [.5]), 'linear-gradient(90deg in oklab, #000000 25%, #FFFFFF 75%)');
  assert.equal(balanceGradient(['#000000', '#FFFFFF'], [.2]), 'linear-gradient(90deg in oklab, #000000 10%, #FFFFFF 60%)');
});

test('the static backdrop preserves palette endpoints and responds to colour balance', () => {
  const colors = ['#EAF4FC', '#1E50A2', '#F09199', '#895B8A'];
  const first = backdropColours(colors, [.25, .5, .75]);
  assert.equal(first.length, 6);
  assert.equal(first[0], '#eaf4fc');
  assert.equal(first.at(-1), '#895b8a');
  assert.deepEqual(backdropColours(colors, [.25, .5, .75]), first);
  assert.notDeepEqual(backdropColours(colors, [.1, .2, .9]), first);
});
