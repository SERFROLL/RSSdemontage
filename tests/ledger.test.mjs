import test from "node:test";import assert from "node:assert/strict";import {createHmac} from "node:crypto";import {writeFileSync,readFileSync,readdirSync} from "node:fs";import {DatabaseSync} from "node:sqlite";
import {decimal,weightList,lengthFromMass,prepareCommand,balances,today,adjustmentReviews,summary,expectedReports,windingTotals,woundLength} from "../outputs/test-runtime/domain.mjs";
import {demoDocs} from "../outputs/test-runtime/seed.mjs";
import {exportSnapshot,exportWorkbook} from "../outputs/test-runtime/export.mjs";
import {validateTelegram} from "../outputs/test-runtime/telegram-auth.mjs";
const seed=()=>demoDocs().map((d,i)=>({...d,seq:i+1}));
const actors={foreman:{id:"demo-foreman",name:"Прораб",roles:["foreman"]},winder:{id:"demo-winder",roles:["winder"]},shipper:{id:"demo-shipper",roles:["shipper"]},warehouse:{id:"demo-warehouse",roles:["warehouse"]},admin:{id:"demo-admin",roles:["admin"]},observer:{id:"demo-observer",roles:["observer"]}};
const cmd=(action,data,old)=>({action,data:{...data,...(old?{reason:data.reason||"Исправление по первичным данным"}:{})},requestId:crypto.randomUUID(),id:old?.id,expectedVersion:old?.version});
const replace=(docs,d)=>[...docs.filter(x=>x.id!==d.id),{...d,seq:Math.max(0,...docs.map(x=>x.seq||0))+1}];
const report=(status="work")=>({pid:"pid:1234",date:today(),category:"excavation",status,cableId:"cable:mksb",trench:"210",cable:"420"});
test("Russian decimal masses parse without losing grams",()=>{assert.equal(decimal("123,456"),123456);assert.deepEqual(weightList("123 234\n345;456,5"),[123000,234000,345000,456500]);});
test("Invalid masses, exponent notation and excess precision rejected",()=>{for(const x of ["-1","NaN","1e3","1,2,3","1.2345",""])assert.throws(()=>decimal(x));assert.throws(()=>weightList("0"));assert.throws(()=>decimal("1,5",0));});
test("Sample conversion has dimensional correctness",()=>{assert.equal(lengthFromMass(1158000,20000,10000),579000);});
test("Extraction adds cable metres but winding count is independent",()=>{let d=seed(),before=balances(d).find(x=>x.pid==="pid:1234"&&x.cableId==="cable:mksb");const r=prepareCommand(d,actors.foreman,cmd("report",report()));d=replace(d,r);const after=balances(d).find(x=>x.pid===before.pid&&x.cableId===before.cableId);assert.equal(after.mm-before.mm,420000);assert.equal(after.coils,before.coils);});
test("No-work report stores no numerical quantities",()=>{const r=prepareCommand(seed(),actors.foreman,cmd("report",{...report("idle"),note:"Ремонт"}));assert.equal(r.data.cableMm,undefined);assert.equal(r.data.trenchMm,undefined);assert.equal(r.data.status,"idle");});
test("Repeated report is an edit, not an additional day's volume",()=>{let docs=seed();const a=prepareCommand(docs,actors.foreman,cmd("report",report()));docs=replace(docs,a);assert.throws(()=>prepareCommand(docs,actors.foreman,cmd("report",report())),/уже есть/);const b=prepareCommand(docs,actors.foreman,cmd("report",{...report(),cable:"430"},a));docs=replace(docs,b);assert.equal(summary(docs).cableMm,430000);assert.equal(b.version,2);});
test("Author and assignment guards apply on server",()=>{assert.throws(()=>prepareCommand(seed(),actors.observer,cmd("report",report())),/прав/);const docs=seed().filter(d=>d.kind!=="assignment");assert.throws(()=>prepareCommand(docs,actors.foreman,cmd("report",report())),/закреплены/);});
test("Old author can correct after reassignment, original date retained",()=>{let docs=seed();const old=docs.find(d=>d.kind==="report"&&d.data.category==="excavation");docs=docs.filter(d=>d.kind!=="assignment");const corrected=prepareCommand(docs,actors.foreman,cmd("report",{...report(),date:old.date,cable:"440"},old));assert.equal(corrected.date,old.date);});
test("Non-integer trench/cable ratio and zero trench are valid",()=>{assert.equal(prepareCommand(seed(),actors.foreman,cmd("report",{...report(),trench:"0",cable:"123"})).data.cableMm,123000);});
test("Winding supports counts of several types; fractional counts rejected",()=>{const data={pid:"pid:1234",date:today(),category:"winding",status:"work",lines:[{cableId:"cable:mksb",count:"8"},{cableId:"cable:tk",count:"3"}]};assert.equal(prepareCommand(seed(),actors.winder,cmd("report",data)).data.lines.length,2);data.lines[0].count="1.5";assert.throws(()=>prepareCommand(seed(),actors.winder,cmd("report",data)));});
test("Mixed shipment decreases each type by its own coefficient and count",()=>{const docs=seed(),before=balances(docs),trip=prepareCommand(docs,actors.shipper,cmd("trip",{pid:"pid:1234",date:today(),groups:[{cableId:"cable:mksb",masses:"200"},{cableId:"cable:tk",masses:"90 90"}]}));const after=balances(replace(docs,trip));for(const [c,count,mm] of [["cable:mksb",1,100000],["cable:tk",2,200000]]){const b=before.find(x=>x.pid==="pid:1234"&&x.cableId===c),a=after.find(x=>x.pid==="pid:1234"&&x.cableId===c);assert.equal(b.coils-a.coils,count);assert.equal(b.mm-a.mm,mm);}});
test("New coefficient never changes saved historic shipment length",()=>{let docs=seed();const t=docs.find(d=>d.kind==="trip"),oldMm=t.data.coils[0].sentMm;docs=replace(docs,prepareCommand(docs,actors.admin,cmd("coefficient",{pid:t.pid,date:today(),cableId:"cable:mksb",sampleMetres:"10",sampleKg:"30"})));assert.equal(docs.find(d=>d.id===t.id).data.coils[0].sentMm,oldMm);const newer=prepareCommand(docs,actors.shipper,cmd("trip",{pid:t.pid,date:today(),groups:[{cableId:"cable:mksb",masses:"300"}]}));assert.equal(newer.data.coils[0].sentMm,100000);});
test("Receipt may be in arbitrary coil order; closes full transit despite shortage",()=>{let docs=seed();const t=docs.find(d=>d.kind==="trip"),before=balances(docs).find(x=>x.pid===t.pid&&x.cableId==="cable:mksb");const weights=Object.fromEntries([...t.data.coils].reverse().map(c=>[c.id,String((c.grams-1000)/1000)]));const received=prepareCommand(docs,actors.warehouse,cmd("receipt",{date:today(),weights},t));docs=replace(docs,received);const after=balances(docs).find(x=>x.pid===t.pid&&x.cableId==="cable:mksb");assert.equal(after.mm,before.mm);assert.equal(after.coils,before.coils);assert.equal(after.transitGrams,0);assert.equal(after.differenceGrams,-4000);});
test("Partial receipt rejected, independently weighed masses never overwritten",()=>{const docs=seed(),t=docs.find(d=>d.kind==="trip");assert.throws(()=>prepareCommand(docs,actors.warehouse,cmd("receipt",{date:today(),weights:{}},t)),/все катушки/);});
test("Negative balances persist without manufactured restoration",()=>{const docs=seed(),trip=prepareCommand(docs,actors.shipper,cmd("trip",{pid:"pid:1234",date:today(),groups:[{cableId:"cable:mksb",masses:"100000"}]}));const after=replace(docs,trip);assert.ok(balances(after).find(x=>x.pid==="pid:1234"&&x.cableId==="cable:mksb").mm<0);assert.equal(after.filter(d=>d.kind==="adjustment").length,0);});
test("Correction is based on checked actual, not necessarily zero",()=>{const docs=seed(),r=prepareCommand(docs,actors.admin,cmd("adjustment",{pid:"pid:1234",date:today(),cableId:"cable:mksb",actualMetres:"100",actualCoils:"5",reason:"Пересчёт и измерение"}));const b=balances(replace(docs,r)).find(x=>x.pid==="pid:1234"&&x.cableId==="cable:mksb");assert.equal(b.mm,100000);assert.equal(b.coils,5);assert.equal(summary(replace(docs,r)).cableMm,0);});
test("A late report flags existing correction; adjustment is not silently changed",()=>{let docs=seed(),a=prepareCommand(docs,actors.admin,cmd("adjustment",{pid:"pid:1234",date:today(),cableId:"cable:mksb",actualCoils:"0",actualMetres:"",reason:"Проверка катушек"}));docs=replace(docs,a);const before=docs.find(d=>d.id===a.id).data.deltaCoils;docs=replace(docs,prepareCommand(docs,actors.winder,cmd("report",{pid:"pid:1234",date:today(),category:"winding",status:"work",lines:[{cableId:"cable:mksb",count:"3"}]})));assert.ok(adjustmentReviews(docs).some(x=>x.id===a.id));assert.equal(docs.find(d=>d.id===a.id).data.deltaCoils,before);});
test("Opening accumulated production does not increase inventory twice",()=>{const docs=seed(),b=balances(docs,docs.find(d=>d.kind==="pid").data.cutoff).find(x=>x.pid==="pid:1234"&&x.cableId==="cable:mksb");assert.equal(b.mm,2840000);assert.equal(b.extractedMm,4800000);});
const windingInput=()=>({pid:"pid:1234",date:today(),category:"winding",status:"work",lines:[{cableId:"cable:mksb",count:"3"}]});
const cablePositions=docs=>balances(docs).map(({pid,cableId,mm,warehouseGrams,sentGrams,receivedGrams,transitGrams,differenceGrams})=>({pid,cableId,mm,warehouseGrams,sentGrams,receivedGrams,transitGrams,differenceGrams}));

