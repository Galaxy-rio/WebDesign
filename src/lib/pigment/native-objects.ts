import { referenceCentres, referenceStops, mixReferenceColour as blend } from './reference-fields.ts';
import { luminance } from './fields-colour.ts';
import type { StudioState, Values } from './model.ts';

const clamp=(n:number,min=0,max=1)=>Math.max(min,Math.min(max,n));
const number=(p:Values,key:string,fallback:number)=>Number(p[key]??fallback);
const rgba=(color:string,opacity:number)=>`rgba(${[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)).join(',')},${opacity})`;
const noise=(x:number,y:number,seed:number)=>{const n=Math.sin(x*127.1+y*311.7+seed*74.7)*43758.5453;return n-Math.floor(n);};
function fill(ctx:CanvasRenderingContext2D,w:number,h:number,color:string|CanvasGradient){ctx.fillStyle=color;ctx.fillRect(0,0,w,h);}
function addStops(gradient:CanvasGradient,stops:[string,number][]){for(const [color,offset] of stops)gradient.addColorStop(clamp(offset),color);return gradient;}
function ramp(state:StudioState){return referenceStops(state.colors,referenceCentres(state.colors,state.divisions));}
function normalizedSquare(ctx:CanvasRenderingContext2D,w:number,h:number){const scale=Math.max(w,h)/100;ctx.translate((w-100*scale)/2,(h-100*scale)/2);ctx.scale(scale,scale);}
function sampleColour(colors:string[],divisions:number[],t:number):string {
 const centres=referenceCentres(colors,divisions);if(t<=centres[0])return colors[0];if(t>=centres.at(-1)!)return colors.at(-1)!;
 let i=0;while(t>centres[i+1])i++;return blend(colors[i],colors[i+1],(t-centres[i])/(centres[i+1]-centres[i]));
}
export type ObjectCanvasFactory=()=>HTMLCanvasElement;

export const NATIVE_OBJECT_TYPES=['linear','radial','conic','blocks','balls','beehive','noise','arch'];

/** Same band positions as the reference: radial endpoints extend to 88%,
 * and conic colours return along a mirrored ramp without a wrap seam. */
export function basicStops(state:StudioState):[string,number][]{
 const centres=referenceCentres(state.colors,state.divisions);
 if(state.type==='radial'){
  const start=centres[0],span=centres.at(-1)!-start;
  return [...referenceStops(state.colors,centres.map(v=>(v-start)/span*.88),true),[state.colors.at(-1)!,1]];
 }
 if(state.type==='conic')return referenceStops([...state.colors,...state.colors.slice(0,-1).reverse()],[...centres.map(v=>v*.5),...centres.slice(0,-1).reverse().map(v=>1-v*.5)]);
 return ramp(state);
}

export function paintBasic(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState){
 const p=state.params;let gradient:CanvasGradient;
 if(state.type==='radial'){
  const x=w*number(p,'x',50)/100,y=h*number(p,'y',50)/100,r=Math.max(.001,Math.min(w,h)*number(p,'radius',62)/100);
  gradient=ctx.createRadialGradient(x,y,0,x,y,r);
 }else if(state.type==='conic'){
  const x=w*number(p,'x',50)/100,y=h*number(p,'y',50)/100,extent=Math.hypot(w,h)*2;
  ctx.save();ctx.translate(x,y);ctx.rotate((number(p,'angle',210)-90)*Math.PI/180);
  gradient=ctx.createConicGradient(0,0,0);ctx.fillStyle=addStops(gradient,basicStops(state));ctx.fillRect(-extent,-extent,extent*2,extent*2);ctx.restore();return;
 }else{
  const angle=number(p,'angle',180)*Math.PI/180,dx=Math.sin(angle),dy=-Math.cos(angle),span=Math.abs(dx)*w+Math.abs(dy)*h;
  gradient=ctx.createLinearGradient(w/2-dx*span/2,h/2-dy*span/2,w/2+dx*span/2,h/2+dy*span/2);
 }
 fill(ctx,w,h,addStops(gradient,basicStops(state)));
}

