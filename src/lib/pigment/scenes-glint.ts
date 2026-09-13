import { TAU, clamp, fract, lab, fromLab, mix, colourStops, type RGB } from './fields-colour.ts';
import type { StudioState } from './model.ts';

type Point=[number,number];
export interface Glint {x:number;y:number;rx:number;ry:number;opacity:number;colour:number;softness:number}
export interface WaterRidge {shadow:Point[];highlight:Point[];shadowWidth:number;highlightWidth:number;shadowOpacity:number;highlightOpacity:number}
export type CanvasFactory=()=>HTMLCanvasElement;
const SOFTNESS=[.55,.68,.8,.9],TONE_WEIGHTS=[3,7,17,30,39,4],OPACITY_RANGES=[[.95,1],[.9,1],[.82,.96],[.7,.9],[.55,.78],[.4,.62]],MAX_GLINTS=4200;
const rgbCss=(c:RGB,alpha?:number)=>alpha===undefined?`rgb(${c.join(',')})`:`rgba(${c.join(',')},${alpha})`;
const blend=(a:string,b:string,t:number)=>fromLab(mix(lab(a),lab(b),t));

/** Six ordered light-to-deep reflection tones from the reference S0 palette. */
export function glintPalette(colors:string[]):RGB[] {const first=colors[0],mid=colors[Math.min(colors.length-1,Math.round((colors.length-1)*.6))],last=colors.at(-1)!;return [blend('#FFFFFF',first,.12),blend('#FFFFFF',first,.42),blend(first,mid,.25),blend(first,mid,.5),blend(first,mid,.72),blend(mid,last,.4)];}
function randomGenerator(seed:number):()=>number {let state=seed|0;return ()=>{state=state+1831565813|0;let n=Math.imul(state^state>>>15,1|state);n=n+Math.imul(n^n>>>7,61|n)^n;return ((n^n>>>14)>>>0)/4294967296;};}
const ridgeCount=(scale:number)=>Math.round(14+clamp(scale,0,100)/100*22);
const ridgeDepth=(index:number,count:number)=>.02+.98*(1-(index+.5)/count)**1.5;
function ridgeData(index:number) {const random=randomGenerator(40503^Math.imul(index+1,2654435761));return {amplitude:random(),frequency:1+Math.floor(random()*4),phase:random()*TAU,width:random(),shadow:random(),highlight:random(),glintFrequency:2+Math.floor(random()*4),glintPhase:random()*TAU};}
function ridgeY(index:number,count:number,horizon:number,x:number):number {const depth=ridgeDepth(index,count),p=ridgeData(index),amplitude=(.004+p.amplitude*.016)*depth**1.2;return horizon+(1-horizon-.004)*depth+amplitude*Math.sin(x*TAU*p.frequency+p.phase);}
function reflection(x:number,depth:number):number {const spread=.085+.42*depth**1.15,distance=Math.abs(x-.5)/spread;return .24+.76*Math.exp(-(distance**2.1));}
function chooseTone(random:()=>number,strength:number):number {let pick=random()*TONE_WEIGHTS.reduce((a,b)=>a+b,0)*(1-.5*strength);for(let i=0;i<TONE_WEIGHTS.length;i++){if(pick<TONE_WEIGHTS[i])return i;pick-=TONE_WEIGHTS[i];}return TONE_WEIGHTS.length-1;}

/** Perspective water ridges. Their geometry is reused for shadow and reflected light. */
export function glintRidges(width:number,height:number,scale=50,horizon=.44):WaterRidge[] {
 const count=ridgeCount(scale),ridges:WaterRidge[]=[];
 for(let i=0;i<count;i++){const depth=ridgeDepth(i,count);if(depth<.1)continue;const p=ridgeData(i),fade=clamp((depth-.1)/.25),thickness=height*(.012+.022*p.width)*(.2+.9*depth),shadow:Point[]=[],highlight:Point[]=[];
  for(let j=0;j<=64;j++){const x=j/64,y=ridgeY(i,count,horizon,x)*height;shadow.push([x*width,y+thickness*.55]);highlight.push([x*width,y-thickness*.22]);}
  ridges.push({shadow,highlight,shadowWidth:thickness*1.15,highlightWidth:thickness*.65,shadowOpacity:(.09+.08*p.shadow)*fade,highlightOpacity:(.07+.07*p.highlight)*fade});
 }return ridges;
}

