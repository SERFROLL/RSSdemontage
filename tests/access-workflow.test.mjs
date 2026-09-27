import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
function load(file,dependencies={}){const module={exports:{}};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>dependencies[name]||{},module,module.exports);return module.exports;}
const flow=load('lib/access-workflow.ts');
function fixture(member=null){let status={status:'new'},calls=[];const access={accessMember:async()=>member,accessStatus:async()=>status,requestAccess:async(user,name,pending=true)=>{calls.push({kind:'request',id:user.id,name,pending});status={status:pending?'pending':'draft'};return status;},decideAccess:async()=>calls.push({kind:'decision'}),flushAccessMessages:async()=>{},openAccountMarkup:()=>({open:true})};
 const bot=load('lib/operational-bot.ts',{'./observer-access':access,'./access-workflow':flow,'./production-auth':{limited:async()=>{}},'./production-store':{pool:()=>({})},'./store':{runtime:()=>({MINI_APP_URL:'https://example.test'})},'./bot':{sendAccessOnce:async(key,chat,text,markup)=>calls.push({kind:'reply',text,markup}),telegramAccess:async()=>{}}});
 let id=0;return {calls,send:async(text,action)=>bot.operationalStart(action?{update_id:++id,callback_query:{id:'cb',from:{id:11111},message:{chat:{id:11111,type:'private'}},data:action}}:{update_id:++id,message:{from:{id:11111,first_name:'Одноимя'},chat:{id:11111,type:'private'},text}})};}
test('Applicant comment accepts one word; role and administrator name are required independently',()=>{assert.equal(flow.applicantComment(' Иван '),'Иван');assert.throws(()=>flow.applicantComment(' '));assert.throws(()=>flow.accessAssignment({name:'Иван'}),/роль/);assert.throws(()=>flow.accessAssignment({role:'observer'}),/имя/);assert.equal(flow.accessAssignment({name:'Иван',role:'employee'}).role,'employee');});
test('New and existing users receive the same account opening button',async()=>{for(const member of [null,{employee:'a',is_admin:false}]){const f=fixture(member);await f.send('/start');assert.deepEqual(f.calls,[{kind:'reply',text:'Нажмите «ОТКРЫТЬ УЧЁТ».',markup:{open:true}}]);}});
test('No surname is required: begin then free-text comment submits without another confirmation',async()=>{const f=fixture();await f.send('/access');await f.send('Иван');assert.deepEqual(f.calls.filter(c=>c.kind==='request'),[{kind:'request',id:11111,name:'',pending:false},{kind:'request',id:11111,name:'Иван',pending:true}]);await f.send('Иван');assert.equal(f.calls.filter(c=>c.kind==='request').length,2);assert.equal(f.calls.at(-1).text,flow.accessMessages.pending);});
test('Old approve button opens review and cannot silently assign observer',async()=>{const f=fixture({employee:'boss',is_admin:true});await f.send('', 'access:approve:abc');assert.equal(f.calls.filter(c=>c.kind==='decision').length,0);assert.match(f.calls[0].markup.inline_keyboard[0][0].web_app.url,/accessRequest=abc/);});
test('A non-administrator cannot reject applications',async()=>{const f=fixture({employee:'a',is_admin:false});await f.send('','access:reject:abc');assert.equal(f.calls.filter(c=>c.kind==='decision').length,0);assert.match(f.calls.at(-1).text,/администратора/);});

test('Telegram diagnostics distinguish network, authentication and webhook TLS errors without leaking secrets',async()=>{
 const token='123456:test-secret-token';class DomainError extends Error{constructor(message,status){super(message);this.status=status}}
 const bot=load('lib/bot.ts',{'./store':{runtime:()=>({APP_MODE:'production',TELEGRAM_BOT_TOKEN:token})},'./domain':{DomainError,must:(ok,message,status)=>{if(!ok)throw new DomainError(message,status)}}});
 const original=globalThis.fetch;
 try{
  const cases=[{response:()=>{throw Object.assign(Error('https://api.telegram.org/bot'+token),{cause:{code:'ENOTFOUND'}})},expected:'ENOTFOUND'},
   {response:()=>Response.json({ok:false,error_code:401,description:token},{status:401}),expected:'unauthorized'},
   {response:()=>Response.json({ok:false,error_code:400,description:'Bad webhook: SSL certificate error '+token},{status:400}),expected:'webhook_certificate'},
   {response:()=>new Response('not json '+token,{status:502}),expected:'invalid_response'}];
  for(const c of cases){globalThis.fetch=async()=>c.response();await assert.rejects(bot.telegramAccess('setWebhook',{}),error=>{const detail=bot.telegramDiagnostic(error);assert.equal(detail.category,c.expected);assert.ok(!JSON.stringify(detail).includes(token));assert.ok(!JSON.stringify(detail).includes('https:'));return true});}
 }finally{globalThis.fetch=original;}
});