export interface BlockLayer { x:number;y:number;width:number;height:number;color:string }
export function blockLayers(state:StudioState):{background:string;layers:BlockLayer[]}{
 const p=state.params,source=state.colors;
 const invert=(String(p.direction??'In').toLowerCase()==='in')!==(luminance(source.at(-1)!)<=luminance(source[0]));
 const colors=invert?[...source].reverse():source,divisions=invert?state.divisions.map(v=>1-v).reverse():state.divisions;
 const edges=[0,...divisions,1],count=number(p,'steps',0)>=2?clamp(Math.round(number(p,'steps',0)),2,14):colors.length-1;
 const between=(position:number)=>{const v=clamp(position)*(edges.length-1),i=Math.min(edges.length-2,Math.floor(v));return edges[i]+(edges[i+1]-edges[i])*(v-i);};
 const dimensions=(i:number)=>{const span=Math.round(84*(1-between(i/(count+1))));return [Math.min(96,span*(.55+.9*number(p,'width',50)/100)),Math.min(96,span*(.55+.9*number(p,'height',50)/100))];};
 const [firstW,firstH]=dimensions(1),maxZoom=Math.max(1,100/firstW,100/firstH),zoom=number(p,'zoom',50),factor=zoom<=50?.4+.6*zoom/50:1+(maxZoom-1)*(zoom-50)/50;
 const layers:BlockLayer[]=[];
 for(let i=1;i<=count;i++){
  const [sw,sh]=dimensions(i),width=sw*factor,height=sh*factor,step=i/count;
  const constrain=(center:number,size:number)=>size>=100?center:clamp(center,size/2,100-size/2);
  const x=constrain(50+(number(p,'focusX',50)-50)*step,width)+number(p,'x',50)-50;
  const y=constrain(50+(number(p,'focusY',50)-50)*step,height)+number(p,'y',50)-50;
  const color=number(p,'steps',0)<2?colors[i]:sampleColour(colors,divisions,between((i+.5)/(count+1)));
  layers.push({x,y,width:Math.abs(width-100)<.1?100.1:width,height:Math.abs(height-100)<.1?100.1:height,color});
 }
 return {background:colors[0],layers};
}
function paintBlocks(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState){
 const {background,layers}=blockLayers(state);fill(ctx,w,h,background);ctx.save();
 ctx.filter=`blur(${Math.max(w,h)*.012*number(state.params,'softness',50)/50}px)`;
 for(const layer of layers){ctx.fillStyle=layer.color;ctx.fillRect((layer.x-layer.width/2)/100*w,(layer.y-layer.height/2)/100*h,layer.width/100*w,layer.height/100*h);}
 ctx.restore();
}

