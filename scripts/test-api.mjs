// Executes the real route handlers against in-memory SQLite without network or a browser.
import ts from "typescript";import {DatabaseSync} from "node:sqlite";import {readFileSync,writeFileSync,mkdirSync,readdirSync} from "node:fs";import assert from "node:assert/strict";
const dir="outputs/api-test";mkdirSync(dir,{recursive:true});
for(const name of ["domain","seed","store","session","telegram-auth","xlsx","export"]){
 let source=readFileSync("lib/"+name+".ts","utf8").replace('from "cloudflare:workers"','from "./runtime"');
 let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "\.\/([a-z-]+)"/g,'from "./$1.mjs"');writeFileSync(dir+"/"+name+".mjs",code);
}
for(const name of ["state","command","history","export","backup"]){let code=ts.transpileModule(readFileSync("app/api/"+name+"/route.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "@\/lib\/([a-z-]+)"/g,'from "./$1.mjs"');writeFileSync(dir+"/route-"+name+".mjs",code);}
writeFileSync(dir+"/runtime.mjs","export const env=globalThis.__PID_TEST_ENV;\n");
let db, binding, close, databaseLabel;
if(process.env.TEST_DATABASE_URL){
 const url=new URL(process.env.TEST_DATABASE_URL);
 if(!["localhost","127.0.0.1"].includes(url.hostname)||url.pathname!=="/pid_cable_test")throw new Error("Tests require a local, dedicated pid_cable_test database");
 const {createPool,createDatabase}=await import("../server/postgres.mjs");
 const {migrate}=await import("../server/migrate.mjs");
 db=createPool({DATABASE_URL:url.toString(),DATABASE_SSL:"false"});await migrate(db);
 await db.query("TRUNCATE documents, notifications RESTART IDENTITY");
 binding=createDatabase(db);close=()=>db.end();databaseLabel="PostgreSQL";
}else{
 db=new DatabaseSync(":memory:");
 for(const f of readdirSync("drizzle").filter(x=>x.endsWith(".sql")))db.exec(readFileSync("drizzle/"+f,"utf8"));
 binding={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}}}}},async batch(statements){db.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await s.run());db.exec("COMMIT");return out;}catch(e){db.exec("ROLLBACK");throw e;}}};
 close=()=>db.close();databaseLabel="SQLite";
}
globalThis.__PID_TEST_ENV={DB:binding,APP_MODE:"demo",BOT_ENABLED:"false"};
const routes={};for(const n of ["state","command","history","export","backup"])routes[n]=await import("../"+dir+"/route-"+n+".mjs");
const h={"oai-authenticated-user-id":"api-test-owner","x-demo-user":"demo-admin","Content-Type":"application/json"};
async function request(path,options={}){const name=path.split("?")[0].split("/").pop(),method=options.method||"GET";return routes[name][method](new Request("https://example.test"+path,{...options,headers:{...h,...options.headers}}));}
let checks=0;
try{
 let r=await request("/api/state");const s=await r.json();assert.equal(r.status,200,JSON.stringify(s));assert.equal(s.docs.filter(d=>d.kind==="pid").length,2);checks++;
 const body={action:"report",requestId:"api-report-1",data:{pid:"pid:1234",date:s.date,category:"excavation",status:"work",cableId:"cable:mksb",trench:"210",cable:"420"}};
 r=await request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-foreman"},body:JSON.stringify(body)});const saved=await r.json();assert.equal(r.status,200,JSON.stringify(saved));assert.equal(saved.doc.data.cableMm,420000);checks++;
 r=await request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-foreman"},body:JSON.stringify(body)});assert.equal((await r.json()).replayed,true);checks++;
 r=await request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-observer"},body:JSON.stringify({...body,requestId:"other"})});assert.equal(r.status,403);checks++;
 const update={...body,id:saved.doc.id,expectedVersion:1,requestId:"api-report-edit",data:{...body.data,cable:"430"}};
 const parallel=await Promise.all([request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-foreman"},body:JSON.stringify(update)}),request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-foreman"},body:JSON.stringify({...update,requestId:"competing",data:{...update.data,cable:"450"}})})]);assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);checks++;
 const t=s.docs.find(d=>d.kind==="trip"),weights=Object.fromEntries([...t.data.coils].reverse().map(c=>[c.id,String((c.grams-1000)/1000)]));
 r=await request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-warehouse"},body:JSON.stringify({action:"receipt",requestId:"api-receive",id:t.id,expectedVersion:1,data:{date:s.date,weights}})});assert.equal(r.status,200,await r.text());checks++;
 r=await request("/api/state");const after=await r.json();assert.equal(after.balances.find(x=>x.pid===t.pid&&x.cableId==="cable:mksb").transitGrams,0);checks++;
 r=await request("/api/export",{method:"POST",body:JSON.stringify({from:t.date,to:s.date,requestId:"api-export"})});assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get("Content-Type"),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");writeFileSync("outputs/api-export.xlsx",new Uint8Array(await r.arrayBuffer()));checks++;
 r=await request("/api/history?id="+encodeURIComponent(saved.doc.id));assert.equal((await r.json()).history.length,2);checks++;
 r=await routes.state.GET(new Request("https://example.test/api/state"));assert.equal(r.status,401);checks++;
 r=await request("/api/command",{method:"POST",headers:{origin:"https://attacker.invalid"},body:JSON.stringify(body)});assert.equal(r.status,403);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify({action:"adjustment",requestId:"adjust-check",data:{pid:"pid:1234",date:s.date,cableId:"cable:mksb",actualCoils:"5",actualMetres:"",reason:"Проверено вручную"}})});assert.equal(r.status,200,await r.text());checks++;
 const opening=s.docs.find(d=>d.id==="opening:pid:1234:cable:mksb");
 const measuredOpening={action:"opening",requestId:"opening-metres",id:opening.id,expectedVersion:opening.version,data:{pid:opening.pid,cableId:opening.data.cableId,metres:"2840",coils:"6",accumulatedExtracted:"4800",accumulatedWound:"12",accumulatedWoundMetres:"4000",woundMeasurement:{metres:"1800",kg:"",weighedOn:s.date}}};
 r=await request("/api/command",{method:"POST",body:JSON.stringify(measuredOpening)});const withMetres=await r.json();assert.equal(r.status,200,JSON.stringify(withMetres));assert.equal(withMetres.doc.data.woundMeasurement.grams,null);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify({...measuredOpening,requestId:"opening-later-weight",expectedVersion:withMetres.doc.version,data:{...measuredOpening.data,woundMeasurement:{metres:"1800",kg:"4000",weighedOn:s.date}}})});assert.equal(r.status,200,await r.text());
 r=await request("/api/state");const reopened=(await r.json()).docs.find(d=>d.id===opening.id);assert.equal(reopened.data.mm,2840000);assert.equal(reopened.data.woundMeasurement.directMm,1800000);assert.equal(reopened.data.woundMeasurement.calculatedMm,2000000);assert.equal(reopened.data.accumulatedWoundMm,4000000);checks++;
 r=await request("/api/history?id="+encodeURIComponent(opening.id));const openingHistory=(await r.json()).history;assert.equal(openingHistory.length,3);assert.ok(openingHistory.some(d=>d.data.woundMeasurement?.grams===null));assert.ok(openingHistory.some(d=>d.data.woundMeasurement?.grams===4000000));checks++;
 if(process.env.TEST_DATABASE_URL){
  const {migrate,bootstrapOwner}=await import("../server/migrate.mjs");
  await migrate(db);await migrate(db);
  r=await request("/api/state");assert.ok((await r.json()).docs.some(d=>d.id===saved.doc.id));checks++;
  const config={ADMIN_TELEGRAM_ID:"123456789"};await bootstrapOwner(binding,config);await bootstrapOwner(binding,config);
  assert.equal((await db.query("SELECT count(*)::integer AS n FROM documents WHERE namespace='production'")).rows[0].n,1);checks++;
  await assert.rejects(()=>bootstrapOwner(binding,{ADMIN_TELEGRAM_ID:"987654321"}));checks++;
  const claims=await Promise.all([1,2].map(()=>binding.prepare("INSERT OR IGNORE INTO notifications(key,status,chat_id,created_at) VALUES (?,'sending',?,?) RETURNING key").bind("same-notification","test",new Date().toISOString()).first()));
  assert.equal(claims.filter(Boolean).length,1);checks++;
  await assert.rejects(()=>binding.batch([
   binding.prepare("INSERT INTO notifications(key,status,chat_id,created_at) VALUES (?,'sending',?,?)").bind("rollback-test","test","now"),
   binding.prepare("INSERT INTO notifications(key,status,chat_id,created_at) VALUES (?,'sending',?,?)").bind("same-notification","test","now")
  ]));
  assert.equal(await binding.prepare("SELECT key FROM notifications WHERE key=?").bind("rollback-test").first(),null);checks++;
 }
 console.log("API checks passed: "+checks+" (real route handlers + "+databaseLabel+").");
}finally{await close();}
