// Executes the real route handlers against in-memory SQLite without network or a browser.
import ts from "typescript";import {DatabaseSync} from "node:sqlite";import {readFileSync,writeFileSync,mkdirSync,readdirSync} from "node:fs";import assert from "node:assert/strict";
const dir="outputs/api-test";mkdirSync(dir,{recursive:true});
for(const name of ["domain","ledger","initialization","seed","store","session","telegram-auth","xlsx","export"]){
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
 await db.query("TRUNCATE documents, notifications RESTART IDENTITY CASCADE");
 binding=createDatabase(db);close=()=>db.end();databaseLabel="PostgreSQL";
}else{
 db=new DatabaseSync(":memory:");
 for(const f of readdirSync("drizzle").filter(x=>x.endsWith(".sql")))db.exec(readFileSync("drizzle/"+f,"utf8"));
 binding={prepare(sql){return {bind(...args){return {sql,async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){return db.prepare(sql).run(...args);}}}}},async batch(statements){db.exec("BEGIN");try{const out=[];for(const s of statements)out.push(await (/^\s*(SELECT|WITH)\b/i.test(s.sql)?s.all():s.run()));db.exec("COMMIT");return out;}catch(e){db.exec("ROLLBACK");throw e;}}};
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
 const update={...body,id:saved.doc.id,expectedVersion:1,requestId:"api-report-edit",data:{...body.data,cable:"430",reason:"Исправлен метраж по ведомости"}};
 const parallel=await Promise.all([request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-foreman"},body:JSON.stringify(update)}),request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-foreman"},body:JSON.stringify({...update,requestId:"competing",data:{...update.data,cable:"450"}})})]);assert.deepEqual(parallel.map(x=>x.status).sort(),[200,409]);checks++;
 const t=s.docs.find(d=>d.kind==="trip"),weights=Object.fromEntries([...t.data.coils].reverse().map(c=>[c.id,String((c.grams-1000)/1000)]));
 r=await request("/api/command",{method:"POST",headers:{"x-demo-user":"demo-warehouse"},body:JSON.stringify({action:"receipt",requestId:"api-receive",id:t.id,expectedVersion:1,data:{date:s.date,weights}})});assert.equal(r.status,200,await r.text());checks++;
 r=await request("/api/state");const after=await r.json();assert.equal(after.balances.find(x=>x.pid===t.pid&&x.cableId==="cable:mksb").transitGrams,0);checks++;
 r=await request("/api/export",{method:"POST",body:JSON.stringify({from:t.date,to:s.date,requestId:"api-export"})});assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get("Content-Type"),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");writeFileSync("outputs/api-export.xlsx",new Uint8Array(await r.arrayBuffer()));checks++;
 r=await request("/api/history?id="+encodeURIComponent(saved.doc.id));assert.equal((await r.json()).history.length,2);checks++;
 r=await routes.state.GET(new Request("https://example.test/api/state"));assert.equal(r.status,401);checks++;
 r=await request("/api/command",{method:"POST",headers:{origin:"https://attacker.invalid"},body:JSON.stringify(body)});assert.equal(r.status,403);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify({action:"adjustment",requestId:"adjust-check",data:{pid:"pid:1234",date:s.date,cableId:"cable:mksb",actualCoils:"5",actualMetres:"",reason:"Проверено вручную"}})});assert.equal(r.status,200,await r.text());checks++;
 // The production cutover creates one snapshot per PID with independent locations.
 r=await request("/api/command",{method:"POST",body:JSON.stringify({action:"pid",requestId:"new-pid-v2",data:{code:"7777",cutoff:s.date}})});assert.equal(r.status,200,await r.text());checks++;
 const initial={action:"initialize",requestId:"opening-v2",data:{pid:"pid:7777",pidStockChecked:true,mainStockChecked:true,pidEmpty:false,warehouseEmpty:false,lines:[{location:"pid",cableId:"cable:mksb",metres:"1250.125"},{location:"warehouse",cableId:"cable:mksb",kg:"2480.375"}]}};
 r=await request("/api/command",{method:"POST",body:JSON.stringify(initial)});const initialSaved=await r.json();assert.equal(r.status,200,JSON.stringify(initialSaved));assert.equal(initialSaved.doc.data.schemaVersion,2);assert.equal(initialSaved.doc.data.initialPidCoils,0);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify(initial)});assert.equal(r.status,200);assert.equal((await r.json()).replayed,true);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify({...initial,requestId:"opening-v2-duplicate"})});assert.equal(r.status,409,await r.text());checks++;
 r=await request("/api/state");let current=await r.json(),initialBalance=current.balances.find(b=>b.pid==="pid:7777"&&b.cableId==="cable:mksb");
 assert.equal(initialBalance.mm,1250125);assert.equal(initialBalance.warehouseGrams,2480375);assert.equal(initialBalance.coils,0);assert.equal(initialBalance.transitGrams,0);assert.equal(initialBalance.extractedMm,0);
 assert.equal(current.docs.filter(d=>d.pid==="pid:7777"&&["report","trip","opening"].includes(d.kind)).length,0);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify({action:"opening",requestId:"legacy-opening-write",data:{pid:"pid:7777",cableId:"cable:mksb",metres:"9000",coils:"100"}})});assert.equal(r.status,409,await r.text());checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify({action:"adjustment",requestId:"warehouse-correction",data:{pid:"pid:7777",date:s.date,cableId:"cable:mksb",location:"warehouse",actualKg:"2400.5",reason:"Сверка начальной складской ведомости"}})});assert.equal(r.status,200,await r.text());checks++;
 r=await request("/api/state");current=await r.json();const correctedBalance=current.balances.find(b=>b.pid==="pid:7777"&&b.cableId==="cable:mksb");
 assert.equal(correctedBalance.mm,1250125);assert.equal(correctedBalance.warehouseGrams,2400500);assert.equal(correctedBalance.coils,0);checks++;
 r=await request("/api/history?id="+encodeURIComponent(initialSaved.doc.id));assert.equal((await r.json()).history.length,1);checks++;
 // Concurrent first confirmations must never create two opening snapshots.
 r=await request("/api/command",{method:"POST",body:JSON.stringify({action:"pid",requestId:"new-pid-race",data:{code:"8888",cutoff:s.date}})});assert.equal(r.status,200,await r.text());
 const empty={action:"initialize",requestId:"empty-1",data:{pid:"pid:8888",pidStockChecked:true,mainStockChecked:true,pidEmpty:true,warehouseEmpty:true,lines:[]}};
 const openings=await Promise.all([request("/api/command",{method:"POST",body:JSON.stringify(empty)}),request("/api/command",{method:"POST",body:JSON.stringify({...empty,requestId:"empty-2"})})]);
 assert.deepEqual(openings.map(x=>x.status).sort(),[200,409]);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify({...initial,requestId:initial.requestId,data:{...initial.data,lines:[{location:"pid",cableId:"cable:mksb",metres:"1"},{location:"warehouse",cableId:"cable:mksb",kg:"2"}]}})});assert.equal(r.status,409,await r.text());checks++;
 // Inspect the persisted journal, not only the in-memory domain projection.
 const ns="demo:api-test-owner";
 const query=async(sql,...args)=>(await binding.prepare(sql).bind(...args).all()).results;
 const journalCount=async()=>Number((await query("SELECT COUNT(*) AS n FROM accounting_documents WHERE namespace=?",ns))[0].n);
 const beforeReload=await journalCount();
 await request("/api/state");await request("/api/state");assert.equal(await journalCount(),beforeReload);checks++;
 const imbalanced=await query("SELECT l.id,q.unit,SUM(e.sign*q.value_base) AS total FROM ledger_entries e JOIN quantity_values q ON q.id=e.value_id JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents a ON a.id=l.accounting_document_id WHERE a.namespace=? GROUP BY l.id,q.unit HAVING SUM(e.sign*q.value_base)<>0",ns);
 assert.deepEqual(imbalanced,[]);checks++;
 const physical=await query("SELECT l.origin_pid,l.cable_id,a.kind,SUM(e.sign*q.value_base) AS amount FROM ledger_entries e JOIN stock_accounts a ON a.id=e.account_id JOIN quantity_values q ON q.id=e.value_id JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? AND l.operation_date<=? AND a.kind IN ('pid','warehouse','transit') GROUP BY l.origin_pid,l.cable_id,a.kind",ns,s.date);
 const coils=await query("SELECT l.origin_pid,l.cable_id,SUM(e.delta_count) AS amount FROM coil_entries e JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? AND l.operation_date<=? GROUP BY l.origin_pid,l.cable_id",ns,s.date);
 r=await request("/api/state");current=await r.json();assert.equal(current.accountingVersion,2);
 for(const b of current.balances){
  for(const [kind,field] of [["pid","mm"],["warehouse","warehouseGrams"],["transit","transitGrams"]])assert.equal(Number(physical.find(p=>p.origin_pid===b.pid&&p.cable_id===b.cableId&&p.kind===kind)?.amount||0),b[field],b.pid+" "+b.cableId+" "+field);
  assert.equal(Number(coils.find(p=>p.origin_pid===b.pid&&p.cable_id===b.cableId)?.amount||0),b.coils);
 }checks++;
 const reversalRows=await query("SELECT e.reverses_entry_id FROM ledger_entries e JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? AND d.document_id=? AND e.reverses_entry_id IS NOT NULL",ns,saved.doc.id);
 assert.ok(reversalRows.length>=2);checks++;
 // A failure inside the actual transaction must roll back source and journal together.
 const rejectedBody={action:"report",requestId:"injected-transaction-failure",data:{pid:"pid:7777",date:s.date,category:"excavation",status:"work",cableId:"cable:mksb",trench:"10",cable:"20"}};
 const badStatement=binding.prepare("INSERT INTO accounting_write_checks (token,valid) VALUES (?,?)").bind("deliberate-test-failure",0);
 globalThis.__PID_TEST_ENV.DB={prepare:binding.prepare.bind(binding),batch:statements=>binding.batch([...statements,badStatement])};
 try{r=await request("/api/command",{method:"POST",body:JSON.stringify(rejectedBody)});assert.equal(r.status,409,await r.text());}finally{globalThis.__PID_TEST_ENV.DB=binding;}
 assert.equal((await query("SELECT document_id FROM documents WHERE namespace=? AND request_key=?",ns,"demo-admin:injected-transaction-failure")).length,0);
 assert.equal(await journalCount(),beforeReload);checks++;
 r=await request("/api/command",{method:"POST",body:JSON.stringify(rejectedBody)});assert.equal(r.status,200,await r.text());checks++;
 r=await request("/api/backup");const backup=await r.json();assert.equal(r.status,200,JSON.stringify(backup));assert.equal(backup.format,"pid-ledger-backup/2");
 for(const name of ["accounting_documents","stock_accounts","document_lines","quantity_values","quantity_inputs","ledger_entries","coil_entries","opening_batches"])assert.ok(Array.isArray(backup.journal[name]),name);
 assert.ok(backup.documents.every(d=>d.namespace===ns));assert.ok(backup.journal.accounting_documents.every(d=>d.namespace===ns));
 assert.equal(backup.journal.opening_batches.filter(b=>b.pid==="pid:7777").length,1);assert.ok(backup.journal.ledger_entries.length>0);checks++;
 r=await request("/api/backup",{headers:{"x-demo-user":"demo-observer"}});assert.equal(r.status,403);checks++;
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
  // A valid foreign-key leg with no balancing partner must fail at COMMIT.
  // The sibling write proves that the deferred constraint rolls back the whole batch.
  const leg=(await query("SELECT e.line_id,e.account_id,e.value_id,e.unit,e.sign FROM ledger_entries e JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id JOIN quantity_values q ON q.id=e.value_id WHERE d.namespace=? AND q.value_base>0 ORDER BY e.id LIMIT 1",ns))[0];
  assert.ok(leg,"A positive quantity in this test namespace is required");
  const unbalancedId="unbalanced-test:"+crypto.randomUUID();
  await assert.rejects(()=>binding.batch([
   binding.prepare("INSERT INTO notifications(key,status,chat_id,created_at) VALUES (?,'sending',?,?)").bind(unbalancedId,"test","now"),
   binding.prepare("INSERT INTO ledger_entries(id,line_id,account_id,value_id,unit,sign) VALUES (?,?,?,?,?,?)").bind(unbalancedId,leg.line_id,leg.account_id,leg.value_id,leg.unit,leg.sign)
  ]),/Unbalanced cable journal line/);
  assert.equal(await binding.prepare("SELECT key FROM notifications WHERE key=?").bind(unbalancedId).first(),null);
  assert.equal(await binding.prepare("SELECT id FROM ledger_entries WHERE id=?").bind(unbalancedId).first(),null);checks++;
 }
 console.log("API checks passed: "+checks+" (real route handlers + "+databaseLabel+").");
}finally{await close();}
