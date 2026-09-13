/** Self-contained GPU field drawing. No code from the reference site's runtime is loaded. */
import shaders from '../../data/field-shaders.json' with {type:'json'};
import { BASE_TIME, palette, type Params } from './fields-colour.ts';
import { skyColours, auroraColours, auroraParameters, directionQuarter } from './fields-sky.ts';
import { silkParameters } from './fields-silk.ts';

type Field='sky'|'aurora'|'silk';
interface Renderer { canvas:HTMLCanvasElement; gl:WebGLRenderingContext; program:WebGLProgram; texture:WebGLTexture|null; colourKey:string; uniforms:Map<string,WebGLUniformLocation|null> }
const renderers=new Map<Field,Renderer|null>();
export function fieldShader(type:Field):string {return shaders[type];}

function shader(gl:WebGLRenderingContext,type:number,source:string):WebGLShader {
 const result=gl.createShader(type);if(!result)throw new Error('Cannot allocate shader');
 gl.shaderSource(result,source);gl.compileShader(result);
 if(!gl.getShaderParameter(result,gl.COMPILE_STATUS)){const log=gl.getShaderInfoLog(result);gl.deleteShader(result);throw new Error(log??'Cannot compile field shader');}return result;
}
function createRenderer(type:Field):Renderer|null {
 if(typeof document==='undefined')return null;
 if(renderers.has(type))return renderers.get(type)!;
 const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true});if(!gl){renderers.set(type,null);return null;}
 try {
  const program=gl.createProgram();if(!program)throw new Error('Cannot allocate program');
  const vertex=shader(gl,gl.VERTEX_SHADER,'attribute vec2 a_pos; void main(){gl_Position=vec4(a_pos,0.0,1.0);}'),fragment=shader(gl,gl.FRAGMENT_SHADER,shaders[type]);
  gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)??'Cannot link field program');
  gl.useProgram(program);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const attribute=gl.getAttribLocation(program,'a_pos');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
  let texture:WebGLTexture|null=null;
  if(type==='sky'||type==='silk') {
   texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
   gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,type==='sky'?gl.REPEAT:gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,type==='sky'?gl.REPEAT:gl.CLAMP_TO_EDGE);
   gl.uniform1i(gl.getUniformLocation(program,type==='sky'?'u_noise':'u_palette'),0);
   if(type==='sky'){const data=new Uint8Array(256*256*4);let seed=0x83A2461;for(let i=0;i<256*256;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=seed>>>24;data.set([v,v,v,255],i*4);}gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,256,256,0,gl.RGBA,gl.UNSIGNED_BYTE,data);}
  }
  const result={canvas,gl,program,texture,colourKey:'',uniforms:new Map<string,WebGLUniformLocation|null>()};renderers.set(type,result);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();renderers.set(type,null);});
  canvas.addEventListener('webglcontextrestored',()=>renderers.delete(type));return result;
 } catch {renderers.set(type,null);return null;}
}

/** Returns false when GPU is unavailable; the caller then uses fieldsPixels. */
export function paintFieldGPU(ctx:CanvasRenderingContext2D,width:number,height:number,type:Field,colors:string[],divs:number[],params:Params,time=BASE_TIME):boolean {
 const renderer=createRenderer(type);if(!renderer)return false;
 const {canvas,gl,program}=renderer;if(gl.isContextLost())return false;
 const limit=gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;if(width>limit[0]||height>limit[1])return false;
 if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;gl.viewport(0,0,width,height);gl.useProgram(program);
 const location=(name:string)=>{const key='u_'+name;if(!renderer.uniforms.has(key))renderer.uniforms.set(key,gl.getUniformLocation(program,key));return renderer.uniforms.get(key)!;};
 const scalar=(name:string,value:number)=>gl.uniform1f(location(name),value);
 const colour=(name:string,c:number[])=>gl.uniform3f(location(name),c[0],c[1],c[2]);
 gl.uniform2f(location('res'),width,height);
 if(type==='silk') {
  const config=silkParameters(params,time);for(const [key,value] of Object.entries(config.cloth))scalar(key,value);scalar('sheen',config.sheen);scalar('thread',config.thread);scalar('glow',config.glow);colour('light',config.light);
  const key=JSON.stringify([colors,divs]);if(renderer.colourKey!==key){gl.bindTexture(gl.TEXTURE_2D,renderer.texture);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,256,1,0,gl.RGB,gl.UNSIGNED_BYTE,new Uint8Array(palette(colors,divs)));renderer.colourKey=key;}
 } else {
  scalar('t',time);const angle=directionQuarter(params)*Math.PI/2;gl.uniform2f(location('dirv'),Math.cos(angle),Math.sin(angle));
  const key=JSON.stringify(colors);if(renderer.colourKey!==key){const p=type==='sky'?skyColours(colors):auroraColours(colors);for(const [name,value] of Object.entries(p))colour(name,value);renderer.colourKey=key;}
  if(type==='sky'){scalar('nscale',.35+Number(params.scale??45)/100*1.15);scalar('warp',Number(params.distortion??50)/100*.47);scalar('wind',Number(params.swirl??40)/100*.36);}
  else {const p=auroraParameters(params);scalar('freq',p.freq);scalar('fold',p.fold);scalar('drift',p.drift);}
 }
 gl.drawArrays(gl.TRIANGLES,0,3);ctx.drawImage(canvas,0,0,width,height);return true;
}
