import { BASE_TIME, clamp, fract, smooth, smoothstep, mix, lab, fromLab, luminance, rgb, bounds, fbm, put, type RGB, type Params } from './fields-colour.ts';

export const SKY_DEFAULTS={scale:45,distortion:50,swirl:40,direction:'Up'};
export const AURORA_DEFAULTS={scale:47,distortion:62,swirl:40,direction:'Up'};
export function directionQuarter(params:Params):number {return typeof params.dir==='number'?params.dir%4:Math.max(0,['up','right','down','left'].indexOf(String(params.direction??'Up').toLowerCase()));}
export function skyColours(colors:string[]):{high:RGB;main:RGB;mid:RGB;low:RGB} {const p=[...colors].sort((a,b)=>luminance(b)-luminance(a)).map(c=>rgb(c).map(v=>v/255) as RGB),n=p.length;return {high:p[0],main:p[Math.min(1,n-1)],mid:p[Math.min(2,n-1)],low:p[n-1]};}
export function auroraColours(colors:string[]):{rim:RGB;glow:RGB;horizon:RGB;deep:RGB} {const p=[...colors].sort((a,b)=>luminance(b)-luminance(a)).map(c=>rgb(c).map(v=>v/255) as RGB),n=p.length;return {rim:p[0],glow:p[Math.min(1,n-1)],horizon:p[Math.min(n-1,Math.max(1,n-2))],deep:p[n-1]};}
export function auroraParameters(p:Params):{freq:number;fold:number;drift:number} {return {freq:1+(1-Number(p.scale??47)/100)*2.8,fold:Number(p.distortion??62)/100,drift:.15+Number(p.swirl??40)/100*1.1};}

/** The original Sky fallback is a layered Oklab sky with fbm cloud coverage. */
export function skyFallbackPixels(width:number,height:number,colors:string[],divs:number[],params:Params,time=BASE_TIME):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(width*height*4),p={...SKY_DEFAULTS,...params},pal=colors.map(lab),edges=bounds(colors.length,divs),freq=2.5*(.55+(1-Number(p.scale)/100)*1.9),warp=.1+Number(p.distortion)/100*.42,wind=Number(p.swirl)/100,clock=time*.1;
 let brightest=0,darkest=0;for(let i=1;i<colors.length;i++){if(luminance(colors[i])>luminance(colors[brightest]))brightest=i;if(luminance(colors[i])<luminance(colors[darkest]))darkest=i;}
 const white=mix(lab('#FFFFFF'),pal[brightest],.18),shade=mix(white,pal[darkest],.3),quarter=directionQuarter(params);
 for(let py=0;py<height;py++)for(let px=0;px<width;px++) {let x=(px+.5)/width,y=(py+.5)/height;if(quarter===1)[x,y]=[1-y,x];if(quarter===2)[x,y]=[1-x,1-y];if(quarter===3)[x,y]=[y,1-x];let base=pal[0];
  for(let i=1;i<colors.length;i++)base=mix(base,pal[i],smoothstep(edges[i]-.16,edges[i]+.16,y));
  const high=.02+.2*smoothstep(.15,.85,1-y)+.12*Math.exp(-((y-.34)*(y-.34))/.045),top=(1-y)*(1-y),drift=x+clock*(.25+wind*.6);
  const nu=fbm(drift*freq*.7+clock*.5,y*freq*.7,5,2),nv=fbm(drift*freq*.7-2.2,y*freq*.7+clock*.35,17,2),u=drift+warp*(nu-.5)*1.7,v=y+warp*(nv-.5);
  const clouds=fbm(u*freq*(1-wind*.45),v*freq*(1.7+wind*.8),7,5)+high*.62-.7-.34*smoothstep(.44,.66,y),cover=smoothstep(-.12,.12,clouds),dense=smoothstep(.12,.384,clouds),amount=Math.min(1,cover+top*.12*(.35+.65*nu));
  const color=mix(mix(base,white,amount),shade,dense*.22*(.4+.6*nv));put(out,(py*width+px)*4,fromLab(color));
 }return out;
}

const hash=(x:number,y:number)=>fract(Math.sin(x*127.1+y*311.7)*43758.5453123);
function noise(x:number,y:number):number {const ix=Math.floor(x),iy=Math.floor(y),fx=smooth(fract(x)),fy=smooth(fract(y)),a=hash(ix,iy),b=hash(ix+1,iy),c=hash(ix,iy+1),d=hash(ix+1,iy+1);return a+(b-a)*fx+(c-a)*fy+(a-b-c+d)*fx*fy;}
function octave(x:number,y:number,count:number):number {let sum=0,amp=.5;const ca=Math.cos(.5),sa=Math.sin(.5);for(let i=0;i<count;i++){sum+=amp*noise(x,y);const u=ca*x-sa*y,v=sa*x+ca*y;x=u*2.02+37;y=v*2.02+17;amp*=.5;}return sum;}
interface AuroraBand {spine:number;height:number;lum:number;rays:number;bundle:number}

