import test from 'node:test';
import assert from 'node:assert/strict';
import { FORM_SHAPES, FORM_PRESETS, FORM_PALETTES, formsPixels, formPolygons } from '../src/lib/pigment/forms.ts';

test('Forms retains all thirty-five vector outlines and thirty-one designed compositions', () => {
  assert.equal(FORM_SHAPES.length, 35); assert.equal(FORM_PRESETS.length, 31); assert.equal(FORM_PALETTES.length, 12);
  assert.equal(FORM_PRESETS[0].name, 'Room to rise'); assert.equal(FORM_PRESETS[0].params.shape, 'soft-arch');
  assert.equal(FORM_PRESETS[1].name, 'Celtics');
});
test('Every Forms preset draws distinct, deterministic opaque pixels', () => {
  const signatures = new Set<string>();
  for (const preset of FORM_PRESETS) {
    const pixels = formsPixels(64,80,preset); signatures.add(Buffer.from(pixels).toString('base64'));
    assert.deepEqual(formsPixels(64,80,preset),pixels);
    for(let i=3;i<pixels.length;i+=4)assert.equal(pixels[i],255);
  }
  assert.equal(signatures.size,31);
});
test('Vector ring holes remain open and are not replaced by solid discs', () => {
  const state={colors:['#FFFFFF','#0055FF','#002255'],params:{shape:'clean-ring',x:50,y:50,size:75,rotate:0,fade:0,stretchX:100,stretchY:100,skew:0,bloom:0},soften:0};
  assert.equal(formPolygons(state.params,100,100).length,2);
  const pixels=formsPixels(100,100,state);assert.deepEqual(Array.from(pixels.slice((50*100+50)*4,(50*100+50)*4+4)),[255,255,255,255]);
  assert.ok(pixels[(50*100+80)*4]<100);
});
test('Forms position, stretch, skew, fade and bloom remain independently editable', () => {
  const base=FORM_PRESETS[2],pixels=formsPixels(80,100,base);
  for(const [key,value] of Object.entries({x:60,y:60,size:85,rotate:60,fade:10,stretchX:60,stretchY:150,skew:35,bloom:0})) {
    const changed={...base,params:{...base.params,[key]:value}};
    assert.notDeepEqual(formsPixels(80,100,changed),pixels,key);
  }
});
