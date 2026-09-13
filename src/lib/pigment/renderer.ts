import { INITIAL_TIME, weightsFor, FONTS, type StudioState, type ImageLayer, type TextLayer } from './model.ts';
import { barsPixels } from './bars.ts';
import { paintRings, ringsPixels } from './rings.ts';
import { referenceFlowPixels, referenceStripePixels, referenceWavePixels, paintReferenceWaves } from './reference-fields.ts';
import { paintPrism, prismPixels } from './prism.ts';
import { FIELD_TYPES, fieldsPixels, paintFields } from './fields-exact.ts';
import { glowPixels, paintGlow } from './glow.ts';
import { linesPixels, paintLines } from './lines.ts';
import { paintNativeObjects, NATIVE_OBJECT_TYPES } from './native-objects.ts';
import { paintNativeTexture, texturePixels } from './native-textures.ts';
import { paintScenes } from './scenes.ts';
import { paintGlint } from './scenes-glint.ts';
import { paintForms, formsPixels } from './forms.ts';
export type Point = [number, number];
export const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max,n));
export function rgb(hex: string): [number,number,number] { return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)]; }
export function flowPixels(width: number, height: number, colors: string[], params: Record<string,number>, time: number, points?: Point[], weights?: number[]): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(width*height*4), palette = colors.map(rgb);
  const scale = .4+(params.scale??50)/100*1.2, distortion=(params.distortion??60)/100, swirl=(params.swirl??10)/100;
  const smooth = (v:number) => {v=clamp(v);return v*v*(3-2*v);};
  const centers = colors.map((_,i) => {const phase=i*.37, ax=.6+(i/3%1)*.9, ay=.8+((i+1)/4%1);const x=.5+.5*Math.sin(time*ax+phase),y=.5+.5*Math.cos(time*ay+phase*1.5); if(!points?.[i])return [x,y];return [(points[i][0]-.5)/scale+.5+.2*(x-(.5+.5*Math.sin(INITIAL_TIME*ax+phase)))/scale,(points[i][1]-.5)/scale+.5+.2*(y-(.5+.5*Math.cos(INITIAL_TIME*ay+phase*1.5)))/scale];});
  for(let py=0;py<height;py++)for(let px=0;px<width;px++){
    let x=((px+.5)/width-.5)/scale+.5,y=((py+.5)/height-.5)/scale+.5;
    const radius=smooth(Math.hypot(x-.5,y-.5)), influence=1-radius;
    for(let k=1;k<=2;k++){x+=distortion*influence/k*Math.sin(time+k*.4*smooth(y))*Math.cos(.2*time+k*2.4*smooth(y));y+=distortion*influence/k*Math.cos(time+k*2*smooth(x));}
    const angle=-3*swirl*radius,cos=Math.cos(angle),sin=Math.sin(angle),dx=x-.5,dy=y-.5;x=cos*dx-sin*dy+.5;y=sin*dx+cos*dy+.5;
    let r=0,g=0,b=0,total=0;
    for(let i=0;i<palette.length;i++){const a=x-centers[i][0],b1=y-centers[i][1],d=a*a+b1*b1,w=(weights?.[i]??1)/(d*d+.0001);r+=palette[i][0]*w;g+=palette[i][1]*w;b+=palette[i][2]*w;total+=w;}
    const p=(py*width+px)*4;pixels[p]=r/total;pixels[p+1]=g/total;pixels[p+2]=b/total;pixels[p+3]=255;
  }
  return pixels;
}

