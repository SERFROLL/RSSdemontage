import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync(new URL('../lib/form-draft.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {createFormDraftController,draftStorageKey}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const scope={actorId:'admin',scope:'production-scope',dataEpoch:'2026-09-09T12:00:00Z'};
const editor=()=>({title:'Начальные остатки',action:'initialize',requestId:'request-a',data:{pid:'pid:1234',lines:[],pidEmpty:false,warehouseEmpty:false}});
function fixture(){const storage=new Map();let counter=0;const api={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};const controller=()=>createFormDraftController(()=>api,()=>new Date(Date.UTC(2026,8,9,12,++counter)).toISOString(),()=>`id-${++counter}`);const c=controller();c.syncSession(scope);return {storage,api,c,controller};}
function change(c,data){c.setForm(previous=>({...previous,requestId:crypto.randomUUID(),data:{...previous.data,...data}}));}

test('Opening, closing, whitespace and request metadata do not create an empty draft',()=>{
 const {c,storage}=fixture();const blank={...editor(),data:{name:''}};c.open(blank);c.close();assert.equal(c.getSnapshot().draft,null);
 c.open(blank);c.setForm({...blank,requestId:'new',title:'Other title'});change(c,{name:'   '});c.close();assert.equal(c.getSnapshot().draft,null);assert.equal(storage.has(draftStorageKey(scope)),false);
});
test('Entered data survives close and reload with its form title and save time',()=>{
 const {c,controller}=fixture();c.open(editor());change(c,{pidEmpty:true});const d=c.getSnapshot().draft;assert.equal(d.editor.title,'Начальные остатки');assert.match(d.savedAt,/^2026-09-09T/);assert.equal(d.actorId,'admin');c.close();
 const again=controller();again.syncSession(scope);again.resume();assert.equal(again.getSnapshot().form.data.pidEmpty,true);assert.equal(again.getSnapshot().draft.savedAt,d.savedAt);
});
test('Opening and closing an unrelated unchanged form retains the original draft',()=>{
 const {c}=fixture();c.open(editor());change(c,{pidEmpty:true});c.close();const d=c.getSnapshot().draft;c.open({title:'Тип кабеля',action:'cable',data:{name:''}});c.close();assert.deepEqual(c.getSnapshot().draft,d);
 c.open({title:'Тип кабеля',action:'cable',data:{name:''}});change(c,{name:'МКС'});change(c,{name:''});c.close();assert.deepEqual(c.getSnapshot().draft,d);
});
test('Reverting a resumed form to its initial data removes its draft',()=>{
 const {c}=fixture();c.open(editor());change(c,{pidEmpty:true});c.close();c.resume();change(c,{pidEmpty:false});assert.equal(c.getSnapshot().draft,null);assert.equal(c.getSnapshot().form.data.pidEmpty,false);
});
test('Request identifier changes alone do not change the saved timestamp',()=>{
 const {c}=fixture();c.open(editor());change(c,{pidEmpty:true});const time=c.getSnapshot().draft.savedAt;change(c,{pidEmpty:true});assert.equal(c.getSnapshot().draft.savedAt,time);
});
test('Reset epoch removes the saved draft and closes an already open pre-reset form',()=>{
 const {c,storage,controller}=fixture();c.open(editor());change(c,{pidEmpty:true});const next={...scope,dataEpoch:'2026-09-10T12:00:00Z'};assert.equal(c.syncSession(next).invalidated,true);assert.equal(c.getSnapshot().draft,null);assert.equal(c.getSnapshot().form,null);assert.equal(storage.has(draftStorageKey(scope)),false);
 const again=controller();again.syncSession(next);assert.equal(again.getSnapshot().draft,null);
});
test('Legacy raw, corrupted and cross-epoch envelopes cannot be resumed',()=>{
 for(const raw of ['broken',JSON.stringify({...editor()}),JSON.stringify({version:2,...scope,dataEpoch:'earlier',id:'old',savedAt:'2026-09-09',baseline:'',editor:editor()})]){
  const {api,c,storage}=fixture();api.setItem(draftStorageKey({...scope,actorId:'other'}),raw);api.setItem('pid-draft:other',JSON.stringify(editor()));c.syncSession({...scope,actorId:'other'});assert.equal(c.getSnapshot().draft,null);assert.equal(storage.has('pid-draft:other'),false);assert.equal(storage.has(draftStorageKey({...scope,actorId:'other'})),false);
 }
});
test('Users and namespaces have separate drafts, and switching identities closes forms',()=>{
 const {c}=fixture();c.open(editor());change(c,{pidEmpty:true});c.syncSession({...scope,actorId:'other'});assert.equal(c.getSnapshot().draft,null);assert.equal(c.getSnapshot().form,null);c.open(editor());change(c,{warehouseEmpty:true});c.syncSession(scope);assert.equal(c.getSnapshot().draft.editor.data.pidEmpty,true);
 c.syncSession({...scope,scope:'demo-scope'});assert.equal(c.getSnapshot().draft,null);c.syncSession(scope);assert.equal(c.getSnapshot().draft.editor.data.pidEmpty,true);
});
test('Submit clears the saved form and cannot resurrect the older replaced draft',()=>{
 const {c,controller}=fixture();c.open(editor());change(c,{pidEmpty:true});c.close();c.open({title:'Тип кабеля',action:'cable',data:{name:''}});change(c,{name:'МКС'});c.submitted();assert.equal(c.getSnapshot().form,null);assert.equal(c.getSnapshot().draft,null);const again=controller();again.syncSession(scope);assert.equal(again.getSnapshot().draft,null);
});
test('Submitting an unrelated unchanged form preserves an existing useful draft',()=>{
 const {c}=fixture();c.open(editor());change(c,{pidEmpty:true});c.close();c.open({title:'Тип кабеля',action:'cable',data:{name:'Pre-filled'}});c.submitted();assert.equal(c.getSnapshot().draft.editor.data.pidEmpty,true);
});
test('Discard removes the local saved form and does not return on session refresh',()=>{
 const {c,controller}=fixture();c.open(editor());change(c,{pidEmpty:true});c.close();c.discard();c.syncSession(scope);assert.equal(c.getSnapshot().draft,null);const again=controller();again.syncSession(scope);assert.equal(again.getSnapshot().draft,null);
});
test('Unavailable browser storage never prevents editing, submitting or deleting',()=>{
 const c=createFormDraftController(()=>{throw new Error('Storage disabled');});assert.doesNotThrow(()=>{c.syncSession(scope);c.open(editor());change(c,{pidEmpty:true});c.submitted();c.syncSession({...scope,actorId:'other'});c.syncSession(scope);});assert.equal(c.getSnapshot().draft,null);assert.equal(c.getSnapshot().storageUnavailable,true);
});
test('Failure removing a previously saved draft cannot resurrect it in this session',()=>{
 const {c,api}=fixture();c.open(editor());change(c,{pidEmpty:true});api.removeItem=()=>{throw new Error('Storage denied');};c.submitted();c.syncSession({...scope,actorId:'other'});c.syncSession(scope);assert.equal(c.getSnapshot().draft,null);
});
