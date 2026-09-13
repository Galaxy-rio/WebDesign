import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TYPES, PRESETS, initialState, applyPreset, defaultParams, normalizeState, encodeDesign, decodeDesign, contrastRatio, defaultPoints, controlPoints, equalDivisions } from '../src/lib/pigment/model.ts';
import { gradientPixels, paintGradient } from '../src/lib/pigment/renderer.ts';
import { DesignStore, loadDraft, loadSaved, DRAFT_KEY, SAVED_KEY } from '../src/lib/pigment/store.ts';
import { cssFor } from '../src/lib/pigment/export.ts';
import { installCanvasEnvironment } from './canvas-environment.ts';
installCanvasEnvironment();
const digest=(data:Uint8ClampedArray)=>createHash('sha256').update(data).digest('hex');
const withoutIDs=(state:ReturnType<typeof initialState>)=>({...state,texts:state.texts.map(({id,...text})=>text)});

test('shared designs round-trip Unicode text, colours, field settings and animation time',()=>{
 const state=initialState();state.name='颜料 / Pigment 🌈';state.texts[0].content='春の色\nA little colour.';state.params.distortion=83;state.speed=0;state.time=42.6;state.divisions=[.1,.28,.73];state.points=[[.1,.2],[.4,.5],[.8,.3],[.7,.9]];
 assert.deepEqual(withoutIDs(decodeDesign(encodeDesign(state))),withoutIDs(state));
});
test('import rejects invalid types, unsafe colours and hostile payload sizes',()=>{
 const state=initialState();assert.throws(()=>normalizeState({...state,type:'not-a-gradient'}));assert.throws(()=>normalizeState({...state,colors:['red','url(javascript:alert(1))']}));assert.throws(()=>decodeDesign('a'.repeat(49000)));assert.throws(()=>decodeDesign('not-valid-json'));
 const normalized=normalizeState({...state,params:{scale:Infinity,distortion:-20,swirl:500},speed:900,image:{src:'https://untrusted.test/image.png'},frame:'invalid'});assert.equal(normalized.params.scale,50);assert.equal(normalized.params.distortion,0);assert.equal(normalized.params.swirl,100);assert.equal(normalized.speed,100);assert.equal(normalized.image,null);assert.equal(normalized.frame,'free');
});
test('bad colour divisions recover without crossing or losing any colour',()=>{
 const state=normalizeState({...initialState(),divisions:[.7,.2,.1]});assert.deepEqual(state.divisions,equalDivisions(4));assert.equal(defaultPoints(8).length,8);
});
test('all curated presets are usable, bounded designs',()=>{
 for(const preset of PRESETS){const state=applyPreset(initialState(),preset);assert.doesNotThrow(()=>normalizeState(state),preset.name);assert.ok(TYPES.some(t=>t.id===state.type),preset.name);}
});
test('every gradient type produces a deterministic, opaque and nonempty colour field',()=>{
 const signatures=new Set<string>();
 for(const type of TYPES){const state={...initialState(),type:type.id,params:defaultParams(type.id)};const a=gradientPixels(56,40,state),b=gradientPixels(56,40,state);assert.deepEqual(a,b,type.name+' determinism');assert.equal(a.length,56*40*4);const colors=new Set<string>();for(let i=0;i<a.length;i+=4){assert.equal(a[i+3],255,type.name+' alpha');colors.add(`${a[i]},${a[i+1]},${a[i+2]}`);}assert.ok(colors.size>4,type.name+' should contain colour variation');signatures.add(digest(a));}
 assert.equal(signatures.size,TYPES.length,'Each visible type must have its own rendering.');
});
test('all animated types change with time',()=>{
 for(const type of TYPES.filter(t=>t.animated)){const params=defaultParams(type.id);if(type.id==='lines')params.sway=30;const state={...initialState(),type:type.id,params};assert.notEqual(digest(gradientPixels(48,32,state,20.75)),digest(gradientPixels(48,32,state,23.75)),type.name+' motion');}
});
test('every numeric inspector parameter has a visible effect',()=>{
 const inactive:string[]=[];
 for(const type of TYPES){for(const param of type.parameters){if(type.id==='pixel'&&param.key==='cover')continue;const base={...initialState(),type:type.id,params:defaultParams(type.id)},low={...base,params:{...base.params,[param.key]:param.min}},high={...base,params:{...base.params,[param.key]:param.unit==='°'||param.key.endsWith('Shift')?param.min+(param.max-param.min)*.37:param.max}};if(digest(gradientPixels(48,32,low,23.75))===digest(gradientPixels(48,32,high,23.75)))inactive.push(`${type.name}: ${param.label}`);}}
 assert.deepEqual(inactive,[]);
});
test('colour balance and point dragging affect the Flow renderer',()=>{
 const state=initialState(),base=digest(gradientPixels(48,32,state));assert.notEqual(digest(gradientPixels(48,32,{...state,divisions:[.05,.1,.9]})),base);assert.notEqual(digest(gradientPixels(48,32,{...state,points:[[.2,.2],[.8,.2],[.8,.8],[.2,.8]]})),base);
});
test('legacy Glow drafts upgrade their placeholder shape while preserving text and uploaded layers',()=>{
 const original={...initialState(),type:'glow',params:{shape:'Orb',size:65,width:36,intensity:80,angle:90,sway:20},image:{src:'data:image/png;base64,AAAA',name:'Kept image',x:20,y:25,width:12,rotation:0,opacity:100,radius:50,blend:'normal',brightness:100,contrast:100,blur:0,aspect:1}};
 const upgraded=normalizeState(original);assert.equal(upgraded.params.arrangement,'Edge');assert.equal(upgraded.params.width,100);assert.equal(upgraded.speed,0);assert.equal(upgraded.texts[0].content,original.texts[0].content);assert.equal(upgraded.image?.src,original.image.src);
 assert.deepEqual(withoutIDs(normalizeState(upgraded)),withoutIDs(upgraded),'Migration only runs once.');
});
test('texture and scene presets retain their original style-specific settings',()=>{
 const choose=(type:string,name:string)=>applyPreset(initialState(),PRESETS.find(p=>p.type===type&&p.name===name)!);
 assert.equal(choose('beehive','Lapis chamber').params.style,'Mosaic');assert.equal(choose('balls','Aqua drive').params.style,'Concave');assert.equal(choose('skyline','Paris').params.city,'Paris');assert.equal(choose('blocks','Club flyer').params.direction,'Out');assert.equal(choose('mist','Blue hour').params.seed,21);assert.equal(choose('silk','Ocean').params.seed,42);
 for(const p of PRESETS.filter(p=>p.type==='pixel'&&p.params.style==='Orbs')){const state=applyPreset(initialState(),p);assert.equal(state.params.rings,p.params.rings??100);assert.equal(state.params.cover,p.params.cover??4);}
});
test('softening and grain leave every exported edge opaque',()=>{
 for(const type of ['balls','flow','glow','arch','noise']){
  const state={...applyPreset(initialState(),PRESETS.find(p=>p.type===type)!),soften:80,grain:30};const canvas=document.createElement('canvas');canvas.width=128;canvas.height=80;const context=canvas.getContext('2d')!;paintGradient(context,128,80,state,state.time,'export');const data=context.getImageData(0,0,128,80).data;
  assert.ok(data.every((v,i)=>i%4!==3||v===255),type+' edges');
 }
});