const smooth=(a:number,b:number,x:number)=>{const v=clamp((x-a)/(b-a));return v*v*(3-2*v);};
type RGB=[number,number,number];
function mix(a:RGB,b:RGB,t:number):RGB{return[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
function toLab(c:RGB):RGB{const [r,g,b]=c.map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;});const l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);return[.2104542553*l+.793617785*m-.0040720468*s,1.9779984951*l-2.428592205*m+.4505937099*s,.0259040371*l+.7827717662*m-.808675766*s];}
function fromLab([l,a,b]:RGB):RGB{const x=(l+.3963377774*a+.2158037573*b)**3,y=(l-.1055613458*a-.0638541728*b)**3,z=(l-.0894841775*a-1.291485548*b)**3;return[4.0767416621*x-3.3077115913*y+.2309699292*z,-1.2684380046*x+2.6097574011*y-.3413193965*z,-.0041960863*x-.7034186147*y+1.707614701*z].map(c=>clamp(c<=.0031308?12.92*c:1.055*Math.max(0,c)**(1/2.4)-.055)*255) as RGB;}
export function paletteLookup(colors:string[],divisions:number[],size=512,start=0,interpolation:'linear'|'smooth'='smooth'):RGB[]{
 const palette=colors.map(c=>toLab(rgb(c))),bounds=[0,...divisions,1],centers=palette.map((_,i)=>(bounds[i]+bounds[i+1])/2);
 return Array.from({length:size},(_,i)=>{
  const t=start+(1-start)*i/(size-1);
  if(t<=centers[0])return rgb(colors[0]);
  if(t>=centers.at(-1)!)return rgb(colors.at(-1)!);
  let j=0;while(j<centers.length-2&&t>centers[j+1])j++;
  const fraction=interpolation==='linear'?(t-centers[j])/(centers[j+1]-centers[j]):smooth(centers[j],centers[j+1],t);
  const colour=fromLab(mix(palette[j],palette[j+1],fraction));
  return interpolation==='linear'?colour.map(Math.round) as RGB:colour;
 });
}
const blendColour=(a:string,b:string,amount:number)=>'#'+fromLab(mix(toLab(rgb(a)),toLab(rgb(b)),amount)).map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
/** Every renderer is deterministic at a given time, including its grain and geometry. */
export function gradientPixels(width:number,height:number,state:StudioState,time=state.time,quality='preview'):Uint8ClampedArray<ArrayBuffer> {
 if(FIELD_TYPES.includes(state.type))return fieldsPixels(width,height,state,time);
 if(state.type==='glow')return glowPixels(width,height,state,time);
 if(state.type==='lines')return linesPixels(width,height,state,time);
 if(state.type==='forms')return formsPixels(width,height,state);
 if(state.type==='pixel'||state.type==='glassy')return texturePixels(width,height,state,time);
 if(NATIVE_OBJECT_TYPES.includes(state.type)||['mist','skyline','glint'].includes(state.type)){
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const context=canvas.getContext('2d')!;
  if(state.type==='glint')paintGlint(context,width,height,state);
  else if(!paintNativeObjects(context,width,height,state))paintScenes(context,width,height,state);
  return new Uint8ClampedArray(context.getImageData(0,0,width,height).data);
 }
 if(state.type==='flow')return quality==='export'||quality==='still'||state.speed===0
  ?referenceFlowPixels(width,height,state.colors,state.params,time,state.points,weightsFor(state))
  :flowPixels(width,height,state.colors,state.params as Record<string,number>,time,state.points,weightsFor(state));
 if(state.type==='bars'||state.type==='columns')return barsPixels(width,height,state,time,paletteLookup(state.colors,state.divisions,256,.12,'linear'),rgb(state.colors[0]));
 if(state.type==='rings')return ringsPixels(width,height,state,blendColour);
 if(state.type==='stripes')return referenceStripePixels(width,height,state.colors,state.divisions,state.params,time,quality==='preview'&&state.speed>0);
 if(state.type==='prism')return prismPixels(width,height,state.colors,state.divisions,state.params,time);
 if(state.type==='waves')return referenceWavePixels(width,height,state.colors,state.divisions);
 throw new Error('Unknown gradient type: '+state.type);
}