test("Winding and its correction change only auxiliary counts, never cable length or mass",()=>{
 let docs=seed();const before=cablePositions(docs),input=windingInput(),first=prepareCommand(docs,actors.winder,cmd("report",input));docs=replace(docs,first);
 assert.equal(first.data.lines[0].measurement,undefined);assert.deepEqual(cablePositions(docs),before);assert.equal(windingTotals(docs,today(),input.pid,true).coils,3);
 const edit=prepareCommand(docs,actors.winder,cmd("report",{...input,lines:[{cableId:"cable:mksb",count:"5"}]},first));docs=replace(docs,edit);
 assert.deepEqual(cablePositions(docs),before);assert.equal(windingTotals(docs,today(),input.pid,true).coils,5);
});

test("New winding report cannot manufacture cable measurements",()=>{
 for(const measurement of [{metres:"600",kg:"",weighedOn:today()},{metres:"",kg:"1200",weighedOn:today()}]){
  const input=windingInput();input.lines[0].measurement=measurement;
  assert.throws(()=>prepareCommand(seed(),actors.winder,cmd("report",input)));
 }
});

test("Legacy winding measurements survive an unchanged correction and remain read-only",()=>{
 let docs=seed();const old=docs.find(d=>d.kind==="report"&&d.data.category==="winding");
 const measurement={directMm:600000,grams:1300000,weighedOn:old.date,calculatedMm:650000,coefficient:{id:"legacy-sample",version:1,sampleMm:10000,sampleGrams:20000}};
 old.data.lines[0].measurement=measurement;
 const corrected=prepareCommand(docs,actors.winder,cmd("report",{pid:old.pid,date:old.date,category:"winding",status:"work",lines:[{cableId:"cable:mksb",count:String(old.data.lines[0].count)}]},old));
 assert.deepEqual(corrected.data.lines[0].measurement,measurement);
 assert.throws(()=>prepareCommand(docs,actors.winder,cmd("report",{pid:old.pid,date:old.date,category:"winding",status:"work",lines:[{cableId:"cable:mksb",count:"99"}]},old)));
});

