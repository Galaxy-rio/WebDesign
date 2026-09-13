import type { StudioState } from './model.ts';

type RGB = [number, number, number];
export type ColourBlend = (a: string, b: string, amount: number) => string;
interface RingPalette { glow:string; veil:string; body:string; depth:string; shadow:string; rim:string }
interface RingTones { dark:string; mid:string; edge:string }
interface ColourStop { at:number; colour:string; alpha?:number }
const clamp=(v:number,low=0,high=1)=>Math.max(low,Math.min(high,v));
const rgb=(hex:string):RGB=>[parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];
const rgba=(hex:string,alpha:number)=>`rgba(${rgb(hex).join(',')},${alpha})`;
const baseline=['#FF9FCB','#DCEFFF','#2170D5','#105CB4','#00101F','#3A94EE'];
const blueTones={
 dark:['#00101F','#00172F','#002A55','#06407E','#0B54A5','#105CB4','#135FBA','#1764BF','#185FB6','#175AAF'],
 mid:['#001A31','#002D58','#074A8C','#0D5EAC','#1672CD','#1B7BD8','#2485E0','#2B8BE5','#2881D9','#2478D0'],
 edge:['#001A3A','#0A478C','#1767C3','#40A0FF','#2175DE','#2876DB','#3A94EE','#4097F0','#388AE4','#3181DC'],
};

export function ringGeometry(width:number,height:number,state:StudioState){
 const count=Math.round(clamp(Number(state.params.count??12),5,24));
 const x=(.5+(2*Number(state.params.dirX??0)-1)*.96393)*width;
 const y=(.5+(2*Number(state.params.dirY??0)-1)*.523675)*height;
 const nearest=Math.hypot(Math.max(0,-x,x-width),Math.max(0,-y,y-height));
 const farthest=Math.max(Math.hypot(x,y),Math.hypot(width-x,y),Math.hypot(x,height-y),Math.hypot(width-x,height-y));
 const first=nearest+(farthest-nearest)*.135;
 const spacing=(farthest*1.04-first)/(count-1);
 return {x,y,count,farthest,spacing,radii:Array.from({length:count},(_,i)=>first+spacing*i),
   blur:clamp(Number(state.params.melt??0)/100)*spacing*.55,
   glow:clamp(Number(state.params.glow??100)/100),sweep:clamp(Number(state.params.sweep??100)/100),scale:width/900};
}

function ringPalette(colours:string[],blend:ColourBlend):RingPalette{
 if(colours.length>=6)return {glow:colours[0],veil:colours[1],body:colours[2],depth:colours[3],shadow:colours[4],rim:colours[5]};
 const glow=colours[0]??baseline[0],body=colours[1]??colours[0]??baseline[2];
 const depth=colours[2]??blend(body,'#000000',.42),shadow=colours[3]??colours.at(-1)??blend(depth,'#000000',.72);
 return {glow,body,depth,shadow,veil:blend(glow,'#FFFFFF',.68),rim:blend(body,'#FFFFFF',.24)};
}

function isBaseline(p:RingPalette){return [p.glow,p.veil,p.body,p.depth,p.shadow,p.rim].every((v,i)=>v.toUpperCase()===baseline[i]);}
function tonesFor(p:RingPalette,index:number,count:number,blend:ColourBlend):RingTones{
 const position=index/(count-1);
 if(isBaseline(p)){
  const interpolate=(colours:string[])=>{const at=position*(colours.length-1),i=Math.min(colours.length-2,Math.floor(at));return blend(colours[i],colours[i+1],at-i);};
  return {dark:interpolate(blueTones.dark),mid:interpolate(blueTones.mid),edge:interpolate(blueTones.edge)};
 }
 const base=position<.58?blend(p.shadow,p.depth,position/.58):blend(p.depth,p.body,clamp((position-.58)/.25));
 const dark=position>.83?blend(base,p.depth,(position-.83)*.7):base;
 const mid=blend(dark,p.rim,.32+Math.sin(position*Math.PI)*.34);
 return {dark,mid,edge:blend(mid,p.veil,.1+Math.sin(position*Math.PI)*.12)};
}

function discStops(tones:RingTones,innerRatio:number,blend:ColourBlend):ColourStop[]{
 const dark=blend(tones.dark,tones.mid,.22),mid=blend(tones.mid,tones.edge,.3);
 return [{at:0,colour:dark},{at:Math.max(0,innerRatio-.005),colour:dark},
  {at:innerRatio+.55*(1-innerRatio),colour:blend(dark,mid,.55)},
  {at:.988,colour:mid},{at:1,colour:blend(tones.edge,'#FFFFFF',.24)}];
}

