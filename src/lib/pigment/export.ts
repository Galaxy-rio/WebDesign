import { FONTS, type StudioState } from './model.ts';
import { renderComposition, paintGradient, drawImageLayer, drawText, loadImage } from './renderer.ts';
import { basicStops } from './native-objects.ts';
export const escapeHtml=(s:unknown)=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function fileName(name:string){return name.normalize('NFKC').replace(/[^\p{L}\p{N}\s_-]/gu,'').trim().replace(/\s+/g,'-').slice(0,80)||'pigment';}
export function toBlob(canvas:HTMLCanvasElement,mime='image/png'):Promise<Blob>{return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('The image could not be exported. Try a smaller size.')),mime,.94));}
export function cssFor(state:StudioState,aspect=1):string|null{
 if(state.grain>0||state.soften>0)return null;
 const stops=basicStops(state).map(([color,position])=>`${color} ${(position*100).toFixed(2)}%`).join(', '),p=state.params;
 if(state.type==='linear')return `background: linear-gradient(${p.angle}deg, ${stops});`;
 if(state.type==='radial'){const radius=Math.min(1,aspect)*Number(p.radius)/100;return `aspect-ratio: ${aspect};\nbackground: radial-gradient(ellipse ${radius/aspect*100}% ${radius*100}% at ${p.x}% ${p.y}%, ${stops});`;}
 if(state.type==='conic')return `background: conic-gradient(from ${Number(p.angle)}deg at ${p.x}% ${p.y}%, ${stops});`;
 return null;
}
export async function svgFor(state:StudioState,width:number,height:number):Promise<string>{
 await document.fonts.ready;
 const esc=escapeHtml;let background='';
 const vector=state.grain===0&&state.soften===0;
 const stops=basicStops(state).map(([color,position])=>`<stop offset="${position}" stop-color="${color}"/>`).join('');
 if(vector&&state.type==='linear'){
  const a=Number(state.params.angle)*Math.PI/180,dx=Math.sin(a),dy=-Math.cos(a),span=Math.abs(dx)*width+Math.abs(dy)*height;
  background=`<defs><linearGradient id="pigment-field" gradientUnits="userSpaceOnUse" x1="${width/2-dx*span/2}" y1="${height/2-dy*span/2}" x2="${width/2+dx*span/2}" y2="${height/2+dy*span/2}">${stops}</linearGradient></defs><rect id="Colour-field" width="${width}" height="${height}" fill="url(#pigment-field)"/>`;
 }else if(vector&&state.type==='radial')background=`<defs><radialGradient id="pigment-field" gradientUnits="userSpaceOnUse" cx="${Number(state.params.x)*width/100}" cy="${Number(state.params.y)*height/100}" r="${Number(state.params.radius)/100*Math.min(width,height)}">${stops}</radialGradient></defs><rect id="Colour-field" width="${width}" height="${height}" fill="url(#pigment-field)"/>`;
 else {const raster=await renderComposition({...state,texts:[],image:null},width,height);background=`<image id="Colour-field" width="${width}" height="${height}" href="${raster.toDataURL('image/png')}"/>`;}
 let image='';if(state.image){const layer=document.createElement('canvas');layer.width=width;layer.height=height;drawImageLayer(layer.getContext('2d')!,width,height,state.image,await loadImage(state.image.src));image=`<image id="Image-layer" width="${width}" height="${height}" href="${layer.toDataURL('image/png')}" style="mix-blend-mode:${state.image.blend}"/>`;}
 const measure=document.createElement('canvas').getContext('2d')!;
 const text=state.texts.map((t,i)=>{
  const family=FONTS.find(f=>f.id===t.font)?.family??'serif',size=t.size*width/100,lines=t.content.split('\n');
  measure.font=`${t.weight} ${size}px ${family}`;measure.letterSpacing=`${t.tracking/100*size}px`;
  const blockWidth=Math.max(...lines.map(line=>measure.measureText(line).width)),anchor=t.align==='left'?-blockWidth/2:t.align==='right'?blockWidth/2:0;
  const shadow=t.shadow?`<defs><filter id="shadow-${i}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${size*.04}" stdDeviation="${size*.09}" flood-opacity="${t.shadow/120}"/></filter></defs>`:'';
  return `${shadow}<g id="Text-${i+1}" transform="translate(${t.x*width/100} ${t.y*height/100}) rotate(${t.rotation})" opacity="${t.opacity/100}"><text font-family="${esc(family)}" font-size="${size}" font-weight="${t.weight}" fill="${t.color}" text-anchor="${t.align==='center'?'middle':t.align==='right'?'end':'start'}" dominant-baseline="central" letter-spacing="${t.tracking/100*size}" ${t.shadow?`filter="url(#shadow-${i})"`:''}>${lines.map((line,j)=>`<tspan x="${anchor}" y="${(j-(lines.length-1)/2)*size*1.12}">${esc(line)}</tspan>`).join('')}</text></g>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><title>${esc(state.name)}</title>${background}${image}${text}</svg>`;
}
export function videoMime(format:string){if(typeof MediaRecorder==='undefined')return null;const candidates=format==='mp4'?['video/mp4;codecs=avc1.42001f','video/mp4;codecs=avc1','video/mp4']:['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'];return candidates.find(m=>MediaRecorder.isTypeSupported(m))??null;}
export async function videoFor(state:StudioState,width:number,height:number,seconds:number,format:string,onProgress:(progress:number)=>void,signal:AbortSignal):Promise<Blob>{
 const mime=videoMime(format);if(!mime)throw new Error(`${format.toUpperCase()} recording is not supported by this browser. Try ${format==='mp4'?'WebM':'MP4'} instead.`);
 const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d')!,image=state.image?await loadImage(state.image.src):null;await document.fonts.ready;
 const stream=canvas.captureStream(30);const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:Math.min(16000000,width*height*7)});const chunks:BlobPart[]=[];
 return new Promise((resolve,reject)=>{
  let frame=0,finished=false,start=0;
  function clean(){cancelAnimationFrame(frame);stream.getTracks().forEach(t=>t.stop());signal.removeEventListener('abort',abort);}
  function abort(){if(finished)return;finished=true;if(recorder.state!=='inactive')recorder.stop();clean();reject(new DOMException('Export cancelled.','AbortError'));}
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>{finished=true;clean();reject(new Error('Video encoding failed. Try a smaller size or another format.'));};
  recorder.onstop=()=>{clean();if(!finished){finished=true;onProgress(100);resolve(new Blob(chunks,{type:mime}));}};
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted){abort();return;}
  const draw=(now:number)=>{if(finished)return;if(!start)start=now;const elapsed=(now-start)/1000;paintGradient(ctx,width,height,state,state.time+elapsed*state.speed/100*1.2);if(state.image&&image)drawImageLayer(ctx,width,height,state.image,image);for(const t of state.texts)drawText(ctx,width,height,t);onProgress(Math.min(99,Math.round(elapsed/seconds*100)));if(elapsed>=seconds){recorder.stop();return;}frame=requestAnimationFrame(draw);};
  paintGradient(ctx,width,height,state,state.time);recorder.start(200);frame=requestAnimationFrame(draw);
 });
}
