import { BASE_TIME, TAU, clamp, smoothstep, dot, normalize, palette, samplePalette, put, type Params, type RGB } from './fields-colour.ts';

export const SILK_DEFAULTS={angle:32,warp:65,streak:48,sheen:62,scale:15,light:25,seed:2,thread:45,glow:42,folds:7,depth:65};
export interface Cloth { angle:number; folds:number; drape:number; tension:number; depth:number; zoom:number; phase:number; time:number }
export function silkParameters(params:Params,time=BASE_TIME):{cloth:Cloth;light:RGB;sheen:number;thread:number;glow:number} {
 const p={...SILK_DEFAULTS,...params} as typeof SILK_DEFAULTS;
 p.warp=Number(params.warp??params.drape??p.warp);p.streak=Number(params.streak??params.tension??p.streak);p.thread=Number(params.thread??params.weave??p.thread);
 const angle=(p.angle+clamp(p.light,-70,70)-25)*Math.PI/180;
 return {cloth:{angle:p.angle*Math.PI/180,folds:clamp(p.folds,2,16),drape:clamp(p.warp,0,100)/100,tension:clamp(p.streak,0,100)/100,depth:clamp(p.depth,0,100)/100,zoom:1+clamp(p.scale,0,100)/100,phase:p.seed%997*1.618034,time:(time-BASE_TIME)*.12},light:normalize([Math.cos(angle)*.95,Math.sin(angle)*.95,.55]),sheen:p.sheen/100,thread:p.thread/100,glow:p.glow/100};
}

/** Gathered cloth domain: rotating folds, unequal pitch and a narrow gathered waist. */
export function clothCoordinates(x:number,y:number,p:Cloth):[number,number] {
 const ca=Math.cos(p.angle),sa=Math.sin(p.angle);let u=(x*ca+y*sa)/p.zoom,v=(-x*sa+y*ca)/p.zoom;
 const phase=p.phase,time=p.time,amplitude=.35+p.drape*.3;
 const warpU=amplitude*Math.sin(1.9*v+.6*u+phase+time)+.05*Math.sin(4.1*v-1.3*u+phase*.7-time*.6);
 const warpV=amplitude*.6*Math.sin(1.7*u-.5*v+phase*1.3-time*.8)+.05*Math.sin(3.7*u+1.1*v+phase*.4+time*.5);
 u+=warpU;v+=warpV;const spread=1-p.tension*.5*Math.exp(-(((v+.45)*1.7)**2));
 return [((u+.2)/spread-.2)*p.folds,v];
}
export function clothHeight(x:number,y:number,p:Cloth):number {
 const [lane0,v]=clothCoordinates(x,y,p),phase=p.phase,lane=lane0+.45*Math.sin(lane0*.53+v*.7+phase)+.1*Math.sin(lane0*1.31-v*1.1+phase*.6+p.time*.5);
 const pitch=lane*.35,roll=pitch+.05*Math.sin(TAU*pitch+phase*.4),amplitude=.6+.4*Math.sin(lane*.71+v*.9+phase*1.3),along=.8+.2*Math.sin(v*2.4+lane*.4+p.time*.3);
 let h=amplitude*along*(.5+.5*Math.cos(TAU*roll));const mask=.5+.5*Math.sin(lane*.37+v*1.7+phase*.8);
 h+=p.tension*.03*mask*(.5+.5*Math.cos(TAU*(pitch*2.6+.25*Math.sin(v*2.1+phase))));h+=p.drape*.6*Math.sin(lane/p.folds*2+v*1.3+phase);
 return p.depth*(.42/Math.sqrt(p.folds))*h;
}
function clothNormal(x:number,y:number,p:Cloth):RGB {return normalize([-(clothHeight(x+.001,y,p)-clothHeight(x-.001,y,p))/.002,-(clothHeight(x,y+.001,p)-clothHeight(x,y-.001,p))/.002,1]);}