type Hex={x:number;y:number;column:number;row:number;color:string};
export function honeycombLayout(state:StudioState){
 const mosaic=String(state.params.style).toLowerCase()==='mosaic',r=4+.06*clamp(number(state.params,'scale',50),0,100),stepX=mosaic?1.5*r:Math.sqrt(3)*r,stepY=mosaic?Math.sqrt(3)*r:1.5*r;
 const tiles:Hex[]=[];
 for(let row=-1;row<=Math.ceil(100/stepY)+2;row++)for(let column=-1;column<=Math.ceil(100/stepX)+2;column++){
  const x=column*stepX+(!mosaic&&(row&1)?stepX/2:0),y=row*stepY+(mosaic&&(column&1)?stepY/2:0);
  const variance=Math.round((noise(column,row,mosaic?7:11)-.5)*2*(mosaic?14:5));
  const sampled=sampleColour(state.colors,state.divisions,clamp((x+y)/200));
  const color=[1,3,5].map(i=>Math.round(clamp(parseInt(sampled.slice(i,i+2),16)+variance,0,255)).toString(16).padStart(2,'0')).join('');
  tiles.push({x,y,column,row,color:'#'+color});
 }
 return {r,tiles,mosaic};
}
function hexPath(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,mosaic:boolean){ctx.beginPath();for(let i=0;i<6;i++){const a=(mosaic?0:-Math.PI/2)+i*Math.PI/3,px=x+r*Math.cos(a),py=y+r*Math.sin(a);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();}
function paintBeehive(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState){
 fill(ctx,w,h,state.colors[0]);ctx.save();normalizedSquare(ctx,w,h);const {r,tiles,mosaic}=honeycombLayout(state);ctx.lineJoin='round';
 const vertical=(tile:Hex,stops:[string,number][])=>addStops(ctx.createLinearGradient(tile.x,tile.y-r,tile.x,tile.y+r),stops);
 for(const tile of tiles){hexPath(ctx,tile.x,tile.y,r,mosaic);ctx.fillStyle=tile.color;ctx.fill();if(mosaic){ctx.lineWidth=.35;ctx.strokeStyle=tile.color;ctx.stroke();}}
 for(const tile of tiles){
  hexPath(ctx,tile.x,tile.y,r,mosaic);
  if(mosaic){const directions=[[0,0,0,1],[0,0,1,.3],[1,0,0,.9]],d=directions[Math.min(2,Math.floor(noise(tile.column,tile.row,3)*3))];const g=ctx.createLinearGradient(tile.x-r+d[0]*r*2,tile.y-r*Math.sqrt(3)/2+d[1]*r*Math.sqrt(3),tile.x-r+d[2]*r*2,tile.y-r*Math.sqrt(3)/2+d[3]*r*Math.sqrt(3));ctx.fillStyle=addStops(g,[['#ffffff1c',0],['#ffffff00',.48],['#00000000',.58],['#0000001c',1]]);ctx.fill();}
  else{
   ctx.fillStyle=vertical(tile,[['#ffffff33',0],['#ffffff00',.46],['#00000000',.56],['#0000003d',1]]);ctx.fill();
   hexPath(ctx,tile.x,tile.y,r*.86,false);ctx.fillStyle=addStops(ctx.createLinearGradient(tile.x,tile.y-r*.86,tile.x,tile.y+r*.86),[['#00000057',0],['#0000000f',.52],['#ffffff24',1]]);ctx.fill();
   ctx.strokeStyle=addStops(ctx.createLinearGradient(tile.x,tile.y-r*.86,tile.x,tile.y+r*.86),[['#ffffff66',0],['#ffffff1a',.55],['#ffffff00',1]]);ctx.lineWidth=r*.07;ctx.stroke();
  }
 }ctx.restore();
}

function paintBalls(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState){
 fill(ctx,w,h,addStops(ctx.createLinearGradient(0,0,w,h),ramp(state)));ctx.save();normalizedSquare(ctx,w,h);
 const cols=Math.round(6+.34*clamp(number(state.params,'scale',50),0,100)),step=100/cols,spacing=step*.866,r=step*.47,centres:{x:number;y:number}[]=[];
 for(let row=-1;row<=Math.ceil(100/spacing)+1;row++)for(let col=-1;col<=cols;col++)centres.push({x:col*step+(row&1?step/2:0)+step/2,y:row*spacing+spacing/2});
 const layer=(mode:GlobalCompositeOperation,radius:number,cx:number,cy:number,extent:number,stops:[string,number][],ox=0,oy=0)=>{
  ctx.globalCompositeOperation=mode;
  for(const center of centres){const x=center.x+ox,y=center.y+oy,gx=x+(cx-.5)*radius*2,gy=y+(cy-.5)*radius*2;ctx.fillStyle=addStops(ctx.createRadialGradient(gx,gy,0,gx,gy,extent*radius*2),stops);ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fill();}
 };
 if(String(state.params.style).toLowerCase()==='concave'){
  const radius=step*.55;
  layer('overlay',radius,.5,.5,.74,[[rgba('#000000',.16),0],[rgba('#000000',.03),.54],[rgba('#000000',0),.88]]);
  layer('overlay',radius,.3,.24,.78,[[rgba('#000000',.3),0],[rgba('#000000',.08),.44],[rgba('#000000',0),.8]]);
  layer('screen',radius,.73,.78,.82,[[rgba('#ffffff',.3),0],[rgba('#ffffff',.06),.52],[rgba('#ffffff',0),1]]);
  layer('screen',radius,.5,.5,.5,[[rgba('#ffffff',0),.76],[rgba('#ffffff',.08),.92],[rgba('#ffffff',0),1]]);
 }else{
  layer('source-over',r*.95,.5,.5,.5,[[rgba('#000000',.2),0],[rgba('#000000',.144),.62],[rgba('#000000',0),1]],step*.08,step*.12);
  layer('overlay',r,.3,.3,.8,[[rgba('#ffffff',.55),0],[rgba('#ffffff',.15),.22],[rgba('#000000',0),.46],[rgba('#000000',.28),.78],[rgba('#000000',.44),1]]);
  layer('screen',r,.7,.76,.34,[[rgba('#ffffff',.12),0],[rgba('#ffffff',.042),.7],[rgba('#ffffff',0),1]]);
  layer('screen',r,.32,.28,.12,[[rgba('#ffffff',.85),0],[rgba('#ffffff',.4),.45],[rgba('#ffffff',0),1]]);
 }ctx.restore();
}

const NOISE_BLOBS=[[-.1,.16,.45,.105,.65,2,0,7],[-.2,-.3,.5,.105,.9,0,0,6],[.35,-.32,.35,.08,.6,0,.4,-8],[-.35,.28,.4,.095,.8,0,0,-6],[.3,.34,.3,.08,.5,1,0,10],[.15,.04,.55,.1,.95,2,0,-3],[-.05,-.12,.55,.105,.95,1,.1,5],[.25,-.09,.5,.12,1,3,.9,-4]];
function paintNoise(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState,canvasFactory:ObjectCanvasFactory){
 const p=state.params,angle=number(p,'angle',32),rotation=angle*Math.PI/180,c=Math.cos(rotation),s=Math.sin(rotation),stretch=.55+number(p,'stretch',62)/100*1.1,spread=.5+number(p,'spread',55)/100*1.2;
 const diagonal=Math.hypot(w,h),blur=diagonal*.0416,pad=Math.ceil(blur*3.2),canvas=canvasFactory();canvas.width=w+2*pad;canvas.height=h+2*pad;const b=canvas.getContext('2d')!;fill(b,canvas.width,canvas.height,state.colors[0]);const palette=state.colors.length>1?state.colors.slice(1):state.colors;
 for(const blob of NOISE_BLOBS){let color=palette[blob[5]%palette.length];if(blob[6])color=blend(color,'#ffffff',blob[6]);const x=pad+(.5+blob[0]*c-blob[1]*spread*s)*w,y=pad+(.5+blob[0]*s+blob[1]*spread*c)*h;
  b.save();b.translate(x,y);b.rotate((angle+blob[7])*Math.PI/180);b.scale(blob[2]*stretch*.832*diagonal,blob[3]*spread*.555*diagonal);
  b.fillStyle=addStops(b.createRadialGradient(0,0,0,0,0,1),[[rgba(color,blob[4]),0],[rgba(color,blob[4]*.85),.55],[rgba(color,0),1]]);b.beginPath();b.arc(0,0,1,0,Math.PI*2);b.fill();b.restore();
 }ctx.save();ctx.filter=`blur(${blur.toFixed(1)}px)`;ctx.drawImage(canvas,-pad,-pad);ctx.restore();
}

function paintArch(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState){
 const p=state.params,diameter=w*number(p,'width',95)/100,dome=h*number(p,'height',58)/100,cx=w*number(p,'x',50)/100,baseline=h*number(p,'y',62)/100,bottom=h-baseline,last=state.colors.at(-1)!,previous=state.colors.at(-2)!;
 fill(ctx,w,h,'#F7F4EC');ctx.save();ctx.beginPath();ctx.rect(0,baseline,w,bottom);ctx.clip();
 const glow=(rx:number,ry:number,stops:[string,number][])=>{ctx.save();ctx.translate(cx,baseline);ctx.scale(1,ry/rx);ctx.fillStyle=addStops(ctx.createRadialGradient(0,0,0,0,0,rx),stops);ctx.fillRect(-w*2,-h*4,w*4,h*8);ctx.restore();};
 glow(.58*w,1.05*bottom,[[rgba(previous,.26),0],[rgba(previous,0),.8]]);
 glow(.46*w,.7*bottom,[[rgba(blend(last,'#ffffff',.35),.72),0],[rgba(last,.28),.38],[rgba(last,0),.72]]);ctx.restore();
 ctx.save();ctx.beginPath();ctx.ellipse(cx,baseline,diameter/2,dome,0,Math.PI,0);ctx.closePath();ctx.clip();ctx.translate(cx,baseline);ctx.scale(1,dome/diameter);
 const colors=[...state.colors].reverse(),centres=referenceCentres(state.colors,state.divisions).reverse().map(v=>(1-v)*.92);
 const stops:[string,number][]=[[blend(colors[0],'#ffffff',.16),0],...colors.map((color,i)=>[color,Math.min(.995,.1+centres[i]*.9)] as [string,number])];
 ctx.fillStyle=addStops(ctx.createRadialGradient(0,0,0,0,0,diameter*1.16),stops);ctx.fillRect(-w*2,-h*4,w*4,h*8);ctx.restore();
}

export function paintNativeObjects(ctx:CanvasRenderingContext2D,w:number,h:number,state:StudioState,canvasFactory:ObjectCanvasFactory=()=>document.createElement('canvas')):boolean{
 switch(state.type){
  case 'linear':case 'radial':case 'conic':paintBasic(ctx,w,h,state);break;
  case 'blocks':paintBlocks(ctx,w,h,state);break;
  case 'beehive':paintBeehive(ctx,w,h,state);break;
  case 'balls':paintBalls(ctx,w,h,state);break;
  case 'noise':paintNoise(ctx,w,h,state,canvasFactory);break;
  case 'arch':paintArch(ctx,w,h,state);break;
  default:return false;
 }return true;
}
