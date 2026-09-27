import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const code=ts.transpileModule(readFileSync('lib/telegram-client.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 let timeout,script,removed=false;
 const context={exports:{},window:{},document:{createElement:()=>({remove(){removed=true}}),head:{appendChild(s){script=s}}},setTimeout(fn){timeout=fn;return 1},clearTimeout(){}};
 vm.runInNewContext(code,context);
 return {context,load:context.exports.loadTelegram,get script(){return script},timeout:()=>timeout(),get removed(){return removed}};
}
test('Telegram SDK uses our host and recognizes an already initialized SDK',async()=>{
 const f=fixture(),pending=f.load();assert.equal(f.script.src,'/telegram-web-app.js');f.context.window.Telegram={WebApp:{}};f.script.onload();await pending;
 assert.equal(f.script.onload,null);await f.load();
});
test('A stalled SDK request ends with a retryable error instead of waiting forever',async()=>{
 const f=fixture(),pending=f.load();f.timeout();await assert.rejects(pending,/Telegram не загрузился/);assert.equal(f.removed,true);assert.equal(f.script.onload,null);
});
test('A failed SDK connection is reported without pretending Telegram authenticated',async()=>{
 const f=fixture(),pending=f.load();f.script.onerror();await assert.rejects(pending,/Нет соединения/);assert.equal(f.context.window.Telegram,undefined);
});
test('The native loading overlay is dismissed even before the SDK has downloaded',()=>{
 const f=fixture(),events=[];f.context.window.TelegramWebviewProxy={postEvent:(...args)=>events.push(args)};
 f.context.exports.revealTelegramFrame();assert.deepEqual(events,[['web_app_ready','""']]);assert.equal(f.context.window.Telegram,undefined);
});
