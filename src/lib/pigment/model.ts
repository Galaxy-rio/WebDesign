import sourcePresets from '../../data/presets.json' with { type: 'json' };
import sourceColours from '../../data/colours.json' with { type: 'json' };
import prismPresets from '../../data/prism-presets.json' with { type: 'json' };
import textureParameters from '../../data/texture-parameters.json' with { type: 'json' };
import objectParameters from '../../data/object-parameters.json' with { type: 'json' };
import { GLOW_ARRANGEMENTS, GLOW_DEFAULTS } from './glow.ts';
import { LINE_ARRANGEMENTS, LINE_DEFAULTS, LINE_PALETTES } from './lines.ts';
import { MESH_CENTERS } from './fields-colour.ts';
import { FORM_PRESETS, FORM_SHAPES, FORM_DEFAULTS } from './forms.ts';
export const MAX_COLOURS=12;
export type Values = Record<string, number | string>;
export type Point = [number, number];
export interface Parameter { key: string; label: string; min: number; max: number; value: number; unit?: string; step?: number }
export interface Choice { key: string; label: string; value: string; options: string[] }
export interface GradientType { id: string; name: string; family: string; animated?: boolean; parameters: Parameter[]; choices?: Choice[]; grain?: number; speed?: number }
const range=(key:string,label:string,value:number,min=0,max=100,unit='%'):Parameter=>({key,label,value,min,max,unit});
const scale=()=>range('scale','Scale',50);
const choice=(key:string,label:string,value:string,options:string[]):Choice=>({key,label,value,options});
export const TYPES: GradientType[] = [
 {id:'flow',name:'Flow',family:'Fields',animated:true,parameters:[scale(),range('distortion','Distortion',60),range('swirl','Swirl',10)]},
 {id:'sky',name:'Sky',family:'Fields',animated:true,speed:22,grain:4,parameters:[range('scale','Scale',45),range('distortion','Cloud cover',50),range('swirl','Wind',40)],choices:[choice('direction','Direction','Up',['Up','Right','Down','Left'])]},
 {id:'aurora',name:'Aurora',family:'Fields',animated:true,speed:26,parameters:[range('scale','Scale',47),range('distortion','Ribbons',62),range('swirl','Drift',40)],choices:[choice('direction','Direction','Up',['Up','Right','Down','Left'])]},
 {id:'mesh',name:'Mesh',family:'Fields',grain:8,parameters:[]},
 {id:'silk',name:'Silk',family:'Fields',animated:true,speed:0,grain:4,parameters:[range('folds','Folds',7,2,16,''),range('depth','Fold depth',65),range('drape','Drape',65),range('tension','Gather',48),range('angle','Fold angle',32,0,180,'°'),range('scale','Scale',15),range('light','Light angle',25,-70,70,'°'),range('sheen','Lustre',62),range('glow','Highlights',42),range('weave','Weave',45),range('seed','Seed',2,0,996,'')]},
 {id:'still',name:'Still',family:'Fields',parameters:[range('positions','Positions',2),range('waveX','Wave X',100),range('waveXShift','Wave X shift',60),range('waveY','Wave Y',100),range('waveYShift','Wave Y shift',21),range('mixing','Mixing',93),range('grain','Distortion',0),range('rotation','Rotation',270,0,360,'°')]},
 {id:'retro',name:'Retro',family:'Fields',animated:true,speed:22,grain:28,parameters:[]},
 {id:'ios',name:'iOS',family:'Fields',grain:14,parameters:[]},
 {id:'linear',name:'Linear',family:'Strips',parameters:[range('angle','Angle',180,0,360,'°')]},
 {id:'stripes',name:'Stripes',family:'Strips',animated:true,speed:26,parameters:[range('angle','Angle',0,0,180,'°'),range('softness','Softness',14),range('wave','Wave',12)]},
 {id:'bars',name:'Bars',family:'Strips',animated:true,speed:34,parameters:[range('count','Count',7,3,32,''),range('gap','Spread',-20,-50,50,'%')],choices:[choice('envelope','Envelope','Ramp',['Curve','Flat','Ramp'])]},
 {id:'columns',name:'Columns',family:'Strips',animated:true,speed:34,parameters:[range('count','Count',18,3,32,''),range('gap','Spread',-20,-50,50,'%')],choices:[choice('envelope','Envelope','Ramp',['Curve','Flat','Ramp'])]},
 {id:'prism',name:'Prism',family:'Strips',animated:true,speed:40,parameters:[range('count','Strip count',11,3,16,''),range('size','Width',100,40,180,'%'),range('height','Height',60),range('focus','Focus',50),range('position','Position',50),range('blend','Blend',65),range('facets','Facets',35)],choices:[choice('shape','Shape','Crest',['Crest','Valley','Tide','Slant','Lens']),choice('direction','Direction','Up',['Up','Right','Down','Left']),choice('motion','Motion','Expand',['Expand','Gather','Breathe']),choice('reverse','Colour order','Normal',['Normal','Reversed'])]},
 {id:'waves',name:'Waves',family:'Strips',speed:0,parameters:[]},
 {id:'lines',name:'Lines',family:'Strips',animated:true,speed:0,grain:0,parameters:[range('size','Size',100,20,180,'%'),range('width','Thickness',100,10,200,'%'),range('amplitude','Amplitude',100,10,200,'%'),range('curl','Curl',100,10,200,'%'),range('sway','Sway',0),range('body','Body',0),range('angle','Rotation',0,-180,180,'°')],choices:[choice('arrangement','Arrangement','Snake',LINE_ARRANGEMENTS.map(a=>a.name))]},
 {id:'glow',name:'Glow',family:'Objects',speed:0,grain:0,parameters:[range('size','Size',100,20,180,'%'),range('width','Glow width',100,1,200,'%'),range('intensity','Brightness',100,0,200,'%'),range('angle','Light angle',0,-180,180,'°')],choices:[choice('arrangement','Arrangement','Edge',GLOW_ARRANGEMENTS.map(a=>a.name))]},
 {id:'glassy',name:'Glassy',family:'Objects',animated:true,parameters:[scale(),range('cover','Spread',100),range('rings','Cell size',50),range('weave','Frost',50),range('warp','Lens bend',0,-100,100,'%'),range('refract','Refraction',50)],choices:[choice('shape','Tile','Square',['Square','Circle','Hexagon','Clover','Flower','Scallop','Heart','Star','Leaf','Drop'])]},
 {id:'rings',name:'Rings',family:'Objects',parameters:[range('count','Ripple count',12,5,24,''),{...range('dirX','Centre X',0,0,1,''),step:.01},{...range('dirY','Centre Y',0,0,1,''),step:.01},range('melt','Melt',0),range('glow','Glow',100),range('sweep','Sweep',100)]},
 {id:'pixel',name:'Pixel',family:'Objects',animated:true,parameters:[scale(),range('cover','Fill',50),range('rings','Steps',12,2,100,''),range('weave','Weave',20)],choices:[choice('style','Style','Quilt',['Quilt','Glass','Orbs'])]},
 {id:'blocks',name:'Blocks',family:'Objects',parameters:[range('steps','Steps · 0 = colours',0,0,14,''),range('width','Width',50),range('height','Height',50),range('focusX','Focus X',50),range('focusY','Focus Y',50),range('zoom','Zoom',50),range('x','Offset X',50),range('y','Offset Y',50),range('softness','Softness',50)],choices:[choice('direction','Depth','In',['In','Out'])]},
 {id:'beehive',name:'Beehive',family:'Objects',parameters:[scale()],choices:[choice('style','Style','Hive',['Hive','Mosaic'])]},
 {id:'balls',name:'Balls',family:'Objects',parameters:[scale()],choices:[choice('style','Style','Convex',['Convex','Concave'])]},
 {id:'radial',name:'Radial',family:'Objects',parameters:[range('x','Centre X',50),range('y','Centre Y',50),range('radius','Radius',62,1,150,'%')]},
 {id:'conic',name:'Conic',family:'Objects',parameters:[range('angle','Angle',210,0,360,'°'),range('x','Centre X',50),range('y','Centre Y',50)]},
 {id:'forms',name:'Forms',family:'Scenes',parameters:[range('size','Size',FORM_DEFAULTS.size,20,200,'%'),range('x','Position X',FORM_DEFAULTS.x,-30,130,'%'),range('y','Position Y',FORM_DEFAULTS.y,-30,130,'%'),range('rotate','Rotation',FORM_DEFAULTS.rotate,-180,180,'°'),range('stretchX','Stretch X',FORM_DEFAULTS.stretchX,40,180,'%'),range('stretchY','Stretch Y',FORM_DEFAULTS.stretchY,40,180,'%'),range('skew','Skew',FORM_DEFAULTS.skew,-45,45,'°'),range('fade','Edge fade',FORM_DEFAULTS.fade),range('bloom','Bloom',FORM_DEFAULTS.bloom)],choices:[choice('shape','Shape',FORM_DEFAULTS.shape,FORM_SHAPES.map(s=>s.id))]},
 {id:'arch',name:'Arch',family:'Scenes',parameters:[range('width','Width',95,20,100,'%'),range('height','Height',58,20,100,'%'),range('x','Position X',50),range('y','Position Y',62,5,95,'%')]},
 {id:'glint',name:'Glint',family:'Scenes',parameters:[scale(),range('horizon','Horizon',44,10,85,'%')]},
 {id:'mist',name:'Mist',family:'Scenes',parameters:[scale(),range('horizon','Horizon',42,14,62,'%'),range('height','Mountain height',50),range('sharp','Ridges',55),range('haze','Haze',50),range('sun','Sun position',64),range('seed','Seed',7,0,99,'')]},
 {id:'skyline',name:'Skyline',family:'Scenes',parameters:[],choices:[choice('city','City','San Francisco',['San Francisco','New York','Paris','London','Sydney'])]},
 {id:'noise',name:'Noise',family:'Scenes',grain:30,parameters:[range('angle','Angle',32,0,180,'°'),range('stretch','Stretch',62),range('spread','Spread',55)]},
];
export const FAMILIES=['Popular','Fields','Strips','Objects','Scenes'];
export const POPULAR=['flow','sky','aurora','mesh','forms','glow','bars','prism'];
export const FONTS=[{id:'serif',name:'Fraunces',family:'Fraunces, Georgia, serif'},{id:'sans',name:'DM Sans',family:'"DM Sans", Arial, sans-serif'},{id:'grotesk',name:'Space Grotesk',family:'"Space Grotesk", Arial, sans-serif'},{id:'hand',name:'Caveat',family:'Caveat, cursive'},{id:'mono',name:'Monospace',family:'monospace'}];
export const FRAME_OPTIONS=[{id:'free',name:'Fit canvas',ratio:0},{id:'landscape',name:'Landscape · 16:10',ratio:1.6},{id:'square',name:'Square · 1:1',ratio:1},{id:'portrait',name:'Portrait · 4:5',ratio:.8},{id:'story',name:'Story · 9:16',ratio:9/16},{id:'wide',name:'Wallpaper · 16:9',ratio:16/9}];
const sourceTypes:Record<string,string>={FLOW:'flow',SKY:'sky',AURORA:'aurora',AIR:'mesh',SILK:'silk',SMESH:'still',RETRO:'retro',IOS:'ios',LINEAR:'linear',STRIPE:'stripes',BARS:'bars',COLS:'columns',PRISM:'prism',PRISM2:'prism',WAVE:'waves',LINE:'lines',GLOW:'glow',GLASSY:'glassy',RING:'rings',PIXEL:'pixel',CUBE:'blocks',BEEHIVE:'beehive',BALLS:'balls',CIRCLE:'radial',ANGULAR:'conic',SHAPES:'forms',ARCH:'arch',GLINT:'glint',MIST:'mist',SKYLINE:'skyline',CNOISE:'noise'};
export interface Preset { name:string; type:string; colors:string[]; params:Values; speed?:number; grain?:number; soften?:number; points?:Point[]; divisions?:number[] }
export const PRESETS:Preset[]=(sourcePresets as Preset[]).map(p=>({...p,type:sourceTypes[p.type]??'flow',params:{...((p.type==='BARS'||p.type==='COLS')?{gap:-20}:{}),...Object.fromEntries(Object.entries(p.params).filter(([,v])=>typeof v==='number'||typeof v==='string'))} as Values,points:p.points?.map(p=>[p[0]/100,p[1]/100] as Point)}));
const waveDivisions:Record<string,number[]>={
 'Blue ocean waves':[.22,.42,.72], 'Sunset sea':[.16,.36,.62,.84],
 'Rose dawn':[.18,.4,.66,.86], 'Lavender dusk':[.16,.38,.64,.86],
 'Moonlit swell':[.18,.4,.66,.87], 'Matcha hills':[.18,.4,.66,.86],
 'Golden dunes':[.18,.42,.68,.88], 'Ink tide':[.3,.64],
};
for(const preset of PRESETS)if(preset.type==='waves')preset.divisions=waveDivisions[preset.name];
PRESETS.push(...FORM_PRESETS.map(p=>({...p,type:'forms',speed:0})));
PRESETS.push(...GLOW_ARRANGEMENTS.map(a=>({name:a.name,type:'glow',colors:a.colors,params:{...GLOW_DEFAULTS,arrangement:a.name},speed:0,grain:0,soften:0})));
for(const data of textureParameters){const preset=PRESETS.find(p=>p.name===data.name&&p.type===data.type);if(preset)Object.assign(preset.params,data.params);}
for(const data of objectParameters){const preset=PRESETS.find(p=>p.name===data.name&&p.type===data.type);if(preset){Object.assign(preset.params,data.params);if(data.soften!==undefined)preset.soften=data.soften;if(data.grain!==undefined)preset.grain=data.grain;if(data.divisions)preset.divisions=data.divisions;}}
for(let i=PRESETS.length-1;i>=0;i--)if(PRESETS[i].type==='lines')PRESETS.splice(i,1);
PRESETS.push(...LINE_ARRANGEMENTS.map(a=>({name:a.name,type:'lines',colors:LINE_PALETTES[0].colors,params:{...LINE_DEFAULTS,arrangement:a.name},speed:0,grain:0,soften:0})));
export const COLOURS=sourceColours;
// The current Prism collection precedes the older six palettes still kept for saved designs.
PRESETS.unshift(...prismPresets.map(p=>({name:p.name,type:'prism',colors:p.colors,params:{},speed:40,grain:6,soften:0})));
export interface TextLayer { id:string; content:string; font:string; size:number; weight:number; color:string; x:number; y:number; rotation:number; opacity:number; tracking:number; align:'left'|'center'|'right'; shadow:number }
export interface ImageLayer { src:string; name:string; x:number; y:number; width:number; rotation:number; opacity:number; radius:number; blend:string; brightness:number; contrast:number; blur:number; aspect:number }
export interface StudioState { version:1; name:string; type:string; colors:string[]; divisions:number[]; points:Point[]; params:Values; speed:number; soften:number; grain:number; frame:string; time:number; seed:number; texts:TextLayer[]; image:ImageLayer|null }
export const INITIAL_TIME=20.75;
export const uid=()=>globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const clamp=(n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));
export const typeById=(id:string)=>TYPES.find(t=>t.id===id)??TYPES[0];
export const defaultParams=(id:string):Values=>{const t=typeById(id);return Object.fromEntries([...t.parameters.map(p=>[p.key,p.value]),...(t.choices??[]).map(p=>[p.key,p.value])]);};
export const equalDivisions=(count:number)=>Array.from({length:count-1},(_,i)=>(i+1)/count);
export function defaultPoints(count:number):Point[]{return Array.from({length:count},(_,i)=>{const phase=i*.37;return [.5+.5*Math.sin(INITIAL_TIME*(.6+(i/3%1)*.9)+phase),.5+.5*Math.cos(INITIAL_TIME*(.8+((i+1)/4%1))+phase*1.5)];});}
export function controlPoints(state:StudioState):Point[]{
 if(state.points.length)return state.points;
 if(state.type==='mesh')return state.colors.map((_,i)=>[...MESH_CENTERS[i%MESH_CENTERS.length]] as Point);
 const points=defaultPoints(state.colors.length);
 if(state.type!=='flow')return points;
 const scale=.4+Number(state.params.scale??50)/100*1.2;
 return points.map(([x,y])=>[(x-.5)*scale+.5,(y-.5)*scale+.5]);
}
export function createText(content='Your words.'):TextLayer{return{id:uid(),content,font:'serif',size:10,weight:400,color:'#292635',x:50,y:50,rotation:0,opacity:100,tracking:-3,align:'center',shadow:0};}
export function initialState():StudioState{return {version:1,name:'Iridescent cloud',type:'flow',colors:['#EAF4FC','#1E50A2','#F09199','#895B8A'],divisions:equalDivisions(4),points:[],params:defaultParams('flow'),speed:30,soften:0,grain:6,frame:'free',time:INITIAL_TIME,seed:2,texts:[createText('Solitude')],image:null};}
export function applyPreset(state:StudioState,preset:Preset):StudioState{
 const kind=typeById(preset.type);const params=defaultParams(kind.id);
 const aliases:Record<string,string>=kind.id==='silk'?{drape:'warp',tension:'streak',weave:'thread'}:kind.id==='blocks'?{width:'w',height:'h',focusX:'fx',focusY:'fy',softness:'soft',x:'ox',y:'oy'}:{};
 for(const p of kind.parameters){const v=preset.params[p.key]??preset.params[aliases[p.key]];if(typeof v==='number')params[p.key]=clamp(v,p.min,p.max);}
 for(const p of kind.choices??[]){const v=preset.params[p.key];if(typeof v==='string'){const match=p.options.find(o=>o.toLowerCase()===v.toLowerCase());if(match)params[p.key]=match;}}
 if(kind.id==='blocks'&&typeof preset.params.dir==='string')params.direction=preset.params.dir.toLowerCase()==='out'?'Out':'In';
 if(['sky','aurora'].includes(kind.id)&&typeof preset.params.dir==='number')params.direction=['Up','Right','Down','Left'][Math.round(preset.params.dir)]??'Up';
 if(kind.id==='pixel'){
  const defaults=params.style==='Orbs'?{cover:4,rings:100,weave:45}:params.style==='Glass'?{cover:50,rings:12,weave:20}:{cover:50,rings:12,weave:20};
  for(const [key,value] of Object.entries(defaults))if(typeof preset.params[key]!=='number')params[key]=value;
 }
 return {...state,name:preset.name,type:kind.id,colors:[...preset.colors],divisions:preset.divisions??equalDivisions(preset.colors.length),points:preset.points??[],params,speed:kind.animated?(preset.speed??kind.speed??30):0,grain:preset.grain??kind.grain??6,soften:preset.soften??0,time:INITIAL_TIME};
}
const additionalColourNames:Record<string,string>={'#121519':'Water silk','#22406F':'Inked lapis','#345CB5':'Lagoon blue','#3480D8':'Clear hanada','#34B2D7':'Glazed azure','#A8F0C8':'Young willow'};
export const colourName=(hex:string)=>COLOURS.find(c=>c.hex.toUpperCase()===hex.toUpperCase())?.name??additionalColourNames[hex.toUpperCase()]??'Custom colour';
export function rgb(hex:string):[number,number,number]{return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)];}
export function luminance(hex:string){const channels=rgb(hex).map(c=>{const s=c/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;}
export function contrastRatio(a:string,b:string){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
export function inkFor(hex:string){return contrastRatio(hex,'#25212C')>=contrastRatio(hex,'#FFFFFF')?'#25212C':'#FFFFFF';}
export function hue(hex:string){const [r,g,b]=rgb(hex).map(c=>c/255);const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;if(d<.04)return -1;return ((max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60+360)%360;}
export function colourFamily(hex:string){const h=hue(hex);return h<0?'Neutral':h<18||h>=345?'Red':h<47?'Orange':h<72?'Yellow':h<165?'Green':h<200?'Teal':h<260?'Blue':h<300?'Purple':'Pink';}
const isHex=(v:unknown):v is string=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v);
const num=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?clamp(v,min,max):fallback;
export function normalizeState(input:unknown):StudioState {
 if(!input||typeof input!=='object')throw new Error('This is not a Pigment Studio design.');
 const s=input as Partial<StudioState>;
 if(s.version!==1||!TYPES.some(t=>t.id===s.type)||!Array.isArray(s.colors)||s.colors.length<2||s.colors.length>MAX_COLOURS||!s.colors.every(isHex))throw new Error('This design has an unsupported format.');
 // Upgrade the earlier placeholder Glow/Lines controls while keeping user layers.
 if((s.type==='glow'||s.type==='lines')&&s.params?.arrangement===undefined){
  const preset=PRESETS.find(p=>p.type===s.type)!;
  const upgraded=applyPreset({...initialState(),...s} as StudioState,preset);
  return normalizeState(upgraded);
 }
 const type=typeById(s.type!),base=initialState(),params=defaultParams(type.id);
 for(const p of type.parameters)params[p.key]=num(s.params?.[p.key],p.value,p.min,p.max);
 for(const p of type.choices??[]){let v=s.params?.[p.key];if((type.id==='bars'||type.id==='columns')&&p.key==='envelope'&&v==='Smooth')v='Curve';params[p.key]=typeof v==='string'&&p.options.includes(v)?v:p.value;}
 const divs=s.divisions;const validDivs=Array.isArray(divs)&&divs.length===s.colors.length-1&&divs.every((v,i)=>typeof v==='number'&&v>0&&v<1&&(i===0||v>divs[i-1]+.005));
 const texts=(Array.isArray(s.texts)?s.texts:[]).slice(0,12).filter(t=>t&&typeof t==='object').map(t=>({id:uid(),content:String(t.content??'').slice(0,1000),font:FONTS.some(f=>f.id===t.font)?t.font:'serif',size:num(t.size,10,1,50),weight:num(t.weight,400,300,800),color:isHex(t.color)?t.color:'#292635',x:num(t.x,50,-30,130),y:num(t.y,50,-30,130),rotation:num(t.rotation,0,-180,180),opacity:num(t.opacity,100,0,100),tracking:num(t.tracking,-3,-10,30),align:(['left','center','right'].includes(t.align)?t.align:'center') as TextLayer['align'],shadow:num(t.shadow,0,0,100)}));
 let image:ImageLayer|null=null;
 if(s.image&&typeof s.image.src==='string'&&s.image.src.length<2800000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(s.image.src)){const i=s.image;image={src:i.src,name:String(i.name??'Image').slice(0,120),x:num(i.x,50,-50,150),y:num(i.y,50,-50,150),width:num(i.width,45,5,180),rotation:num(i.rotation,0,-180,180),opacity:num(i.opacity,100,0,100),radius:num(i.radius,0,0,50),blend:['normal','multiply','screen','overlay','soft-light','luminosity'].includes(i.blend)?i.blend:'normal',brightness:num(i.brightness,100,0,200),contrast:num(i.contrast,100,0,200),blur:num(i.blur,0,0,30),aspect:num(i.aspect,1,.05,20)};}
 return {...base,name:String(s.name??'Untitled blend').slice(0,100),type:type.id,colors:s.colors.map(c=>c.toUpperCase()),divisions:validDivs?[...divs]:equalDivisions(s.colors.length),points:Array.isArray(s.points)&&s.points.length===s.colors.length?s.points.map(p=>[num(p?.[0],.5,-.5,1.5),num(p?.[1],.5,-.5,1.5)]):[],params,speed:num(s.speed,30,0,100),soften:num(s.soften,0,0,80),grain:num(s.grain,6,0,100),frame:FRAME_OPTIONS.some(f=>f.id===s.frame)?s.frame!:'free',time:num(s.time,INITIAL_TIME,0,1e8),seed:num(s.seed,2,0,100000),texts,image};
}
export function encodeDesign(state:StudioState):string{const text=JSON.stringify({...state,image:null});const bytes=new TextEncoder().encode(text);let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);return btoa(binary).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export function decodeDesign(value:string):StudioState{if(value.length>48000)throw new Error('This shared design is too large.');try{const raw=atob(value.replaceAll('-','+').replaceAll('_','/'));return normalizeState(JSON.parse(new TextDecoder().decode(Uint8Array.from(raw,c=>c.charCodeAt(0)))));}catch{throw new Error('This link does not contain a valid Pigment Studio design.');}}
export function weightsFor(state:StudioState){const bounds=[0,...state.divisions,1];return state.colors.map((_,i)=>Math.max(.01,bounds[i+1]-bounds[i])*state.colors.length);}