/** Same parallel curtain geometry, directed rays and sparse stars as the Aurora shader. */
export function auroraPixels(width:number,height:number,colors:string[],params:Params,time=BASE_TIME):Uint8ClampedArray<ArrayBuffer> {
 const out=new Uint8ClampedArray(width*height*4),c=auroraColours(colors),{freq,fold,drift}=auroraParameters(params),clock=time*.35,amp=.05+fold*.22,tilt=(noise(clock*.11,71.3)-.5)*.9,lean=(noise(clock*.07,41.7)-.5)*.35;
 const rotation=directionQuarter(params)*Math.PI/2,ca=Math.cos(rotation),sa=Math.sin(rotation),cache=new Map<number,AuroraBand[]>();
 function bands(x:number):AuroraBand[] {const cached=cache.get(x);if(cached)return cached;
  const wobble=(octave(x*freq*.6+clock*drift*.3,clock*.09,2)-.5)*1.6,phase=clock*drift*.7+wobble,waveAt=(v:number)=>.5+.5*(.78*Math.sin(v*freq*freq*.65+phase)+.22*Math.sin(2*(v*freq*freq*.65+phase)+2.1)),w=waveAt(x),wave=(w-.5)*2+x*lean,slope=Math.abs(waveAt(x+.012)-w)/.012;
  const result=[0,1].map(i=>{const f=freq*(1+i*.15),d=drift*(.75+i*.25),depth=smoothstep(.35,.65,octave(x*f*.5+clock*d*.4+i*21.3,i*3.77+clock*.07,2)),wiggle=octave(x*f*2.6+clock*d+i*3.7,i*7.31+clock*.13,3)-.5,m=slope*amp*2;
   return {spine:.31+i*.12+amp*wave,height:(.17+fold*.07)*(.7+depth*.85)*(1-i*.2)*Math.sqrt(1+Math.min(m*m*2.5,5)),lum:(.6+.4*depth)*(1+(.25+1.15*fold)*smoothstep(1.1,3,slope*amp*6))*(.78+.22*noise(x*1.1-clock*1.3,5.5+i*2.2)),rays:x*f*(4.5+2*depth)+wiggle*2.2+clock*d*1.6,bundle:(.45+.55*smoothstep(.26,.72,noise(x*f*1.4+clock*d*.8+i*17.3,i*4.77)))*(.85+.15*noise(x*f*3.1+clock*2.8,7.7+i*3))};});cache.set(x,result);return result;
 }
 for(let py=0;py<height;py++)for(let px=0;px<width;px++) {
  const sx=((px+.5)/width-.5)*width/height,sy=.5-(py+.5)/height,x=ca*sx-sa*sy,hv=sa*sx+ca*sy+.5,horizon=1-smoothstep(0,.22,hv),sky=mix(c.deep,c.horizon,horizon*horizon*.18),aurora:RGB=[0,0,0];let coverage=0;
  const layers=bands(x);for(let i=0;i<2;i++){const band=layers[i],u=(hv-band.spine)/band.height,xr=band.rays+Math.max(u,0)*band.height*(tilt+x*.22)*3,yr=hv*.8+i*9.13;
   const rays=.5*noise(xr,yr)+.28*noise(xr*2.7+13.7,yr*1.7+5.2)+.14*noise(xr*6.1+31.9,yr*2.3+11.4)+.08*noise(xr*12.3+57.1,yr*2.9+23.7),soft=.55+.45*smoothstep(.3,.7,rays),hard=.1+.9*smoothstep(.38,.6,rays),rayStrength=(soft+(hard-soft)*fold)*band.bundle;
   const d=u-.15,sigma=d<0?.26:.55,beam=Math.exp(-(d*d)/(2*sigma*sigma)),body=beam*(.28+.72*rayStrength),strength=body*(.88+fold*.36)*(1-.7*i)*band.lum;
   let colour=mix(c.glow,c.rim,beam*beam*.75);colour=mix(colour,c.deep,smoothstep(.35,1.05,u)*.5);colour=mix(colour,c.horizon,(1-smoothstep(-.38,-.12,d))*.3);for(let j=0;j<3;j++)aurora[j]+=colour[j]*strength;coverage+=strength;
  }
  const gx=x*60,gy=hv*60,ix=Math.floor(gx),iy=Math.floor(gy),starHash=hash(ix,iy);let star=0;
  if(starHash>.96){const dx=fract(gx)-(hash(ix+11.3,iy+11.3)*.6+.2),dy=fract(gy)-(hash(ix+27.7,iy+27.7)*.6+.2),radius=Math.hypot(dx,dy),twinkle=.6+.4*Math.sin(time*(2+starHash*6)+starHash*100);star=Math.max(0,1-radius/.14)**4*(.3+.7*(starHash-.96)/.04)*twinkle;star*=smoothstep(.03,.12,hv)*clamp(1-coverage*2.2)*(1-smoothstep(.25,.6,sky[0]*.299+sky[1]*.587+sky[2]*.114));}
  put(out,(py*width+px)*4,sky.map((v,i)=>clamp(v+aurora[i]+[.95,.97,1][i]*star)*255) as RGB);
 }return out;
}