/** Original bounded seeded sampler: larger near-field glints, tight distant bands. */
export function glintParticles(width:number,height:number,scale=50,horizon=.44):Glint[] {
 const shortest=Math.min(width,height),density=clamp(scale,0,100),count=ridgeCount(density),rate=.35+density/100*.85,unit=shortest*.012,gap=shortest*.0075/rate,perRow=Math.round(36+density/100*64),random=randomGenerator(20973^Math.round(scale*2654435)),result:Glint[]=[];
 const add=(x:number,y:number,ry:number,rx:number,opacity:number,colour:number,softness?:number)=>{if(result.length>=MAX_GLINTS)return;if(softness===undefined){const r=.5+random()*.32;softness=r<.6?0:r<.74?1:2;}result.push({x:x*width,y:y*height,rx,ry,opacity,colour,softness});};
 for(let row=0;row<count&&result.length<MAX_GLINTS;row++){const depth=ridgeDepth(row,count),p=ridgeData(row);let x=random()*.03,added=0;
  while(x<1&&result.length<MAX_GLINTS&&added<perRow){const crest=.5+.5*Math.sin(x*TAU*p.glintFrequency+p.glintPhase),column=reflection(x,depth),variation=.55+random()*random()*.85+(random()<.07?random()*.35:0),radius=Math.max(.4,unit*variation*(.34+.62*depth**.9)),spacing=(.95+(1-crest)*.9+random()*.45)/rate;
   if(random()<column*(.9+.1*crest)){const y=ridgeY(row,count,horizon,x)+(random()-.5)*(unit/shortest)*1.3*depth;
    if(y>horizon&&y<.995){const colour=chooseTone(random,Math.min(1,column*(.55+.45*(1-depth)))),[lo,hi]=OPACITY_RANGES[colour],opacity=Math.min(1,(lo+random()*(hi-lo))*(.42+.58*column)*(.85+.15*crest)),elongation=Math.min(2.1,(1.05+1.1*(1-depth)**2)*(.88+random()*.35)),rx=radius*elongation;
     if(colour<=2){const bloom=1.7+random()*.6;add(x,y,radius*bloom,rx*bloom,opacity*(.14+random()*.1),colour,0);}
     add(x,y,radius,rx,opacity,colour);
     if(colour<=1&&column>.7&&random()<.32){const pin=radius*(.36+random()*.2);add(x,y,pin*.36,pin*(2.6+random()*1.8),Math.min(1,opacity*.85),0,0);add(x,y,pin,pin*(1.1+random()*.3),Math.min(1,opacity*1.4+.18),0,3);}added++;
    }
   }x+=Math.max(gap,2*radius*spacing)/width;
  }
 }
 const dust=Math.round((.15+.85*(density/100))*count*16);
 for(let i=0;i<dust&&result.length<MAX_GLINTS;i++){const depth=.02+.98*random()**1.5,y=horizon+(1-horizon-.01)*depth;if(y<=horizon)continue;const x=random(),column=reflection(x,depth);if(random()>column*.85)continue;
  const colour=4+(random()<.3?1:0),[lo,hi]=OPACITY_RANGES[colour],radius=Math.max(.35,unit*(.15+.55*depth)*(.4+random()*.6)),opacity=Math.min(.72,(lo+random()*(hi-lo))*.8*(.4+.6*column));add(x,y,radius,radius*Math.min(1.9,1+(1-depth)*1.1),opacity,colour);
 }return result.sort((a,b)=>a.opacity-b.opacity);
}

/** A repeatable 4px alternating warp/weft tile; opacity is applied by soft-light. */
export function glintWeavePixels(size=128):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(size*size*4),hash=(x:number,y:number)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const u=x%4/4,v=y%4/4,vertical=(Math.floor(x/4)+Math.floor(y/4))%2===0,sx=Math.sin(u*Math.PI),sy=Math.sin(v*Math.PI);
  let thread=vertical?(sy-.5)*.9+(sx-.5)*.25:(sx-.5)*.9+(sy-.5)*.25;thread+=(hash(x,y)-.5)*.35;thread+=(hash(Math.floor(x/8),y)-.5)*.18;
  const c=clamp(128+thread*34,0,255),offset=(y*size+x)*4;out[offset]=out[offset+1]=out[offset+2]=c;out[offset+3]=255;
 }return out;
}

