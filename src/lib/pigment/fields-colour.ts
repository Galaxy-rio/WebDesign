/** Colour math shared by the field renderers. RGB values use the 0–255 range. */
export type RGB = [number, number, number];
export type Params = Record<string, number | string>;
export const BASE_TIME = 20.75;
export const TAU = Math.PI * 2;
export const clamp = (x:number, lo=0, hi=1) => Math.min(hi, Math.max(lo, x));
export const fract = (x:number) => x-Math.floor(x);
export const smooth = (x:number) => { const t=clamp(x); return t*t*(3-2*t); };
export const smoothstep = (a:number,b:number,x:number) => smooth((x-a)/(b-a));
export const mix = (a:RGB,b:RGB,t:number):RGB => [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
export const dot = (a:RGB,b:RGB) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
export function normalize(v:RGB):RGB { const n=Math.hypot(...v)||1; return v.map(x=>x/n) as RGB; }
export function rgb(hex:string):RGB { const n=parseInt(hex.slice(1),16); return [n>>16&255,n>>8&255,n&255]; }
export function luminance(hex:string):number { const c=rgb(hex).map(x=>{const v=x/255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return dot(c as RGB,[.2126,.7152,.0722]); }
export function lab(hex:string):RGB {
 const [r,g,b]=rgb(hex).map(x=>{const v=x/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
 const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);
 return [.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];
}
export function fromLab([l,a,b]:RGB):RGB {
 const x=(l+.3963377774*a+.2158037573*b)**3,y=(l-.1055613458*a-.0638541728*b)**3,z=(l-.0894841775*a-1.291485548*b)**3;
 return [4.0767416621*x-3.3077115913*y+.2309699292*z,-1.2684380046*x+2.6097574011*y-.3413193965*z,-.0041960863*x-.7034186147*y+1.707614701*z].map(v=>Math.round(clamp(v<=.0031308?v*12.92:1.055*Math.max(0,v)**(1/2.4)-.055)*255)) as RGB;
}
export function bounds(n:number,divs:number[]):number[] {return [0,...(divs.length===n-1?divs:Array.from({length:n-1},(_,i)=>(i+1)/n)),1];}
export function weights(n:number,divs:number[]):number[] {const b=bounds(n,divs);return Array.from({length:n},(_,i)=>(b[i+1]-b[i])*n);}
export function colourStops(colors:string[],divs:number[],eased=false):[number,RGB][] {
 const edges=bounds(colors.length,divs),centers=colors.map((_,i)=>(edges[i]+edges[i+1])/2),p=colors.map(lab),stops:[number,RGB][]=[];
 for(let i=0;i<colors.length-1;i++) {stops.push([centers[i],rgb(colors[i])]);for(let j=1;j<=6;j++){const f=j/7;stops.push([centers[i]+(centers[i+1]-centers[i])*f,fromLab(mix(p[i],p[i+1],eased?smooth(f):f))]);}}
 stops.push([centers.at(-1)!,rgb(colors.at(-1)!)]);return stops;
}
export function sampleStops(stops:[number,RGB][],position:number):RGB {if(position<=stops[0][0])return stops[0][1];for(let i=1;i<stops.length;i++)if(position<=stops[i][0])return mix(stops[i-1][1],stops[i][1],(position-stops[i-1][0])/(stops[i][0]-stops[i-1][0]));return stops.at(-1)![1];}
export function palette(colors:string[],divs:number[]):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(768),b=bounds(colors.length,divs),centers=colors.map((_,i)=>(b[i]+b[i+1])/2),p=colors.map(lab);
 for(let i=0;i<256;i++){const t=i/255;let result:RGB;
  if(t<=centers[0])result=rgb(colors[0]);else if(t>=centers.at(-1)!)result=rgb(colors.at(-1)!);else {let j=0;while(t>centers[j+1])j++;result=fromLab(mix(p[j],p[j+1],(t-centers[j])/(centers[j+1]-centers[j])));}out.set(result,i*3);
 }return out;
}
export function samplePalette(p:Uint8ClampedArray,position:number):RGB {const t=clamp(position)*255,a=Math.floor(t),b=Math.min(255,a+1),f=t-a;return [0,1,2].map(c=>p[a*3+c]*(1-f)+p[b*3+c]*f) as RGB;}
export function put(pixels:Uint8ClampedArray,index:number,c:RGB):void {pixels[index]=c[0];pixels[index+1]=c[1];pixels[index+2]=c[2];pixels[index+3]=255;}
export function movingCenter(index:number,time:number):[number,number] {const phase=index*.37;return [.5+.5*Math.sin(time*(.6+fract(index/3)*.9)+phase),.5+.5*Math.cos(time*(.8+fract((index+1)/4))+phase*1.5)];}
export const MESH_CENTERS:[number,number][]=[[.16,.82],[.78,.26],[.88,.84],[.24,.16],[.5,.55],[.62,1]];
export function hash(x:number,y:number,seed:number):number {return fract(Math.sin(x*127.1+y*311.7+seed*74.7)*43758.5453);}
export function noise(x:number,y:number,seed:number):number {const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(fract(x)),fy=smooth(fract(y)),a=hash(ix,iy,seed),b=hash(ix+1,iy,seed),c=hash(ix,iy+1,seed),d=hash(ix+1,iy+1,seed);return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;}
export function fbm(x:number,y:number,seed:number,octaves:number):number {let sum=0,amp=.5,freq=1,total=0;for(let i=0;i<octaves;i++){sum+=amp*noise(x*freq,y*freq,seed+i*31);total+=amp;amp*=.5;freq*=2;}return sum/total;}