test("Legacy opening values are retained but cannot be edited as a fresh initial balance",()=>{
 const docs=seed(),old=docs.find(d=>d.id==="opening:pid:1234:cable:mksb");
 assert.equal(woundLength(old.data.woundMeasurement),null);
 assert.throws(()=>prepareCommand(docs,actors.admin,cmd("opening",{pid:old.pid,cableId:old.data.cableId,metres:"2840",coils:"6"},old)));
});

test("Ten independently weighed coils produce 9540 kg and 4770 calculated metres",()=>{
 const docs=seed(),before=balances(docs).find(x=>x.pid==="pid:1234"&&x.cableId==="cable:mksb");
 const trip=prepareCommand(docs,actors.shipper,cmd("trip",{pid:"pid:1234",date:today(),groups:[{cableId:"cable:mksb",masses:"801,803,806,900,950,980,1000,1100,1200,1000".split(",").join("\n")}]}));
 assert.equal(trip.data.coils.length,10);assert.equal(trip.data.coils.reduce((n,c)=>n+c.grams,0),9540000);assert.equal(trip.data.coils.reduce((n,c)=>n+c.sentMm,0),4770000);
 const after=balances(replace(docs,trip)).find(x=>x.pid===before.pid&&x.cableId===before.cableId);
 assert.equal(before.mm-after.mm,4770000);assert.equal(after.transitGrams-before.transitGrams,9540000);assert.equal(before.coils-after.coils,10);
});

