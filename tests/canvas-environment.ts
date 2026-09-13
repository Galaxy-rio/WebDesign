import { createCanvas, ImageData, Path2D } from '@napi-rs/canvas';

/** Native drawing only: no browser, page DOM, network or screenshot automation. */
export function installCanvasEnvironment() {
 Object.assign(globalThis,{ImageData,Path2D,document:{
  createElement(tag:string){
   if(tag!=='canvas')throw new Error('Unexpected test element: '+tag);
   const canvas=createCanvas(1,1),getContext=canvas.getContext.bind(canvas);
   Object.defineProperty(canvas,'getContext',{value:(kind:string,...options:unknown[])=>kind==='2d'?getContext('2d',...(options as [])):null});
   return canvas;
  },
  fonts:{ready:Promise.resolve()},
 }});
}
