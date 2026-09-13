import {test} from 'node:test';
import assert from 'node:assert/strict';
import {initialState} from '../src/lib/pigment/model.ts';
import {FIELD_TYPES,fieldsPixels} from '../src/lib/pigment/fields-exact.ts';
import {silkPixels,silkParameters,clothHeight,SILK_DEFAULTS} from '../src/lib/pigment/fields-silk.ts';
import {stillPixels,STILL_DEFAULTS,meshPixels,retroPixels,iosPixels} from '../src/lib/pigment/fields-static.ts';
import {auroraPixels,auroraColours,skyColours,directionQuarter} from '../src/lib/pigment/fields-sky.ts';
import {MESH_CENTERS,rgb,BASE_TIME} from '../src/lib/pigment/fields-colour.ts';
import {fieldShader} from '../src/lib/pigment/fields-gl.ts';

const colors=['#17264A','#EF5792','#68E6B6','#F4F4D4'],divs=[.25,.5,.75];
function difference(a:Uint8ClampedArray,b:Uint8ClampedArray):number {let delta=0;for(let i=0;i<a.length;i+=4)for(let j=0;j<3;j++)delta+=Math.abs(a[i+j]-b[i+j]);return delta/a.length*4/3;}

test('all seven reference fields remain finite, opaque and deterministic',()=>{
 for(const type of FIELD_TYPES){const s={...initialState(),type,colors,divisions:divs,params:{}},a=fieldsPixels(42,29,s),b=fieldsPixels(42,29,s);assert.deepEqual(a,b,type);assert.equal(a.length,42*29*4);assert.ok(a.every((v,i)=>i%4!==3||v===255),type);const reds=new Set(Array.from(a).filter((_,i)=>i%4===0));assert.ok(reds.size>4,type);}
});
test('Still uses its complete wave, phase, mixing, rotation and internal grain parameters',()=>{
 const baseline=stillPixels(43,29,colors,divs,STILL_DEFAULTS);
 for(const [key,value] of Object.entries({positions:76,waveX:20,waveXShift:5,waveY:0,waveYShift:80,mixing:15,grain:85,rotation:133})){const changed=stillPixels(43,29,colors,divs,{...STILL_DEFAULTS,[key]:value});assert.ok(difference(baseline,changed)>.05,key);}
});
test('Silk respects every geometry and lighting parameter, with seed preserved per preset',()=>{
 const baseline=silkPixels(37,29,colors,divs,SILK_DEFAULTS);
 const variants={angle:75,warp:0,streak:0,sheen:0,scale:85,light:-60,seed:51,thread:100,glow:0,folds:14,depth:0};
 for(const [key,value] of Object.entries(variants)){const changed=silkPixels(37,29,colors,divs,{...SILK_DEFAULTS,[key]:value});assert.ok(difference(baseline,changed)>.001,key);}
 assert.equal(silkParameters({seed:42},BASE_TIME).cloth.phase,42*1.618034);
 assert.equal(clothHeight(.2,.3,silkParameters({depth:0}).cloth),0);
});
test('Silk accepts saved UI aliases while keeping the original cloth model',()=>{
 const actual=silkPixels(24,20,colors,divs,{drape:83,tension:27,weave:12});
 const reference=silkPixels(24,20,colors,divs,{warp:83,streak:27,thread:12});assert.deepEqual(actual,reference);
});
test('Aurora and Sky assign darkest/deepest and brightest/rim roles by luminance',()=>{
 const shuffled=['#FFFFFF','#000000','#888888','#333333'];assert.deepEqual(auroraColours(shuffled).deep,[0,0,0]);assert.deepEqual(auroraColours(shuffled).rim,[1,1,1]);assert.deepEqual(skyColours(shuffled).low,[0,0,0]);assert.deepEqual(skyColours(shuffled).high,[1,1,1]);
 assert.deepEqual(auroraColours([...shuffled].reverse()),auroraColours(shuffled));assert.equal(directionQuarter({dir:3}),3);assert.equal(directionQuarter({direction:'Left'}),3);
});
test('Aurora keeps the distant sky dark and uses sparse curtains rather than a full-screen sinusoid',()=>{
 const p=auroraPixels(80,50,['#EAFFF4','#4BE8A0','#2E6E80','#16224D'],{});
 const night=rgb('#16224D');let close=0;
 for(let x=0;x<80;x++){const i=x*4;if(Math.max(...night.map((v,c)=>Math.abs(p[i+c]-v)))<8)close++;}
 assert.ok(close>50,'the upper sky must remain mostly night');
 assert.ok(difference(p,auroraPixels(80,50,['#EAFFF4','#4BE8A0','#2E6E80','#16224D'],{},BASE_TIME+5))>1);
});
test('Aurora direction rotates the whole scene rather than just changing the wave phase',()=>{
 const up=auroraPixels(40,40,colors,{}),down=auroraPixels(40,40,colors,{direction:'Down'});let total=0;
 for(let y=0;y<40;y++)for(let x=0;x<40;x++)for(let c=0;c<3;c++)total+=Math.abs(up[(y*40+x)*4+c]-down[((39-y)*40+39-x)*4+c]);assert.ok(total/(40*40*3)<.1);
});
test('Mesh spots are bounded opaque centres with independently movable radii',()=>{
 const red='#FF0000',blue='#0000FF',p=meshPixels(100,100,[red,blue],[.5],[[.2,.2],[.8,.8]]);
 assert.deepEqual(Array.from(p.slice((20*100+20)*4,(20*100+20)*4+3)),rgb(red));
 assert.deepEqual(Array.from(p.slice((80*100+80)*4,(80*100+80)*4+3)),rgb(blue));
 assert.equal(MESH_CENTERS[0][0],.16);
 assert.ok(difference(p,meshPixels(100,100,[red,blue],[.8],[[.2,.2],[.8,.8]]))>1);
});
test('Retro uses animated ink pools and iOS stays a non-animated diagonal ramp',()=>{
 const retro=retroPixels(50,30,colors,divs);assert.ok(difference(retro,retroPixels(50,30,colors,divs,BASE_TIME+3))>1);
 const ios=iosPixels(50,30,['#000000','#FFFFFF'],[.5]);assert.ok(ios[0]>0&&ios[0]<60,'top-left white sheen gently lifts the dark colour');const last=ios.length-4;assert.equal(ios[last],255);assert.ok(ios[(15*50+25)*4]>100);
});
test('GPU programs retain the original defining rendering features',()=>{
 assert.match(fieldShader('sky'),/cnoise\(vec3/);assert.match(fieldShader('sky'),/vec3 burn/);
 assert.match(fieldShader('aurora'),/u_dirv/);assert.match(fieldShader('aurora'),/starI/);assert.match(fieldShader('aurora'),/float beam = exp/);
 assert.match(fieldShader('silk'),/float cloth\(vec2 xy\)/);assert.match(fieldShader('silk'),/clearance/);assert.doesNotMatch(fieldShader('silk'),/\$\{/);
});