test('Flow control points preserve the initial field at different scales',()=>{
 for(const scale of [0,25,50,75,100]){
  const state={...initialState(),params:{...defaultParams('flow'),scale}};
  const anchored=normalizeState({...state,points:controlPoints(state)});
  const original=gradientPixels(48,32,state),pinned=gradientPixels(48,32,anchored);
  assert.ok(original.every((value,i)=>Math.abs(value-pinned[i])<=1),'Scale '+scale+' should not jump when anchors become editable.');
 }
});

test('CSS preserves colour interpolation and uses raster fallback for finishing effects',()=>{
 const state={...initialState(),type:'linear',params:defaultParams('linear'),grain:0};
 const css=cssFor(state,1.6)!;
 assert.ok(css.startsWith('background: linear-gradient(180deg,'));
 assert.ok(css.includes('#EAF4FC 12.50%'));
 assert.ok(css.includes('#895b8a 87.50%'));
 assert.equal(cssFor({...state,grain:20}),null);
 assert.equal(cssFor({...state,soften:10}),null);
 const radial=cssFor({...state,type:'radial',params:{x:25,y:70,radius:70}},1.6)!;
 assert.match(radial,/ellipse 43\.74999999999999% 70%|ellipse 43\.75% 70%/);
 assert.ok(radial.includes('at 25% 70%'));
});
test('a continuous slider gesture is one undo step; a subsequent edit clears redo',()=>{
 const store=new DesignStore();const start=structuredClone(store.state);for(let value=51;value<=80;value++)store.update(s=>{s.params.scale=value;},'scale');assert.equal(store.state.params.scale,80);store.undo();assert.deepEqual(store.state,start);assert.equal(store.canUndo,false);store.redo();assert.equal(store.state.params.scale,80);store.undo();store.update({speed:0});assert.equal(store.canRedo,false);assert.equal(store.state.speed,0);
});
test('corrupt browser storage does not prevent opening the editor',()=>{
 const storage={getItem:()=>'{invalid json'};assert.equal(loadDraft(storage),null);assert.deepEqual(loadSaved(storage),[]);
 const draft=initialState(),valid={getItem:(key:string)=>key===DRAFT_KEY?JSON.stringify(draft):key===SAVED_KEY?JSON.stringify([{id:'1',name:'Kept',date:'2026-09-13',state:draft,thumbnail:''},{id:'2',state:{}}]):null};assert.equal(loadDraft(valid)?.name,draft.name);assert.equal(loadSaved(valid).length,1);
});
test('contrast ratios use relative luminance',()=>{assert.equal(contrastRatio('#FFFFFF','#000000'),21);assert.equal(contrastRatio('#1E50A2','#1E50A2'),1);assert.ok(contrastRatio('#EAF4FC','#25212C')>7);});