function rimStops(edge:string,halo:boolean,blend:ColourBlend):ColourStop[]{
 const dim=blend(edge,'#FFFFFF',.24),mid=blend(edge,'#FFFFFF',.4),bright=blend(edge,'#FFFFFF',halo?.5:.62);
 const a=halo?[.08,.16,.3,.5,.66,.66]:[.12,.24,.42,.66,.9,.9];
 return [{at:0,colour:dim,alpha:a[0]},{at:16/360,colour:dim,alpha:a[1]},
  {at:32/360,colour:mid,alpha:a[2]},{at:50/360,colour:bright,alpha:a[3]},
  {at:66/360,colour:bright,alpha:a[4]},{at:84/360,colour:bright,alpha:a[5]},
  {at:150/360,colour:bright,alpha:a[1]},{at:320/360,colour:dim,alpha:.04},
  {at:359.9/360,colour:dim,alpha:a[0]}];
}

function sweepStops(p:RingPalette,blend:ColourBlend):ColourStop[]{
 const special=isBaseline(p),body=special?'#2E7FDD':p.body,rim=special?'#4E9BEE':p.rim;
 return [{at:0,colour:body,alpha:.02},{at:10/360,colour:body,alpha:.08},
  {at:20/360,colour:rim,alpha:.2},{at:32/360,colour:special?'#7FB9F8':blend(p.rim,'#FFFFFF',.4),alpha:.44},
  {at:45/360,colour:special?'#CBDDF9':blend(p.veil,'#FFFFFF',.3),alpha:.66},
  {at:56/360,colour:special?'#F3DBE9':blend(p.glow,'#FFFFFF',.45),alpha:.82},
  {at:68/360,colour:special?'#FFCFE2':blend(p.glow,'#FFFFFF',.22),alpha:.94},
  {at:84/360,colour:special?'#FFD9E8':blend(p.glow,'#FFFFFF',.3),alpha:.94},
  {at:359.9/360,colour:body,alpha:.02}];
}

function addStops(gradient:CanvasGradient,stops:ColourStop[]){
 let last=0;
 for(const stop of stops){last=Math.max(last,clamp(stop.at));gradient.addColorStop(last,stop.alpha===undefined?stop.colour:rgba(stop.colour,stop.alpha));}
 return gradient;
}
function circle(ctx:CanvasRenderingContext2D,x:number,y:number,radius:number){ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);}
let haloCanvas:HTMLCanvasElement|undefined,sweepCanvas:HTMLCanvasElement|undefined;
function layer(kind:'halo'|'sweep',width:number,height:number){
 const canvas=kind==='halo'?(haloCanvas??=document.createElement('canvas')):(sweepCanvas??=document.createElement('canvas'));
 canvas.width=width;canvas.height=height;return canvas.getContext('2d')!;
}

/** Native discs, glow layers and conic lighting keep export and preview identical. */
export function paintRings(ctx:CanvasRenderingContext2D,width:number,height:number,state:StudioState,blend:ColourBlend){
 const g=ringGeometry(width,height,state),p=ringPalette(state.colors,blend);
 const tones=g.radii.map((_,i)=>tonesFor(p,i,g.count,blend));
 ctx.save();ctx.fillStyle=p.shadow;ctx.fillRect(0,0,width,height);ctx.restore();
 for(let i=g.count-1;i>=0;i--){
  ctx.save();if(g.blur>.05)ctx.filter=`blur(${g.blur.toFixed(2)}px)`;
  const gradient=ctx.createRadialGradient(g.x,g.y,0,g.x,g.y,g.radii[i]);
  ctx.fillStyle=addStops(gradient,discStops(tones[i],i?g.radii[i-1]/g.radii[i]:.55,blend));
  circle(ctx,g.x,g.y,g.radii[i]);ctx.fill();ctx.restore();
 }
 const rimGradient=(context:CanvasRenderingContext2D,index:number,halo:boolean)=>
  addStops(context.createConicGradient(0,g.x,g.y),rimStops(tones[index].edge,halo,blend));
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=g.glow;
 if(g.blur>.3)ctx.filter=`blur(${(g.blur*.7).toFixed(2)}px)`;
 ctx.lineWidth=Math.max(.5,1.8*g.scale);
 for(let i=0;i<g.count;i++){ctx.strokeStyle=rimGradient(ctx,i,false);circle(ctx,g.x,g.y,g.radii[i]);ctx.stroke();}
 ctx.restore();

 const halo=layer('halo',width,height);halo.lineWidth=Math.max(.5,8*g.scale);
 for(let i=0;i<g.count;i++){halo.strokeStyle=rimGradient(halo,i,true);circle(halo,g.x,g.y,g.radii[i]);halo.stroke();}
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=g.glow;ctx.filter=`blur(${(9*g.scale+g.blur).toFixed(2)}px)`;ctx.drawImage(halo.canvas,0,0);ctx.restore();

 const sweep=layer('sweep',width,height);
 sweep.fillStyle=addStops(sweep.createConicGradient(0,g.x,g.y),sweepStops(p,blend));sweep.fillRect(0,0,width,height);
 const mask=sweep.createRadialGradient(g.x,g.y,0,g.x,g.y,g.farthest+80*g.scale);
 addStops(mask,[{at:0,colour:'#FFFFFF',alpha:0},{at:.32,colour:'#FFFFFF',alpha:0},{at:.54,colour:'#FFFFFF',alpha:1},{at:1,colour:'#FFFFFF',alpha:1}]);
 sweep.globalCompositeOperation='destination-in';sweep.fillStyle=mask;sweep.fillRect(0,0,width,height);
 ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=g.sweep;ctx.drawImage(sweep.canvas,0,0);ctx.restore();
 const farColour=isBaseline(p)?'#1968CD':blend(p.body,p.depth,.5);
 const far=ctx.createRadialGradient(g.x,g.y,0,g.x,g.y,g.farthest*1.083);
 addStops(far,[{at:0,colour:farColour,alpha:0},{at:.72,colour:farColour,alpha:0},{at:.86,colour:farColour,alpha:.26},{at:1,colour:farColour,alpha:.44}]);
 ctx.save();ctx.globalAlpha=g.sweep;ctx.fillStyle=far;ctx.fillRect(0,0,width,height);ctx.restore();
}

