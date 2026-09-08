// Executes the real route handlers against in-memory SQLite without network or a browser.
import ts from "typescript";import {DatabaseSync} from "node:sqlite";import {readFileSync,writeFileSync,mkdirSync,readdirSync} from "node:fs";import assert from "node:assert/strict";
const dir="outputs/api-test";mkdirSync(dir,{recursive:true});
for(const name of ["domain","seed","store","session","telegram-auth","xlsx","export"]){
 let source=readFileSync("lib/"+name+".ts","utf8").replace('from "cloudflare:workers"','from "./runtime"');
 let code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "\.\/([a-z-]+)"/g,'from "./$1.mjs"');writeFileSync(dir+"/"+name+".mjs",code);
}
for(const name of ["state","command","history","export","backup"]){let code=ts.transpileModule(readFileSync("app/api/"+name+"/route.ts","utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "@\/lib\/([a-z-]+)"/g,'from "./$1.mjs"');writeFileSync(dir+"/route-"+name+".mjs",code);}
writeFileSync(dir+"/runtime.mjs","export const env=globalThis.__PID_TEST_ENV;\n");
const db=new DatabaseSync(":memory:");
for(const f of readdirSync("drizzle").filter(x=>x.endsWith(".sql")))db.exec(readFileSync("drizzle/"+f,"utf8"));
const binding={prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}}}}},async batch(statements){db.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await s.run());db.exec("COMMIT");return out;}catch(e){db.exec("ROLLBACK");throw e;}}};
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
 console.log("API checks passed: "+checks+" (real route handlers + SQLite, no network).");
}finally{db.close();}