/** CPU counterpart of the Silk shader: cast shadows, ridge curvature, satin weave. */
export function silkPixels(width:number,height:number,colors:string[],divs:number[],params:Params,time=BASE_TIME):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(width*height*4),ramp=palette(colors,divs),{cloth:p,light,sheen,thread,glow}=silkParameters(params,time),half=normalize([light[0],light[1],light[2]+1]);
 const aspect=width/height,fit=Math.min(1,1.6/aspect),crestScale=.055*(1.4-.7*sheen),gain=1.7*(.7+glow*.9),rimColour=samplePalette(ramp,.86),peak=samplePalette(ramp,.97),sheenColour=peak.map(c=>c+(255-c)*.55) as RGB;
 for(let py=0;py<height;py++)for(let px=0;px<width;px++) {
  const x=((px+.5)/width-.5)*aspect*fit,y=((py+.5)/height-.5)*fit,heightAt=clothHeight(x,y,p),normal=clothNormal(x,y,p);
  const acrossX=clothCoordinates(x+.001,y,p)[0]-clothCoordinates(x-.001,y,p)[0],acrossY=clothCoordinates(x,y+.001,p)[0]-clothCoordinates(x,y-.001,p)[0],len=Math.hypot(acrossX,acrossY)+1e-6,ux=acrossX/len,uy=acrossY/len;
  const curvature=-(clothHeight(x+ux*.012,y+uy*.012,p)+clothHeight(x-ux*.012,y-uy*.012,p)-2*heightAt)/(.012*.012);
  let shadow=1;for(let i=1;i<=10;i++){const distance=i*.022,clearance=heightAt+light[2]*distance-clothHeight(x+light[0]*distance,y+light[1]*distance,p);shadow=Math.min(shadow,clamp(.6+clearance/(distance*.45)));}
  const cavity=Math.max(0,(clothHeight(x+.03,y,p)+clothHeight(x-.03,y,p)+clothHeight(x,y+.03,p)+clothHeight(x,y-.03,p))*.25-heightAt),ao=Math.exp(-cavity*16),nl=dot(normal,light);
  let wrap=clamp((nl+.42)/1.42);wrap=wrap*wrap*(3-2*wrap);let diffuse=(.12+.88*wrap*shadow)*ao;
  const fibre=clothCoordinates(x,y,p),edgeLight=smoothstep(-.15,.45,nl)*shadow,cn=curvature*crestScale;
  const crest=smoothstep(.35,.8,cn)*edgeLight*(.55+.45*Math.sin(fibre[1]*3.1+fibre[0]*.35+p.phase*.9+p.time*.4)),core=smoothstep(.72,.9,cn)*edgeLight,flank=Math.max(dot(normal,half),0)**6*shadow;
  let shine=.8*crest+.3*core+.4*flank;const rim=clamp(.2*(1-Math.max(normal[2],0))**2.5*(1-wrap)),pixel=fit/height;
  let weave=Math.sin(6.2831853*(x*ux+y*uy)/(pixel*3)+fibre[1]*6);weave*=.7+.3*Math.sin(fibre[0]*1.9+fibre[1]*3+p.phase);diffuse*=1+weave*thread*.035;shine*=1+weave*thread*.035*1.5;
  const exposure=diffuse*1.05,tone=clamp(exposure*(2.51*exposure+.03)/(exposure*(2.43*exposure+.59)+.14))**1.2*.56,body=samplePalette(ramp,tone),luma=dot(body,[.2126,.7152,.0722]),amount=1-Math.exp(-shine*gain);
  const result=body.map((c,i)=>{const saturated=clamp(luma+(c-luma)*1.22,0,255),rimmed=saturated+(rimColour[i]-saturated)*rim;return rimmed+(sheenColour[i]-rimmed)*amount;}) as RGB;put(out,(py*width+px)*4,result);
 }return out;
}