function sampleStops(stops:ColourStop[],position:number):[RGB,number]{
 let index=0;while(index<stops.length-2&&position>stops[index+1].at)index++;
 const a=stops[index],b=stops[index+1],t=clamp((position-a.at)/Math.max(1e-8,b.at-a.at)),ca=rgb(a.colour),cb=rgb(b.colour);
 return [ca.map((v,i)=>v+(cb[i]-v)*t) as RGB,(a.alpha??1)+((b.alpha??1)-(a.alpha??1))*t];
}

/**
 * DOM-free colour sampling uses the same disc geometry and lighting data. Native
 * Canvas performs the full two-dimensional blur in the actual rendered artwork;
 * this radial approximation is useful for deterministic analysis in Node.
 */
export function ringsPixels(width:number,height:number,state:StudioState,blend:ColourBlend):Uint8ClampedArray<ArrayBuffer>{
 const g=ringGeometry(width,height,state),p=ringPalette(state.colors,blend),pixels=new Uint8ClampedArray(width*height*4);
 const tones=g.radii.map((_,i)=>tonesFor(p,i,g.count,blend));
 const discs=tones.map((tone,i)=>discStops(tone,i?g.radii[i-1]/g.radii[i]:.55,blend));
 const rims=tones.map(tone=>rimStops(tone.edge,false,blend)),halos=tones.map(tone=>rimStops(tone.edge,true,blend)),sweeps=sweepStops(p,blend);
 const body=(radius:number):RGB=>{let i=0;while(i<g.count-1&&radius>g.radii[i])i++;return sampleStops(discs[i],radius/g.radii[i])[0];};
 const profileSize=Math.max(512,Math.ceil(g.farthest*2)),profile:RGB[]=Array.from({length:profileSize+1},(_,i)=>{
  const radius=i/profileSize*g.farthest;
  if(g.blur<.05)return body(radius);
  const colour:RGB=[0,0,0];let sum=0;
  for(let offset=-3;offset<=3;offset+=.5){const weight=Math.exp(-offset*offset/2),sample=body(Math.max(0,radius+offset*g.blur));for(let c=0;c<3;c++)colour[c]+=sample[c]*weight;sum+=weight;}
  return colour.map(v=>v/sum) as RGB;
 });
 const farColour=isBaseline(p)?'#1968CD':blend(p.body,p.depth,.5);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const dx=x+.5-g.x,dy=y+.5-g.y,radius=Math.hypot(dx,dy),angle=(Math.atan2(dy,dx)/(2*Math.PI)+1)%1;
  let colour=[...profile[Math.min(profileSize,Math.round(radius/g.farthest*profileSize))]] as RGB;
  const screen=(layer:RGB,alpha:number)=>{colour=colour.map((v,i)=>v+(255-v)*layer[i]/255*clamp(alpha)) as RGB;};
  for(let i=0;i<g.count;i++){
   const distance=Math.abs(radius-g.radii[i]),lineSigma=Math.max(.45,.9*g.scale+g.blur*.7),haloSigma=Math.max(.6,9*g.scale+g.blur);
   const [rim,ra]=sampleStops(rims[i],angle),[halo,ha]=sampleStops(halos[i],angle);
   screen(rim,ra*g.glow*Math.exp(-distance*distance/(2*lineSigma*lineSigma)));
   screen(halo,ha*g.glow*Math.min(1,8*g.scale/(haloSigma*2.5))*Math.exp(-distance*distance/(2*haloSigma*haloSigma)));
  }
  const [sweep,sa]=sampleStops(sweeps,angle),radialMask=clamp((radius/(g.farthest+80*g.scale)-.32)/.22);
  screen(sweep,sa*g.sweep*radialMask);
  const [far,fa]=sampleStops([{at:0,colour:farColour,alpha:0},{at:.72,colour:farColour,alpha:0},{at:.86,colour:farColour,alpha:.26},{at:1,colour:farColour,alpha:.44}],radius/(g.farthest*1.083));
  const index=(y*width+x)*4;
  for(let c=0;c<3;c++)pixels[index+c]=colour[c]+(far[c]-colour[c])*fa*g.sweep;
  pixels[index+3]=255;
 }
 return pixels;
}
