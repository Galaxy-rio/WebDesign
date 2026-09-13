import type {StudioState} from './model.ts';
import {BASE_TIME} from './fields-colour.ts';
import {silkPixels} from './fields-silk.ts';
import {skyFallbackPixels,auroraPixels} from './fields-sky.ts';
import {meshPixels,stillPixels,retroPixels,iosPixels} from './fields-static.ts';
import {paintFieldGPU} from './fields-gl.ts';
export const FIELD_TYPES=['sky','aurora','mesh','silk','still','retro','ios'];

/** Pure CPU drawing, used for deterministic tests and when WebGL is unavailable. */
export function fieldsPixels(width:number,height:number,state:StudioState,time=BASE_TIME):Uint8ClampedArray<ArrayBuffer> {
 switch(state.type) {
  case 'sky':return skyFallbackPixels(width,height,state.colors,state.divisions,state.params,time);
  case 'aurora':return auroraPixels(width,height,state.colors,state.params,time);
  case 'mesh':return meshPixels(width,height,state.colors,state.divisions,state.points);
  case 'silk':return silkPixels(width,height,state.colors,state.divisions,state.params,time);
  case 'still':return stillPixels(width,height,state.colors,state.divisions,state.params);
  case 'retro':return retroPixels(width,height,state.colors,state.divisions,time);
  case 'ios':return iosPixels(width,height,state.colors,state.divisions);
  default:throw new Error('Unsupported field type: '+state.type);
 }
}

/** Paint into the compositing buffer; the caller retains soften/grain/layer handling. */
export function paintFields(ctx:CanvasRenderingContext2D,width:number,height:number,state:StudioState,time=BASE_TIME):void {
 if((state.type==='sky'||state.type==='aurora'||state.type==='silk')&&paintFieldGPU(ctx,width,height,state.type,state.colors,state.divisions,state.params,time))return;
 ctx.putImageData(new ImageData(fieldsPixels(width,height,state,time),width,height),0,0);
}
