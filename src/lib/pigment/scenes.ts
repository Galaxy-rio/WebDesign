import cities from '../../data/city-paths.json' with { type: 'json' };
import { mixReferenceColour as blend, referenceStops, referenceCentres } from './reference-fields.ts';
import { luminance } from './fields-colour.ts';
import type { StudioState } from './model.ts';

type Point=[number,number];
type Ridge={points:Point[];top:number;base:number;depth:number;opacity:number};
export const CITY_NAMES=['San Francisco','New York','Paris','London','Sydney'];
export const MIST_DEFAULTS={scale:50,horizon:42,haze:50,height:50,sharp:55,sun:64,seed:7};
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value));
const rgba=(color:string,opacity:number)=>`rgba(${[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(',')},${opacity})`;
const piecewise=(value:number,low:number,mid:number,high:number)=>value<=50?low+(mid-low)*value/50:mid+(high-mid)*(value-50)/50;
function background(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState){const gradient=ctx.createLinearGradient(0,0,0,h);for(const [color,offset] of referenceStops(state.colors,referenceCentres(state.colors,state.divisions)))gradient.addColorStop(offset,color);ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);}
function noise1(x:number,seed:number){const cell=Math.floor(x),fraction=x-cell,ease=fraction*fraction*(3-2*fraction);const random=(i:number)=>{const n=Math.sin(i*127.1+seed*311.7)*43758.5453;return n-Math.floor(n);};return random(cell)+(random(cell+1)-random(cell))*ease;}
function mountain(x:number,index:number,seed:number,sharp:number){
 const frequency=1.7+index*.33,phase=index*7.31+13.7,edge=sharp/100;
 const peak=(f:number,s:number)=>{const noise=noise1(x*f+seed,s)*2-1,round=1-noise*noise,point=1-Math.abs(noise);return round+(point-round)*edge;};
 const layered=.52*peak(frequency,phase)+.3*peak(frequency*2.15,phase+1.77)+.18*peak(frequency*4.4,phase+3.31);
 return Math.pow(Math.max(0,layered),1+edge*.9)*(.55+.45*Math.pow(noise1(x*1.13+seed*.51,phase+5.2),1.4));
}
export function mistGeometry(w:number,h:number,params:StudioState['params']){
 const p={...MIST_DEFAULTS,...params} as typeof MIST_DEFAULTS,count=3+clamp(p.scale/100)*6,total=Math.ceil(count-.001),horizon=clamp(p.horizon/100,.14,.62)*h,available=h-horizon;
 const height=piecewise(p.height,.35,1,1.9),haze=piecewise(p.haze,.25,1,1.6),ridges:Ridge[]=[];
 for(let index=0;index<total;index++){
  const depth=Math.min(1,index/Math.max(.0001,count-1)),opacity=clamp(count-index),base=horizon+Math.pow((index+1)/count,1.3)*available,amplitude=(.12+.26*depth)*available*height*1.35;
  const points=Array.from({length:111},(_,i)=>[i/110*w,base-amplitude*mountain(i/110,index,p.seed*.73,p.sharp)] as Point);
  ridges.push({points,top:base-amplitude,base,depth,opacity});
 }
 const veils=ridges.map((ridge,index)=>{const gap=ridge.base-(index===0?horizon:ridges[index-1].base);return {x:(index%2===0?.32:.68)*w+Math.sin(index*2.1)*.06*w,y:ridge.base+(index===0?gap*.22:0),rx:.62*w,ry:index===0?Math.max(.085*h,gap*.95):Math.max(.05*h,gap*.6),opacity:Math.min(.92,(.62-.34*ridge.depth)*haze)*ridge.opacity};});
 return {ridges,veils,sun:{x:p.sun/100*w,y:Math.max(.1*h,horizon-.11*h),radius:.052*h}};
}
function ridgePath(ctx:CanvasRenderingContext2D,points:Point[],w:number,h:number,close:boolean){
 ctx.beginPath();ctx.moveTo(...points[0]);for(let i=0;i<points.length-1;i++){const previous=points[Math.max(0,i-1)],a=points[i],b=points[i+1],next=points[Math.min(points.length-1,i+2)];ctx.bezierCurveTo(a[0]+(b[0]-previous[0])/6,a[1]+(b[1]-previous[1])/6,b[0]-(next[0]-a[0])/6,b[1]-(next[1]-a[1])/6,b[0],b[1]);}if(close){ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();}
}
function mistColour(colors:string[],depth:number,haze:number){const land=colors.length>2?colors.slice(2):colors,index=depth*(land.length-1),left=Math.floor(index),color=blend(land[left],land[Math.min(land.length-1,left+1)],index-left);return blend(color,colors[1]??colors[0],Math.min(.82,(1-depth)*piecewise(haze,.15,.42,.7)));}
export function mistSunColour(colors:string[]):string {
 const light=colors.reduce((a,b)=>luminance(b)>luminance(a)?b:a);
 return luminance(light)<.5?blend(light,'#F7F4EE',.72):blend(light,'#ffffff',.35);
}
function paintMist(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState){
 const p={...MIST_DEFAULTS,...state.params} as typeof MIST_DEFAULTS,{ridges,veils,sun}=mistGeometry(w,h,p),fog=state.colors[1]??state.colors[0];background(ctx,w,h,state);
 const sunColour=mistSunColour(state.colors);
 const halo=ctx.createRadialGradient(sun.x,sun.y,0,sun.x,sun.y,sun.radius*3.4);halo.addColorStop(0,rgba(sunColour,.4));halo.addColorStop(1,rgba(sunColour,0));ctx.fillStyle=halo;ctx.fillRect(0,0,w,h);ctx.fillStyle=rgba(sunColour,.85);ctx.beginPath();ctx.arc(sun.x,sun.y,sun.radius,0,Math.PI*2);ctx.fill();
 for(let i=0;i<ridges.length;i++){
  const ridge=ridges[i],color=mistColour(state.colors,ridge.depth,p.haze),blur=(1-ridge.depth)**2*.006*h;
  const gradient=ctx.createLinearGradient(0,ridge.top,0,ridge.base);gradient.addColorStop(0,color);gradient.addColorStop(.45,blend(color,fog,.16));gradient.addColorStop(1,blend(color,fog,Math.min(.98,(.95-.4*ridge.depth)*piecewise(p.haze,.85,1,1.12))));
  ctx.save();ctx.globalAlpha=ridge.opacity;ctx.filter=blur>.4?`blur(${blur}px)`:'none';ridgePath(ctx,ridge.points,w,h,true);ctx.fillStyle=gradient;ctx.fill();ridgePath(ctx,ridge.points,w,h,false);ctx.strokeStyle=blend(color,fog,.8);ctx.globalAlpha=ridge.opacity*(.2+.22*ridge.depth);ctx.lineWidth=Math.max(1,h*.0035);ctx.lineCap='round';ctx.stroke();ctx.restore();
  const veil=veils[i];ctx.save();ctx.translate(veil.x,veil.y);ctx.scale(veil.rx,veil.ry);const veilGradient=ctx.createRadialGradient(0,0,0,0,0,1);veilGradient.addColorStop(0,rgba(fog,veil.opacity*.9));veilGradient.addColorStop(.55,rgba(fog,veil.opacity*.42));veilGradient.addColorStop(1,rgba(fog,0));ctx.fillStyle=veilGradient;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 const air=ctx.createLinearGradient(0,h*.86,0,h);air.addColorStop(0,rgba(fog,0));air.addColorStop(1,rgba(fog,piecewise(p.haze,.08,.26,.44)));ctx.fillStyle=air;ctx.fillRect(0,h*.86,w,h*.14);
}

const cityScale:Record<string,number>={sanfrancisco:1,newyork:1,paris:1.18,london:1.32,sydney:1.15};
export function cityLayout(w:number,h:number,name:string){
 const key=name.toLowerCase().replaceAll(' ','') as keyof typeof cities,city=cities[key]??cities.sanfrancisco;
 let scale=w/city.w*(cityScale[key]??1);if(city.h*scale<h*.22)scale=Math.min(h*.22/city.h,w/city.w*1.5);
 return {city,scale,x:(w-city.w*scale)/2,y:Math.max(h-city.h*scale,h*.3)};
}
export type ScenePathFactory=(svg:string)=>Path2D;
const pathCache=new Map<string,Path2D>();
function paintSkyline(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState,pathFactory:ScenePathFactory){
 background(ctx,w,h,state);const {city,scale,x,y}=cityLayout(w,h,String(state.params.city??'San Francisco')),last=state.colors.at(-1)!,ink=blend(last,'#12100E',.45);
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);const translation=/translate\(([-\d.]+),\s*([-\d.]+)\)/.exec(city.t),scaled=/scale\(([-\d.]+)\)/.exec(city.t);if(translation)ctx.translate(Number(translation[1]),Number(translation[2]));if(scaled)ctx.scale(Number(scaled[1]),Number(scaled[1]));
 for(const layer of city.layers){ctx.fillStyle=blend(last,ink,.28+.62*layer.z);for(const item of layer.p){let path=pathCache.get(item.d);if(!path){path=pathFactory(item.d);pathCache.set(item.d,path);}ctx.fill(path,'e' in item&&item.e?'evenodd':'nonzero');}}
 ctx.restore();const haze=city.h*scale*.24,gradient=ctx.createLinearGradient(0,h-haze,0,h);gradient.addColorStop(0,rgba(last,0));gradient.addColorStop(1,rgba(last,.32));ctx.fillStyle=gradient;ctx.fillRect(0,h-haze,w,haze);
}
export function paintScenes(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState,pathFactory:ScenePathFactory=svg=>new Path2D(svg)){if(state.type==='mist')paintMist(ctx,w,h,state);else if(state.type==='skyline')paintSkyline(ctx,w,h,state,pathFactory);else return false;return true;}
