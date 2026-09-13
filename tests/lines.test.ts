import test from 'node:test';
import assert from 'node:assert/strict';
import { LINE_ARRANGEMENTS, LINE_PALETTES, LINE_DEFAULTS, linesPixels, lineShapes } from '../src/lib/pigment/lines.ts';
import { glowPath } from '../src/lib/pigment/glow.ts';

const state = (arrangement = 'Snake') => ({ colors: LINE_PALETTES[0].colors, divisions: [.2,.4,.6,.8], params: { ...LINE_DEFAULTS, arrangement } });
test('Lines preserves the eight reference layouts and independent colour palettes', () => {
  assert.deepEqual(LINE_ARRANGEMENTS.map(layout => layout.name), ['Snake','Drops','Loops','Ribbon','Doodle','Wander','Waves','Echo']);
  assert.equal(LINE_PALETTES.length, 19);
  assert.equal(lineShapes(state('Drops').params).length, 11);
  assert.equal(lineShapes(state('Waves').params).length, 5);
});
test('Line arrangements contain distinct seeded paths with opaque outputs', () => {
  const signatures = new Set<string>();
  for (const layout of LINE_ARRANGEMENTS) {
    const pixels = linesPixels(80, 100, state(layout.name));
    for (let i=3;i<pixels.length;i+=4) assert.equal(pixels[i],255);
    signatures.add(Buffer.from(pixels).toString('base64'));
    assert.deepEqual(linesPixels(80,100,state(layout.name)),pixels);
  }
  assert.equal(signatures.size,8);
});
test('Reference Snake consists of four horizontal passes rather than a generic sine', () => {
  const shape = lineShapes(state().params)[0];
  assert.equal(shape.form,'snake'); assert.equal(shape.turns,3); assert.equal(shape.width,100);
  const path = glowPath(shape,160,200);
  assert.ok(Math.max(...path.map(p=>p[1]))-Math.min(...path.map(p=>p[1]))>160);
});
test('Lines body, thickness, curl, scale, amplitude, angle, and sway affect rendering', () => {
  const baseline=linesPixels(80,100,state());
  for(const [key,value] of Object.entries({body:100,width:50,curl:40,size:65,amplitude:40,angle:90})) {
    const changed=state(); changed.params[key as 'size']=value;
    assert.notDeepEqual(linesPixels(80,100,changed),baseline,key);
  }
  const moving=state();moving.params.sway=40;
  assert.notDeepEqual(linesPixels(80,100,moving,20.75),linesPixels(80,100,moving,23));
});
