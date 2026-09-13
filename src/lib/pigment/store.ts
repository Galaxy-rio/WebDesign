import { initialState, normalizeState, type StudioState } from './model.ts';

export class DesignStore {
 state:StudioState;
 private past:StudioState[]=[];
 private future:StudioState[]=[];
 private group='';
 private lastEdit=0;
 private listeners=new Set<()=>void>();
 constructor(state=initialState()){this.state=state;}
 get canUndo(){return this.past.length>0;}
 get canRedo(){return this.future.length>0;}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>this.listeners.delete(fn);}
 private notify(){for(const fn of this.listeners)fn();}
 update(change:Partial<StudioState>|((state:StudioState)=>void),group=''){
  const now=Date.now();if(!group||group!==this.group||now-this.lastEdit>650){this.past.push(structuredClone(this.state));if(this.past.length>40)this.past.shift();}
  this.group=group;this.lastEdit=now;this.future=[];
  this.state=structuredClone(this.state);if(typeof change==='function')change(this.state);else Object.assign(this.state,change);
  this.notify();
 }
 replace(input:unknown){const next=normalizeState(input);this.update(next);}
 undo(){const previous=this.past.pop();if(!previous)return;this.future.push(this.state);this.state=previous;this.group='';this.notify();}
 redo(){const next=this.future.pop();if(!next)return;this.past.push(this.state);this.state=next;this.group='';this.notify();}
}
export interface SavedDesign {id:string;name:string;date:string;state:StudioState;thumbnail:string}
export const DRAFT_KEY='pigment-studio.draft.v1';
export const SAVED_KEY='pigment-studio.saved.v1';
export function loadDraft(storage:Pick<Storage,'getItem'>):StudioState|null{try{const raw=storage.getItem(DRAFT_KEY);return raw?normalizeState(JSON.parse(raw)):null;}catch{return null;}}
export function loadSaved(storage:Pick<Storage,'getItem'>):SavedDesign[]{try{const raw=storage.getItem(SAVED_KEY);if(!raw)return [];const data=JSON.parse(raw);if(!Array.isArray(data))return [];return data.slice(0,60).flatMap(item=>{try{const state=normalizeState(item.state);return[{id:String(item.id).slice(0,100),name:String(item.name??state.name).slice(0,100),date:String(item.date??''),state,thumbnail:typeof item.thumbnail==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(item.thumbnail)?item.thumbnail:''}];}catch{return [];}});}catch{return [];}}
