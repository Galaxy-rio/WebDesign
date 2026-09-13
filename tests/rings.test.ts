import test from 'node:test';
import assert from 'node:assert/strict';
import { PRESETS, applyPreset, defaultParams, initialState, normalizeState } from '../src/lib/pigment/model.ts';
import { ringGeometry } from '../src/lib/pigment/rings.ts';
import { gradientPixels } from '../src/lib/pigment/renderer.ts';

const ripple=()=>applyPreset(initialState(),PRESETS.find(p=>p.type==='rings'&&p.name==='Ripple')!);

test('Rings retain preset origins including positions outside the canvas',()=>{
 const state=ripple(),g=ringGeometry(1000,500,state);
 assert.ok(Math.abs(g.x+463.93)<1e-8);
 assert.ok(Math.abs(g.y+11.8375)<1e-8);
 const plum=applyPreset(state,PRESETS.find(p=>p.type==='rings'&&p.name==='Plum rings')!);
 assert.equal(plum.params.dirX,.5);assert.equal(plum.params.dirY,.5);
 assert.equal(ringGeometry(1000,500,plum).x,500);
 assert.equal(ringGeometry(1000,500,plum).y,250);
 const sun=applyPreset(state,PRESETS.find(p=>p.type==='rings'&&p.name==='Sun rings')!);
 assert.ok(ringGeometry(1000,500,sun).y>500);
 const deep=applyPreset(state,PRESETS.find(p=>p.type==='rings'&&p.name==='Deep swell')!);
 assert.equal(normalizeState(deep).params.dirX,.12);
 assert.equal(normalizeState(deep).params.dirY,.12);
});

test('Melt changes layer blur without distorting the circular geometry',()=>{
 const state=ripple(),crisp=ringGeometry(800,600,{...state,params:{...state.params,melt:0}});
 const soft=ringGeometry(800,600,{...state,params:{...state.params,melt:100}});
 assert.deepEqual(soft.radii,crisp.radii);
 assert.equal(crisp.blur,0);
 assert.equal(soft.blur,soft.spacing*.55);
 assert.equal(defaultParams('rings').count,12);
 assert.equal(normalizeState({...state,params:{...state.params,count:99}}).params.count,24);
});

test('unlit centered Rings remain radially symmetric',()=>{
 const state={...ripple(),params:{...defaultParams('rings'),dirX:.5,dirY:.5,glow:0,sweep:0}},width=80;
 const pixels=gradientPixels(width,width,state);
 for(let y=0;y<width;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
  assert.equal(pixels[(y*width+x)*4+c],pixels[(x*width+y)*4+c]);
 }
});

test('Melt softens disc transitions while Glow and Sweep add distinct lighting',()=>{
 const state={...ripple(),params:{...defaultParams('rings'),dirX:.5,dirY:.5,glow:0,sweep:0}},width=100;
 const crisp=gradientPixels(width,width,state),soft=gradientPixels(width,width,{...state,params:{...state.params,melt:100}});
 const maxStep=(pixels:Uint8ClampedArray)=>{let max=0;for(let x=51;x<99;x++){let d=0;for(let c=0;c<3;c++)d+=Math.abs(pixels[(50*width+x)*4+c]-pixels[(50*width+x-1)*4+c]);max=Math.max(max,d);}return max;};
 assert.ok(maxStep(soft)<maxStep(crisp),'Melt should smooth the tonal boundaries.');
 const glow=gradientPixels(width,width,{...state,params:{...state.params,glow:100}});
 const sweep=gradientPixels(width,width,{...state,params:{...state.params,sweep:100}});
 assert.notDeepEqual(glow,crisp);assert.notDeepEqual(sweep,crisp);assert.notDeepEqual(glow,sweep);
});