test("Warehouse correction changes kg only and does not manufacture field metres or production",()=>{
 const docs=seed(),before=balances(docs).find(x=>x.pid==="pid:1234"&&x.cableId==="cable:mksb");
 const correction=prepareCommand(docs,actors.admin,cmd("adjustment",{pid:"pid:1234",date:today(),cableId:"cable:mksb",location:"warehouse",actualKg:"2480.375",reason:"Сверка складского остатка по весам"}));
 const after=balances(replace(docs,correction)).find(x=>x.pid===before.pid&&x.cableId===before.cableId);
 assert.equal(after.warehouseGrams,2480375);assert.equal(after.mm,before.mm);assert.equal(after.coils,before.coils);assert.equal(after.extractedMm,before.extractedMm);
});

test("Editing an earlier warehouse correction flags the later check without rewriting its delta or flagging itself",()=>{
 let docs=seed();const earlierDate=docs.find(d=>d.kind==="trip").date;
 const input={pid:"pid:1234",date:earlierDate,cableId:"cable:mksb",location:"warehouse",actualKg:"100",reason:"Сверка по первой складской ведомости"};
 const earlier=prepareCommand(docs,actors.admin,cmd("adjustment",input));docs=replace(docs,earlier);
 const later=prepareCommand(docs,actors.admin,cmd("adjustment",{...input,date:today(),actualKg:"90",reason:"Повторная сверка остатка на складе"}));docs=replace(docs,later);
 assert.equal(later.data.deltaGrams,-10000);assert.equal(adjustmentReviews(docs).some(d=>[earlier.id,later.id].includes(d.id)),false);
 const edited=prepareCommand(docs,actors.admin,cmd("adjustment",{...input,actualKg:"110",reason:"Исправлена первая ведомость по акту"},earlier));docs=replace(docs,edited);
 const reviews=adjustmentReviews(docs).map(d=>d.id);
 assert.ok(reviews.includes(later.id));assert.equal(reviews.includes(earlier.id),false);
 assert.equal(docs.find(d=>d.id===later.id).data.deltaGrams,-10000);
 assert.equal(balances(docs).find(b=>b.pid===input.pid&&b.cableId===input.cableId).warehouseGrams,100000);
});

test("Correcting a posted report requires a reason",()=>{
 const docs=seed(),old=docs.find(d=>d.kind==="report"&&d.data.category==="excavation");
 assert.throws(()=>prepareCommand(docs,actors.foreman,{...cmd("report",{...report(),date:old.date},old),data:{...report(),date:old.date}}));
});

