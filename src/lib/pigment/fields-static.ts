import { BASE_TIME, TAU, MESH_CENTERS, rgb, lab, fromLab, luminance, mix, clamp, fract, smooth, weights, movingCenter, fbm, colourStops, sampleStops, put, type Params, type RGB } from './fields-colour.ts';

export const STILL_DEFAULTS={positions:2,waveX:100,waveXShift:60,waveY:100,waveYShift:21,mixing:93,grain:0,rotation:270};

function stillHash(x:number,y:number):number {let a=fract(x*.3183099)+.1,b=fract(y*.3678794)+.1;const c=a*(a+19.19)+b*(b+19.19);a+=c;b+=c;return fract(a*b);}
function stillNoise(x:number,y:number):number {const ix=Math.floor(x),iy=Math.floor(y),a=stillHash(ix,iy),b=stillHash(ix+1,iy),c=stillHash(ix,iy+1),d=stillHash(ix+1,iy+1),fx=smooth(fract(x)),fy=smooth(fract(y));return a+(b-a)*fx+(c+(d-c)*fx-a-(b-a)*fx)*fy;}

/** Still: two coupled coordinate waves with RGB inverse-distance mixing (reference M4). */
export function stillPixels(width:number,height:number,colors:string[],divs:number[],params:Params):Uint8ClampedArray<ArrayBuffer> {
 const p={...STILL_DEFAULTS,...params} as typeof STILL_DEFAULTS,out=new Uint8ClampedArray(width*height*4),pal=colors.map(rgb),w=weights(colors.length,divs);
 const mixing=clamp(p.mixing/100)**.7,power=(2-mixing)/2,rot=p.rotation%360*Math.PI/180,co=Math.cos(rot),si=Math.sin(rot),base=Math.min(width,height),aspectX=width/base,aspectY=height/base;
 const points=colors.map((_,i)=>movingCenter(i,25+.33*p.positions));
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const xx=((x+.5)/width-.5)*aspectX,yy=(.5-(y+.5)/height)*aspectY;let u=co*xx-si*yy+.5,v=si*xx+co*yy+.5;
  const grain=p.grain>0?.4*p.grain/100*(stillNoise(u*1000,v*1000)-.5):0,influence=1-smooth(Math.hypot(u-.5,v-.5));
  for(let i=1;i<=2;i++){u+=p.waveX/100*influence/i*Math.cos(TAU*p.waveXShift/100+i*2*smooth(v));v+=p.waveY/100*influence/i*Math.cos(TAU*p.waveYShift/100+i*2*smooth(u));}
  const c:RGB=[0,0,0];let total=0;
  for(let i=0;i<colors.length;i++){const dx=u-points[i][0]-grain,dy=v-points[i][1]-grain;let k=1/((dx*dx+dy*dy)**power+.001);const sharp=8*Math.min(1,k);k=k**(sharp+(1-sharp)*mixing)*w[i];for(let j=0;j<3;j++)c[j]+=pal[i][j]*k;total+=k;}
  put(out,(y*width+x)*4,c.map(v=>v/Math.max(.0001,total)) as RGB);
 }return out;
}

/** Retro: fbm advection and coloured Gaussian ink pools over the brightest paper (Lh). */
export function retroPixels(width:number,height:number,colors:string[],divs:number[],time=BASE_TIME,fast=false):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(width*height*4),pal=colors.map(fast?rgb:lab),weight=weights(colors.length,divs);let brightest=0;
 for(let i=1;i<colors.length;i++)if(luminance(colors[i])>luminance(colors[brightest]))brightest=i;
 const points=colors.map((_,i)=>{const c=MESH_CENTERS[i%MESH_CENTERS.length],phase=i*1.7;return [c[0]+.1*Math.sin(time*.9+phase),c[1]+.1*Math.cos(time*.72+phase*1.3)];});
 const motion=time*.22;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
  const xx=(x+.5)/width,yy=(y+.5)/height,u=xx+.5*(fbm(xx*2+motion,yy*2,11,3)-.5),v=yy+.5*(fbm(xx*2+3.7,yy*2+motion,23,3)-.5);
  const c=pal[brightest].map(v=>v*.85) as RGB;let total=.85;
  for(let i=0;i<colors.length;i++){if(i===brightest)continue;const dx=u-points[i][0],dy=v-points[i][1],k=weight[i]*4*Math.exp(-(dx*dx+dy*dy)/(2*.15*.15));for(let j=0;j<3;j++)c[j]+=pal[i][j]*k;total+=k;}
  const value=c.map(v=>v/total) as RGB;put(out,(y*width+x)*4,fast?value:fromLab(value));
 }return out;
}

/** Mesh uses overlapping translucent ellipses, never a global weighted field. */
export function meshPixels(width:number,height:number,colors:string[],divs:number[],points:[number,number][]=[]):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(width*height*4),pal=colors.map(rgb),weight=weights(colors.length,divs),sizes=[[.72,.58],[.56,.72],[.78,.62],[.5,.44],[.9,.76],[.62,.5]];
 let paper=colors[0];for(const c of colors)if(luminance(c)>luminance(paper))paper=c;
 const background=luminance(paper)<.5?fromLab(mix(lab(paper),lab('#F7F4EE'),.55)):rgb(paper);
 const ellipses=colors.map((_,i)=>{const center=points[i]??MESH_CENTERS[i%MESH_CENTERS.length],size=sizes[i%sizes.length],radius=clamp(Math.sqrt(weight[i]),.55,1.45);return [center[0],center[1],size[0]*radius,size[1]*radius];});
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {let c=background;const u=(x+.5)/width,v=(y+.5)/height;
  // CSS puts the first gradient on top; keep that ordering in canvas and export.
  for(let i=colors.length-1;i>=0;i--){const [cx,cy,rx,ry]=ellipses[i],distance=Math.hypot((u-cx)/rx,(v-cy)/ry),alpha=clamp((.72-distance)/(.72-.22));c=mix(c,pal[i],alpha);}put(out,(y*width+x)*4,c);
 }return out;
}

/** iOS is a smooth 135-degree ramp with a faint upper-left sheen. */
export function iosPixels(width:number,height:number,colors:string[],divs:number[]):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(width*height*4),stops=colourStops(colors,divs,true);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++) {const u=(x+.5)/width,v=(y+.5)/height;
  // A CSS 135deg line projects onto x+y; its extent is width+height.
  const t=(x+.5+y+.5)/(width+height),c=sampleStops(stops,t),radius=Math.hypot((u-.12)/.9,(v-.08)/.7),alpha=.22*clamp(1-radius/.6);put(out,(y*width+x)*4,mix(c,[255,255,255],alpha));
 }return out;
}