let weaveCanvas:HTMLCanvasElement|undefined;
function weaveTile(factory:CanvasFactory):HTMLCanvasElement {if(weaveCanvas)return weaveCanvas;const tile=factory();tile.width=tile.height=128;const context=tile.getContext('2d')!;const image=context.createImageData(128,128);image.data.set(glintWeavePixels());context.putImageData(image,0,0);weaveCanvas=tile;return tile;}

/** Native Canvas implementation of the original glint export/preview composition. */
export function paintGlint(ctx:CanvasRenderingContext2D,width:number,height:number,state:StudioState,factory:CanvasFactory=()=>document.createElement('canvas')):void {
 const colors=state.colors,scale=Number(state.params.scale??50),horizon=clamp(Number(state.params.horizon??44)/100,.05,.95),tones=glintPalette(colors),gradient=ctx.createLinearGradient(0,0,0,height);
 for(const [stop,color] of colourStops(colors,state.divisions))gradient.addColorStop(stop,rgbCss(color));ctx.save();ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
 const weave=(alpha:number)=>{const pattern=ctx.createPattern(weaveTile(factory),'repeat');if(!pattern)return;ctx.save();ctx.globalCompositeOperation='soft-light';ctx.globalAlpha=alpha;ctx.fillStyle=pattern;ctx.fillRect(0,0,width,height);ctx.restore();};weave(1);
 const horizonY=horizon*height,horizonColour=blend(colors[Math.min(colors.length-1,Math.round((colors.length-1)*.55))],'#000000',.05);
 const waterline=ctx.createLinearGradient(0,horizonY,0,horizonY+height*.016);waterline.addColorStop(0,rgbCss(horizonColour,.16));waterline.addColorStop(1,rgbCss(horizonColour,0));ctx.fillStyle=waterline;ctx.fillRect(0,horizonY,width,height*.016);
 ctx.save();ctx.beginPath();ctx.rect(0,horizonY-height*.004,width,height*.12);ctx.clip();ctx.filter=`blur(${(height*.006).toFixed(1)}px)`;ctx.translate(width*.5,horizonY);const haloRadius=width*.46;ctx.scale(1,.11*height/haloRadius);
 const halo=ctx.createRadialGradient(0,0,0,0,0,haloRadius);halo.addColorStop(0,rgbCss(tones[0],.5));halo.addColorStop(.35,rgbCss(tones[1],.22));halo.addColorStop(1,rgbCss(tones[2],0));ctx.fillStyle=halo;ctx.fillRect(-2*width,-2*height,4*width,4*height);ctx.restore();
 const ridges=glintRidges(width,height,scale,horizon),shadow=blend(colors.at(-1)!,'#000000',.22);
 ctx.save();ctx.filter=`blur(${(height*.005).toFixed(1)}px)`;ctx.lineCap='round';
 const stroke=(points:Point[],color:RGB,thickness:number,alpha:number)=>{ctx.globalAlpha=alpha;ctx.strokeStyle=rgbCss(color);ctx.lineWidth=thickness;ctx.beginPath();points.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));ctx.stroke();};
 for(const ridge of ridges)stroke(ridge.shadow,shadow,ridge.shadowWidth,ridge.shadowOpacity);for(const ridge of ridges)stroke(ridge.highlight,tones[2],ridge.highlightWidth,ridge.highlightOpacity);ctx.restore();
 for(const point of glintParticles(width,height,scale,horizon)){const color=tones[point.colour];ctx.save();ctx.translate(point.x,point.y);ctx.scale(1,point.ry/point.rx);const shine=ctx.createRadialGradient(0,0,0,0,0,point.rx);shine.addColorStop(0,rgbCss(color,point.opacity));shine.addColorStop(SOFTNESS[point.softness],rgbCss(color,point.opacity));shine.addColorStop(1,rgbCss(color,0));ctx.fillStyle=shine;ctx.beginPath();ctx.arc(0,0,point.rx,0,TAU);ctx.fill();ctx.restore();}
 weave(.4);ctx.restore();
}

/** Factory injection permits a real native canvas in Node without a DOM shim. */
export function glintPixels(width:number,height:number,state:StudioState,factory:CanvasFactory):Uint8ClampedArray<ArrayBuffer> {const canvas=factory();canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!;paintGlint(ctx,width,height,state,factory);return new Uint8ClampedArray(ctx.getImageData(0,0,width,height).data);}
