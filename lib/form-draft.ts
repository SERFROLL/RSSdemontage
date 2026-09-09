/** A local draft is not a posted accounting document. Never send this envelope to /api/command. */
export type DraftEditor={title:string;action:string;data:Record<string,any>;id?:string;expectedVersion?:number;requestId?:string};
export type DraftSession={actorId:string;scope:string;dataEpoch:string};
export type SavedFormDraft<T extends DraftEditor>={version:2;actorId:string;scope:string;dataEpoch:string;id:string;savedAt:string;baseline:string;editor:T};
export type DraftStorage=Pick<Storage,"getItem"|"setItem"|"removeItem">;
export type DraftSnapshot<T extends DraftEditor>={form:T|null;draft:SavedFormDraft<T>|null;storageUnavailable:boolean};

function normalized(value:any):any{
 if(typeof value==="string")return value.trim();
 if(Array.isArray(value))return value.map(normalized);
 if(value&&typeof value==="object")return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,normalized(value[k])]));
 return value;
}
export function draftSignature(editor:DraftEditor){return JSON.stringify(normalized({action:editor.action,id:editor.id,expectedVersion:editor.expectedVersion,data:editor.data}));}
export const draftStorageKey=(session:DraftSession)=>"pid-draft:v2:"+session.scope+":"+session.actorId;
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value));
function validEditor(value:any):value is DraftEditor{return !!value&&typeof value.title==="string"&&typeof value.action==="string"&&!!value.data&&typeof value.data==="object"&&!Array.isArray(value.data);}

/** Synchronous state transitions avoid effect races after reset, identity change or successful submit. */
export function createFormDraftController<T extends DraftEditor>(getStorage:()=>DraftStorage|undefined,now=()=>new Date().toISOString(),newId=()=>crypto.randomUUID()){
 let snapshot:DraftSnapshot<T>={form:null,draft:null,storageUnavailable:false};
 let session:DraftSession|null=null;
 let active:{baseline:string;id:string;previous:SavedFormDraft<T>|null}|null=null;
 const listeners=new Set<()=>void>();
 // If browser storage fails, the current session still remembers deletion/submission.
 const memory=new Map<string,string|null>();
 const emit=(next:Partial<DraftSnapshot<T>>)=>{snapshot={...snapshot,...next};for(const listener of listeners)listener();};
 function read(key:string){if(memory.has(key))return memory.get(key)!;try{const storage=getStorage();if(!storage)throw new Error();return storage.getItem(key);}catch{emit({storageUnavailable:true});return null;}}
 function write(key:string,value:string|null){memory.set(key,value);try{const storage=getStorage();if(!storage)throw new Error();if(value===null)storage.removeItem(key);else storage.setItem(key,value);}catch{emit({storageUnavailable:true});}}
 function persist(draft:SavedFormDraft<T>|null){if(!session)return;write(draftStorageKey(session),draft?JSON.stringify(draft):null);emit({draft});}
 const close=()=>{active=null;emit({form:null});};
 const syncSession=(next:DraftSession)=>{
  if(session&&session.actorId===next.actorId&&session.scope===next.scope&&session.dataEpoch===next.dataEpoch)return {invalidated:false};
  const changedEpoch=!!session&&session.actorId===next.actorId&&session.scope===next.scope&&session.dataEpoch!==next.dataEpoch;
  const invalidated=changedEpoch&&!!(snapshot.form||snapshot.draft);
  session={...next};active=null;
  // The old raw format has no actor namespace, reset epoch or baseline. Its safety cannot be established.
  write("pid-draft:"+next.actorId,null);
  const key=draftStorageKey(next),raw=read(key);let draft:SavedFormDraft<T>|null=null;
  if(raw){try{const d=JSON.parse(raw);if(d.version===2&&d.actorId===next.actorId&&d.scope===next.scope&&d.dataEpoch===next.dataEpoch&&typeof d.id==="string"&&typeof d.baseline==="string"&&typeof d.savedAt==="string"&&Number.isFinite(Date.parse(d.savedAt))&&validEditor(d.editor)&&draftSignature(d.editor)!==d.baseline)draft=d;}catch{/* Corrupt storage is treated as an absent draft. */}if(!draft)write(key,null);}
  emit({form:null,draft});return {invalidated};
 };
 const open=(editor:T)=>{if(!session)return;active={baseline:draftSignature(editor),id:newId(),previous:snapshot.draft};emit({form:clone(editor)});};
 const setForm=(value:T|null|((previous:T|null)=>T|null))=>{
  const editor=typeof value==="function"?value(snapshot.form):value;
  if(!editor){close();return;}
  if(!active||!snapshot.form){open(editor);return;}
  const changed=draftSignature(editor)!==active.baseline;
  emit({form:clone(editor)});
  if(!session)return;
  if(changed){
   // Metadata-only changes do not advance the displayed save time.
   if(snapshot.draft?.id===active.id&&draftSignature(snapshot.draft.editor)===draftSignature(editor))return;
   persist({version:2,...session,id:active.id,savedAt:now(),baseline:active.baseline,editor:clone(editor)});
  }else if(snapshot.draft?.id===active.id)persist(active.previous);
 };
 const resume=()=>{const draft=snapshot.draft;if(!draft)return;active={baseline:draft.baseline,id:draft.id,previous:null};emit({form:clone(draft.editor)});};
 const discard=()=>{const id=snapshot.draft?.id;persist(null);if(active?.id===id)close();return {persistent:!snapshot.storageUnavailable};};
 const submitted=()=>{
  // An unchanged, unrelated form must not destroy a useful saved draft.
  if(active?.id===snapshot.draft?.id)persist(null);
  active=null;emit({form:null});
 };
 return {getSnapshot:()=>snapshot,subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},syncSession,open,setForm,close,resume,discard,submitted};
}