test("Each foreman/PID has a separate report obligation",()=>{assert.equal(expectedReports(seed(),today()).length,4);});
test("Old exported changes included outside next chosen period",()=>{let docs=seed();const t=docs.find(d=>d.kind==="trip"),first=exportSnapshot(docs,t.date,t.date);docs.push({id:"export1",kind:"export",version:1,date:today(),seq:100,data:first});const changed=prepareCommand(docs,actors.shipper,cmd("trip",{pid:t.pid,date:t.date,groups:[{cableId:"cable:mksb",masses:"124 234 345 456"}]},t));docs=replace(docs,changed);const next=exportSnapshot(docs,today(),today());assert.equal(next.rows.length,4);assert.equal(next.changes.length,4);assert.equal(next.rows[0].id,first.rows[0].id);});
test("Deleted previously exported coil has a tombstone",()=>{let docs=seed();const t=docs.find(d=>d.kind==="trip");const first=exportSnapshot(docs,t.date,t.date);docs.push({id:"export1",kind:"export",version:1,seq:100,data:first});docs=replace(docs,prepareCommand(docs,actors.shipper,cmd("trip",{pid:t.pid,date:t.date,groups:[{cableId:"cable:mksb",masses:"123 234 345"}]},t)));assert.equal(exportSnapshot(docs,today(),today()).rows.filter(r=>r.action==="DELETE").length,1);});
test("Added coil in an exported old dispatch is included outside the selected period",()=>{
 let docs=seed();const t=docs.find(d=>d.kind==="trip"),first=exportSnapshot(docs,t.date,t.date);
 docs.push({id:"export1",kind:"export",version:1,seq:100,data:first});
 docs=replace(docs,prepareCommand(docs,actors.shipper,cmd("trip",{pid:t.pid,date:t.date,groups:[{cableId:"cable:mksb",masses:"123 234 345 456 200"}]},t)));
 const next=exportSnapshot(docs,today(),today());
 assert.equal(next.rows.length,5);assert.equal(next.rows.reduce((n,r)=>n+r.grams,0),1358000);
 assert.equal(next.rows.filter(r=>!first.rows.some(p=>p.id===r.id)).length,1);
 docs.push({id:"export2",kind:"export",version:1,seq:102,data:next});
 assert.equal(exportSnapshot(docs,today(),today()).rows.length,0);
});
test("Unexported historical dispatch is not pulled into an unrelated period",()=>{
 const docs=seed();assert.equal(exportSnapshot(docs,today(),today()).rows.length,0);
});
test("Real XLSX export has ZIP signature and test data",()=>{const d=seed(),t=d.find(x=>x.kind==="trip");const bytes=exportWorkbook(exportSnapshot(d,t.date,t.date),"export-test");assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);writeFileSync("outputs/test-export.xlsx",bytes);});
test("Telegram auth rejects tampering, expiration and duplicate fields",async()=>{const token="123456:test-only",time=Math.floor(Date.now()/1000),p=new URLSearchParams({auth_date:String(time),user:JSON.stringify({id:1234567,first_name:"Test"}),query_id:"abc"});const check=[...p].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+"="+v).join("\n");const secret=createHmac("sha256","WebAppData").update(token).digest();p.set("hash",createHmac("sha256",secret).update(check).digest("hex"));assert.equal((await validateTelegram(p.toString(),token,time)).id,1234567);await assert.rejects(validateTelegram(p.toString(),token,time+4000));await assert.rejects(validateTelegram(p.toString()+"&auth_date="+time,token,time));p.set("user",JSON.stringify({id:999999}));await assert.rejects(validateTelegram(p.toString(),token,time));});
test("Database forbids duplicate versions and duplicate requests",()=>{const db=new DatabaseSync(":memory:");db.exec(readFileSync("drizzle/"+readdirSync("drizzle").find(x=>x.endsWith(".sql")),"utf8"));const q=db.prepare("INSERT INTO documents(namespace,document_id,version,kind,date,author,editor,created_at,request_key,request_hash,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?)");q.run("demo","r",1,"report",today(),"a","a","now","q1","h","{}");assert.throws(()=>q.run("demo","r",1,"report",today(),"a","a","now","q2","h","{}"));assert.throws(()=>q.run("demo","r",2,"report",today(),"a","a","now","q1","h","{}"));db.close();});
