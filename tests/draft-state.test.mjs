import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

test('Authenticated state exposes the latest completed DB reset epoch; demo remains isolated',async()=>{
 const db=new DatabaseSync(':memory:');
 try{
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')))db.exec(readFileSync('drizzle/'+file,'utf8'));
  const binding={prepare(sql){const bind=(...args)=>({sql,async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}});return {...bind(),bind};},async batch(statements){db.exec('BEGIN');try{const output=[];for(const s of statements)output.push(await (/^\s*(SELECT|WITH)\b/i.test(s.sql)?s.all():s.run()));db.exec('COMMIT');return output;}catch(e){db.exec('ROLLBACK');throw e;}}};
  globalThis.__PID_DRAFT_TEST_ENV={DB:binding,APP_MODE:'production',TELEGRAM_BOT_TOKEN:'local-test-token-only',BOT_ENABLED:'false'};
  const dir='outputs/draft-state-test';mkdirSync(dir,{recursive:true});
  for(const name of ['domain','ledger','initialization','seed','store','session','telegram-auth']){
   const source=readFileSync('lib/'+name+'.ts','utf8').replace('from "cloudflare:workers"','from "./runtime"');
   const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "\.\/([a-z-]+)"/g,'from "./$1.mjs"');writeFileSync(dir+'/'+name+'.mjs',code);
  }
  writeFileSync(dir+'/runtime.mjs','export const env=globalThis.__PID_DRAFT_TEST_ENV;\n');
  const routeCode=ts.transpileModule(readFileSync('app/api/state/route.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "@\/lib\/([a-z-]+)"/g,'from "./$1.mjs"');
  writeFileSync(dir+'/route-state.mjs',routeCode);const route=await import(pathToFileURL(process.cwd()+'/'+dir+'/route-state.mjs'));
  const user={name:'Administrator',telegramId:'123456789',roles:['admin'],active:true};
  db.prepare('INSERT INTO documents(namespace,document_id,version,kind,pid,date,author,editor,created_at,request_key,request_hash,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run('production','user:admin',1,'user',null,'2026-09-09','user:admin','user:admin','2026-09-09T01:00:00Z','seed:admin','seed',JSON.stringify(user));
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456789,first_name:'Administrator'})});
  const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n');
  const secret=createHmac('sha256','WebAppData').update('local-test-token-only').digest();params.set('hash',createHmac('sha256',secret).update(check).digest('hex'));
  const request=(headers={})=>route.GET(new Request('https://local.test/api/state',{headers}));
  const production=async()=>{const response=await request({'x-telegram-init-data':params.toString()});assert.equal(response.status,200);return response.json();};
  const initial=await production();assert.equal(initial.dataEpoch,'initial');assert.match(initial.draftScope,/^[a-f0-9]{64}$/);
  const marker=(key,status,date)=>db.prepare('INSERT INTO notifications(key,status,chat_id,created_at,error) VALUES(?,?,?,?,?)').run(key,status,'',date,'PRIVATE_RESET_DETAILS');
  marker('maintenance:reset:earlier','reset_done','2026-09-09T12:00:00Z');
  marker('maintenance:reset:latest','reset_pending_audio','2026-09-09T13:00:00Z');
  marker('maintenance:reset:failed','failed','2026-09-09T14:00:00Z');
  marker('unrelated','reset_done','2026-09-09T15:00:00Z');
  const state=await production();assert.equal(state.dataEpoch,'2026-09-09T13:00:00Z');assert.equal(state.draftScope,initial.draftScope);assert.equal(JSON.stringify(state).includes('PRIVATE_RESET_DETAILS'),false);assert.equal(JSON.stringify(state).includes('maintenance:reset:'),false);
  const denied=await request();assert.equal(denied.status,401);assert.equal((await denied.json()).dataEpoch,undefined);
  globalThis.__PID_DRAFT_TEST_ENV.APP_MODE='demo';
  const demo=async owner=>{const response=await request({'oai-authenticated-user-id':owner,'x-demo-user':'demo-admin'});assert.equal(response.status,200);return response.json();};
  const first=await demo('owner-one'),other=await demo('owner-two');assert.equal(first.dataEpoch,'initial');assert.notEqual(first.draftScope,state.draftScope);assert.notEqual(first.draftScope,other.draftScope);
  marker('maintenance:reset:newer','reset_done','2026-09-10T13:00:00Z');const again=await demo('owner-one');assert.equal(again.dataEpoch,first.dataEpoch);assert.equal(again.draftScope,first.draftScope);
 }finally{db.close();delete globalThis.__PID_DRAFT_TEST_ENV;}
});
