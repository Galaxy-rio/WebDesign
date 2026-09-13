import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,Path2D as NativePath} from '@napi-rs/canvas';
import {createHash} from 'node:crypto';
import {initialState,defaultParams,type StudioState} from '../src/lib/pigment/model.ts';
import {blockLayers,honeycombLayout,paintNativeObjects,NATIVE_OBJECT_TYPES} from '../src/lib/pigment/native-objects.ts';
import {paintScenes,mistGeometry,mistSunColour,cityLayout,CITY_NAMES} from '../src/lib/pigment/scenes.ts';
import {mixReferenceColour} from '../src/lib/pigment/reference-fields.ts';
const canvasFactory=()=>createCanvas(1,1) as unknown as HTMLCanvasElement;
const pathFactory=(svg:string)=>new NativePath(svg) as unknown as Path2D;
function state(type:string,colors=['#101D47','#6475B9','#F2BAAA','#FFF7E1']):StudioState {return {...initialState(),type,colors,divisions:colors.slice(1).map((_,i)=>(i+1)/colors.length),params:defaultParams(type),grain:0,soften:0};}
function render(w:number,h:number,s:StudioState):Uint8ClampedArray {const canvas=createCanvas(w,h),ctx=canvas.getContext('2d') as unknown as CanvasRenderingContext2D;const painted=paintNativeObjects(ctx,w,h,s,canvasFactory)||paintScenes(ctx,w,h,s,pathFactory);assert.equal(painted,true);return ctx.getImageData(0,0,w,h).data;}
const digest=(p:Uint8ClampedArray)=>createHash('sha256').update(p).digest('hex');

test('native renderers draw opaque varied images in portrait and landscape with two or more colours',()=>{
 for(const type of [...NATIVE_OBJECT_TYPES,'mist','skyline'])for(const [w,h] of [[96,64],[64,96]])for(const colors of [['#192247','#EAEDFC'],['#101D47','#6475B9','#F2BAAA','#FFF7E1']]){
  const pixels=render(w,h,state(type,colors));assert.ok(pixels.every((v,i)=>i%4!==3||v===255),type+' '+w+'x'+h+' alpha');const unique=new Set<string>();for(let i=0;i<pixels.length;i+=4)unique.add(pixels.slice(i,i+3).join(','));assert.ok(unique.size>5,type+' variation');
 }
});
test('Blocks depth direction compares linear-light luminance, preserving intended nesting',()=>{
 const s=state('blocks',['#FF0000','#777777']);s.params.direction='In';const inward=blockLayers(s);assert.equal(inward.background,'#FF0000');assert.equal(inward.layers[0].color,'#777777');
 s.params.direction='Out';const outward=blockLayers(s);assert.equal(outward.background,'#777777');assert.equal(outward.layers[0].color,'#FF0000');
});
test('Blocks keeps offsets, unequal aspect and balanced bands for explicit layer counts',()=>{
 const s=state('blocks');s.params={...s.params,steps:7,width:20,height:80,focusX:20,focusY:80,x:60,y:40};s.divisions=[.08,.21,.8];const result=blockLayers(s);assert.equal(result.layers.length,7);assert.ok(result.layers.every(layer=>layer.width<layer.height&&/^#[a-f0-9]{6}$/i.test(layer.color)));assert.ok(result.layers[0].width>result.layers.at(-1)!.width);
});
test('Arch retains paper outside its half-ellipse and clips the reflected glow below its baseline',()=>{
 for(const [w,h] of [[200,120],[120,200]]){const s=state('arch',['#102847','#FF8B42']),pixels=render(w,h,s),pixel=(x:number,y:number)=>Array.from(pixels.slice((y*w+x)*4,(y*w+x)*4+3));
  assert.deepEqual(pixel(0,0),[247,244,236]);assert.deepEqual(pixel(w-1,0),[247,244,236]);assert.deepEqual(pixel(1,Math.floor(h*.3)),[247,244,236]);assert.notDeepEqual(pixel(Math.floor(w/2),Math.floor(h*.3)),[247,244,236]);assert.notDeepEqual(pixel(Math.floor(w/2),Math.floor(h*.64)),[247,244,236]);
 }
});
test('Beehive variants have the correct rotated lattice and Balls concavity changes the relief',()=>{
 const hive=state('beehive');hive.params={scale:50,style:'Hive'};const h=honeycombLayout(hive);assert.equal(h.r,7);assert.equal(h.mosaic,false);
 const mosaic={...hive,params:{scale:50,style:'Mosaic'}},m=honeycombLayout(mosaic);assert.equal(m.mosaic,true);assert.notDeepEqual(h.tiles.map(t=>[t.x,t.y]),m.tiles.map(t=>[t.x,t.y]));assert.notEqual(digest(render(160,100,hive)),digest(render(160,100,mosaic)));
 const balls=state('balls');balls.params={scale:18,style:'Convex'};assert.notEqual(digest(render(160,100,balls)),digest(render(160,100,{...balls,params:{scale:18,style:'Concave'}})));
});
test('Mist lights its sun from the true brightest colour and gives fractional layers a soft entry',()=>{
 assert.equal(mistSunColour(['#777777','#FF0000']),mixReferenceColour('#FF0000','#F7F4EE',.72));
 const g=mistGeometry(300,200,{scale:55,horizon:42});assert.equal(g.ridges.length,7);assert.ok(Math.abs(g.ridges.at(-1)!.opacity-.3)<1e-10);assert.equal(g.sun.x,192);assert.equal(g.sun.y,62);assert.equal(g.ridges[0].points.length,111);
 const two=render(96,140,state('mist',['#273F69','#ECDBED']));assert.equal(two.length,96*140*4);
});
test('all city paths draw with stable baselines and distinct silhouettes at both aspect ratios',()=>{
 for(const [w,h] of [[200,120],[120,200]]){const signatures=new Set<string>();for(const name of CITY_NAMES){const layout=cityLayout(w,h,name);assert.ok(layout.scale>0&&layout.y>=h*.3);assert.ok(layout.city.layers.length>0);const s=state('skyline',['#DDDCDF','#363C62']);s.params.city=name;signatures.add(digest(render(w,h,s)));}assert.equal(signatures.size,CITY_NAMES.length);}
});