let scratch:HTMLCanvasElement|undefined;
export function paintGradient(ctx:CanvasRenderingContext2D,width:number,height:number,state:StudioState,time=state.time,quality='preview'){
 const native=['waves','bars','columns','rings','prism','lines','pixel','glassy','glint','mist','skyline','forms',...NATIVE_OBJECT_TYPES].includes(state.type);
 const gpu=['sky','aurora','silk'].includes(state.type);
 const limit=quality==='export'?4096:quality==='thumbnail'?200:native?Math.max(width,height):gpu?1600:state.type==='glow'?1280:state.type==='stripes'?1280:state.speed>0&&quality!=='still'?360:640;
 const factor=Math.min(1,limit/Math.max(width,height));const w=Math.max(1,Math.round(width*factor)),h=Math.max(1,Math.round(height*factor));
 scratch??=document.createElement('canvas');scratch.width=w;scratch.height=h;
 const sctx=scratch.getContext('2d')!;
 if(FIELD_TYPES.includes(state.type))paintFields(sctx,w,h,state,time);
 else if(state.type==='glow')paintGlow(sctx,w,h,state,time);
 else if(state.type==='lines')paintLines(sctx,w,h,state,time);
 else if(state.type==='glint')paintGlint(sctx,w,h,state);
 else if(state.type==='forms')paintForms(sctx,w,h,state);
 else if(paintNativeObjects(sctx,w,h,state)||paintNativeTexture(sctx,w,h,state,time)||paintScenes(sctx,w,h,state)){}
 else if(state.type==='rings')paintRings(sctx,w,h,state,blendColour);
 else if(state.type==='waves')paintReferenceWaves(sctx,w,h,state.colors,state.divisions);
 else if(state.type==='prism')paintPrism(sctx,w,h,state.colors,state.divisions,state.params,time);
 else sctx.putImageData(new ImageData(gradientPixels(w,h,state,time,quality),w,h),0,0);
 ctx.save();ctx.clearRect(0,0,width,height);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 const blur=state.type==='forms'?0:state.soften/100*Math.min(width,height)*.08;
 // Keep the sampled edge beneath the blurred image so exported edges stay opaque.
 ctx.filter='none';ctx.drawImage(scratch,0,0,width,height);
 if(blur){ctx.filter=`blur(${blur}px)`;ctx.drawImage(scratch,-blur*2,-blur*2,width+blur*4,height+blur*4);}
 ctx.restore();
 if(state.grain>0)paintGrain(ctx,width,height,state.grain,state.seed);
}
const noiseCache=new Map<string,HTMLCanvasElement>();
function paintGrain(ctx:CanvasRenderingContext2D,width:number,height:number,grain:number,seed:number){
 const key=String(seed);let tile=noiseCache.get(key);if(!tile){tile=document.createElement('canvas');tile.width=192;tile.height=192;const nc=tile.getContext('2d')!,pixels=nc.createImageData(192,192);let random=seed+1;for(let p=0;p<pixels.data.length;p+=4){random=(Math.imul(random,1664525)+1013904223)>>>0;const value=random>>>24;pixels.data[p]=value;pixels.data[p+1]=value;pixels.data[p+2]=value;pixels.data[p+3]=255;}nc.putImageData(pixels,0,0);if(noiseCache.size>8)noiseCache.clear();noiseCache.set(key,tile);}
 ctx.save();ctx.globalAlpha=grain/100*.6;ctx.globalCompositeOperation='soft-light';ctx.fillStyle=ctx.createPattern(tile,'repeat')!;ctx.fillRect(0,0,width,height);ctx.restore();
}
export function drawText(ctx:CanvasRenderingContext2D,width:number,height:number,text:TextLayer){
 const font=FONTS.find(f=>f.id===text.font)??FONTS[0],size=width*text.size/100;ctx.save();ctx.translate(width*text.x/100,height*text.y/100);ctx.rotate(text.rotation*Math.PI/180);ctx.globalAlpha=text.opacity/100;ctx.font=`${text.weight} ${size}px ${font.family}`;ctx.fillStyle=text.color;ctx.textAlign=text.align;ctx.textBaseline='middle';ctx.letterSpacing=`${text.tracking/100*size}px`;
 if(text.shadow){ctx.shadowColor=`rgba(0,0,0,${text.shadow/120})`;ctx.shadowBlur=size*.18;ctx.shadowOffsetY=size*.04;}
 const lines=text.content.split('\n'),blockWidth=Math.max(...lines.map(line=>ctx.measureText(line).width)),anchor=text.align==='left'?-blockWidth/2:text.align==='right'?blockWidth/2:0;lines.forEach((line,i)=>ctx.fillText(line,anchor,(i-(lines.length-1)/2)*size*1.12));ctx.restore();
}
export function drawImageLayer(ctx:CanvasRenderingContext2D,width:number,height:number,spec:ImageLayer,image:HTMLImageElement){const w=width*spec.width/100,h=w/spec.aspect;ctx.save();ctx.translate(width*spec.x/100,height*spec.y/100);ctx.rotate(spec.rotation*Math.PI/180);ctx.globalAlpha=spec.opacity/100;ctx.globalCompositeOperation=spec.blend==='normal'?'source-over':spec.blend as GlobalCompositeOperation;ctx.filter=`brightness(${spec.brightness}%) contrast(${spec.contrast}%) blur(${spec.blur*width/1000}px)`;ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,Math.min(w,h)*spec.radius/100);ctx.clip();ctx.drawImage(image,-w/2,-h/2,w,h);ctx.restore();}
export async function loadImage(src:string):Promise<HTMLImageElement>{return new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('The image could not be opened.'));i.src=src;});}
export async function renderComposition(state:StudioState,width:number,height:number,time=state.time):Promise<HTMLCanvasElement>{const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;await document.fonts.ready;paintGradient(ctx,width,height,state,time,'export');if(state.image)drawImageLayer(ctx,width,height,state.image,await loadImage(state.image.src));for(const text of state.texts)drawText(ctx,width,height,text);return canvas;}
