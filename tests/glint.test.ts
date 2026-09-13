import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from '@napi-rs/canvas';
import {glintParticles,glintRidges,glintWeavePixels,glintPixels,paintGlint,type CanvasFactory} from '../src/lib/pigment/scenes-glint.ts';
import {initialState} from '../src/lib/pigment/model.ts';
const factory:CanvasFactory=()=>createCanvas(1,1) as unknown as HTMLCanvasElement;
const state={...initialState(),type:'glint',colors:['#E9FAF5','#91E0DE','#009FAC','#164F72'],params:{scale:50,horizon:44},grain:0,soften:0};

test('Glint sampler is seeded, bounded and sorted for translucent compositing',()=>{
 const particles=glintParticles(900,600,50,.44);assert.deepEqual(particles,glintParticles(900,600,50,.44));assert.ok(particles.length>400&&particles.length<=4200);
 assert.ok(particles.every((p,i)=>p.x>=0&&p.x<=900&&p.y>.44*600&&p.y<600&&p.rx>0&&p.ry>0&&p.opacity>0&&p.opacity<=1&&(!i||p.opacity>=particles[i-1].opacity)));
 assert.ok(new Set(particles.map(p=>p.softness)).size>=3);
});
test('Glint scale adjusts perspective water ridges and particle density',()=>{
 const low=glintRidges(900,600,0),high=glintRidges(900,600,100);assert.ok(high.length>low.length);assert.equal(low[0].shadow.length,65);
 assert.ok(glintParticles(900,600,100).length>glintParticles(900,600,0).length);
 for(const r of high){assert.ok(r.shadowWidth>r.highlightWidth);for(let i=0;i<65;i++)assert.ok(r.shadow[i][1]>r.highlight[i][1]);}
});
test('Glint weave contains both thread directions, tonal noise and opaque grayscale pixels',()=>{
 const pixels=glintWeavePixels();assert.equal(pixels.length,128*128*4);let min=255,max=0;
 for(let i=0;i<pixels.length;i+=4){assert.equal(pixels[i],pixels[i+1]);assert.equal(pixels[i],pixels[i+2]);assert.equal(pixels[i+3],255);min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);}assert.ok(max-min>30);assert.ok(min>80&&max<170);
});
test('Native Canvas Glint renders stable reflections and respects the horizon control',()=>{
 const pixels=glintPixels(240,170,state,factory),again=glintPixels(240,170,state,factory);assert.deepEqual(pixels,again);assert.ok(pixels.every((v,i)=>i%4!==3||v===255));
 const raised=glintPixels(240,170,{...state,params:{scale:50,horizon:20}},factory);let difference=0;for(let i=0;i<pixels.length;i+=4)difference+=Math.abs(pixels[i]-raised[i]);assert.ok(difference/(240*170)>1);
 const canvas=createCanvas(240,170),ctx=canvas.getContext('2d');ctx.globalAlpha=.7;const before=ctx.globalAlpha;paintGlint(ctx as unknown as CanvasRenderingContext2D,240,170,state,factory);assert.equal(ctx.globalAlpha,before);
});
