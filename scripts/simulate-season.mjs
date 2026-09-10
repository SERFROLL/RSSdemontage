// Reproducible role/API simulation. Only creates a local SQLite database.
import ts from 'typescript';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createHmac,createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
const out='outputs/season-2026';fs.mkdirSync(out+'/runtime',{recursive:true});
for(const n of ['domain','ledger','initialization','seed','store','session','telegram-auth','xlsx','export']){
 let source=fs.readFileSync('lib/'+n+'.ts','utf8').replace('from "cloudflare:workers"','from "./runtime"');
 fs.writeFileSync(`${out}/runtime/${n}.mjs`,ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "\.\/([a-z-]+)"/g,'from "./$1.mjs"'));
}
for(const n of ['state','command','history','export','backup'])fs.writeFileSync(`${out}/runtime/route-${n}.mjs`,ts.transpileModule(fs.readFileSync(`app/api/${n}/route.ts`,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from "@\/lib\/([a-z-]+)"/g,'from "./$1.mjs"'));
fs.writeFileSync(out+'/runtime/runtime.mjs','export const env=globalThis.__SEASON_ENV;');
// Never overwrite a preceding run: the database is an inspectable output.
const dbFile=out+'/run-'+Date.now()+'.sqlite';const db=new DatabaseSync(dbFile);
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')))db.exec(fs.readFileSync('drizzle/'+f,'utf8'));
let queue=Promise.resolve();
const binding={prepare(sql){const bind=(...args)=>({sql,async first(){return db.prepare(sql).get(...args)||null},async all(){return {results:db.prepare(sql).all(...args)}},async run(){return db.prepare(sql).run(...args)}});return {...bind(),bind}},batch(statements){const task=queue.then(async()=>{db.exec('BEGIN');try{const values=[];for(const s of statements)values.push(await (/^\s*(SELECT|WITH)\b/i.test(s.sql)?s.all():s.run()));db.exec('COMMIT');return values}catch(e){db.exec('ROLLBACK');throw e}});queue=task.catch(()=>{});return task}};
const token='local-synthetic-season-token';globalThis.__SEASON_ENV={DB:binding,APP_MODE:'production',BOT_ENABLED:'false',TELEGRAM_BOT_TOKEN:token};
const routes={};for(const n of ['state','command','history','export','backup'])routes[n]=await import(`../${out}/runtime/route-${n}.mjs`);
const {readDocs}=await import(`../${out}/runtime/store.mjs`);
const {balances}=await import(`../${out}/runtime/domain.mjs`);
const admin='sim:admin';let uid=800000000000;const ids=new Map([[admin,String(++uid)]]),names=new Map([[admin,'ТЕСТ · Михаил Ломоносов']]);
db.prepare('INSERT INTO documents(namespace,document_id,version,kind,date,author,editor,created_at,request_key,request_hash,payload) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('production',admin,1,'user','2026-06-01',admin,admin,new Date().toISOString(),'seed:season','seed',JSON.stringify({name:names.get(admin),telegramId:ids.get(admin),roles:['admin'],active:true}));
function auth(who){const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:Number(ids.get(who)),first_name:names.get(who)})});const secret=createHmac('sha256','WebAppData').update(token).digest();p.set('hash',createHmac('sha256',secret).update([...p].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>k+'='+v).join('\n')).digest('hex'));return p.toString()}
async function request(who,path,method='GET',body){return routes[path.split('?')[0]][method](new Request('https://season.test/api/'+path,{method,headers:{'Content-Type':'application/json','x-telegram-init-data':auth(who)},...(body?{body:JSON.stringify(body)}:{})}))}
let count=0,checks=0;const tasks=[],anomalies=[],expected=new Map(),snapshots=[];
const row=(pid,cable)=>{const k=pid+'|'+cable;if(!expected.has(k))expected.set(k,{pid,cableId:cable,mm:0,warehouseGrams:0,transitGrams:0,coils:0});return expected.get(k)};
async function send(who,action,data,{id,expectedVersion,expect=200,label='',requestId}={}){
 const cmd={action,data,requestId:requestId||'season:'+ ++count,...(id?{id}:{}),...(expectedVersion?{expectedVersion}:{})};
 const r=await request(who,'command','POST',cmd),result=await r.json();assert.equal(r.status,expect,`${action} ${who} ${data.date||''}: ${JSON.stringify(result)}`);checks++;
 tasks.push({n:tasks.length+1,who,name:names.get(who),label,command:cmd,expectedStatus:expect,result:result.error||result.doc?.id});return result.doc;
}
async function verify(label,date){const docs=await readDocs('production'),actual=balances(docs,date);for(const e of expected.values()){const a=actual.find(x=>x.pid===e.pid&&x.cableId===e.cableId);assert.ok(a,label);for(const f of ['mm','warehouseGrams','transitGrams','coils'])assert.equal(a[f],e[f],`${label}: ${e.pid} ${e.cableId} ${f}`);checks++}snapshots.push({label,date,balances:actual});}
async function user(id,name,roles){ids.set(id,String(++uid));names.set(id,name);await send(admin,'user',{name,roles,telegramId:ids.get(id),active:true},{id});return id}
const shipper=await user('sim:shipper','ТЕСТ · Исаак Ньютон',['shipper']);
const keeper=await user('sim:warehouse','ТЕСТ · Мария Кюри',['warehouse']);
const observer=await user('sim:observer','ТЕСТ · Альберт Эйнштейн',['observer']);
const secondAdmin=await user('sim:admin2','ТЕСТ · Дмитрий Менделеев',['admin']);
const cables=[['sim:cable:1','ТЕСТ · Кабель Альфа (медный)',2],['sim:cable:2','ТЕСТ · Кабель Бета (алюминиевый)',1],['sim:cable:3','ТЕСТ · Кабель Гамма (бронированный)',4]];
for(const [id,name]of cables)await send(admin,'cable',{name},{id});
const scientistNames=['Николай Лобачевский','Сергей Королёв','Софья Ковалевская','Никола Тесла','Иван Павлов','Леонард Эйлер','Ада Лавлейс','Нильс Бор','Макс Планк','Алан Тьюринг','Галилео Галилей'];let scientistIndex=0;const pids=['101','202','303'],workers=[];
for(const [p,code]of pids.entries()){
 const pid='pid:'+code;await send(admin,'pid',{code,cutoff:'2026-06-01'});
 for(const [cable,,k]of cables){await send(admin,'coefficient',{pid,cableId:cable,date:'2026-06-01',sampleMetres:'10',sampleKg:String(k*10)});row(pid,cable).mm=100000;row(pid,cable).warehouseGrams=50000}
 await send(admin,'initialize',{pid,pidStockChecked:true,mainStockChecked:true,pidEmpty:false,warehouseEmpty:false,lines:cables.flatMap(([cableId])=>[{location:'pid',cableId,metres:'100'},{location:'warehouse',cableId,kg:'50'}])});
 const roles=['foreman','foreman',...Array(p===1?1:2).fill('winder')];
 for(const [i,role]of roles.entries()){const id=`sim:${code}:${role}:${i}`;await user(id,'ТЕСТ · '+scientistNames[scientistIndex++], [role]);workers.push({id,pid,p,i,role});await send(admin,'assignment',{pid,userId:id,role,from:'2026-06-01',until:''})}
 await send(admin,'assignment',{pid,userId:shipper,role:'shipper',from:'2026-06-01',until:''});
}
await verify('Начальные остатки','2026-06-01');
// Expected failures must not create any documents or stock movements.
const failBase={pid:'pid:101',date:'2026-06-02',category:'excavation',status:'work',cableId:cables[0][0],trench:'1',cable:'2'};
await send(observer,'report',failBase,{expect:403,label:'Наблюдатель не вводит производственные данные'});
await send(workers.find(w=>w.pid==='pid:202').id,'report',failBase,{expect:403,label:'Чужой ПИД'});
await send(admin,'initialize',{pid:'pid:101',pidStockChecked:true,mainStockChecked:true,pidEmpty:true,warehouseEmpty:true,lines:[]},{expect:409,label:'Повторный начальный остаток'});
await send(workers[0].id,'report',{...failBase,date:'2026-05-31'},{expect:403,label:'Дата вне закрепления'});
const comments=['Не вышла техника: ремонт гидролинии экскаватора.','Работы остановлены: подтоплен участок траншеи.','Задержана выдача допуска на участок.','Нет подачи кабеля: бригада готовит подход к трассе.','Неисправен привод намоточного станка.','Ожидаем освобождения временной площадки.'];
const days=[];for(const month of [6,8])for(let d=1;d<=31;d++){const day=`2026-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`,dt=new Date(day+'T12:00:00Z');if(dt.getUTCMonth()!==month-1||[0,6].includes(dt.getUTCDay()))continue;days.push(day)}
let reports=0,violations=0;const pending=[],receipts=[];const coef=new Map(cables.map(([id,,k])=>[id,k]));
for(const [di,date]of days.entries()){
 // Receipts use independent measured weights and close only the selected trip.
 for(const item of receipts.filter(x=>!x.done&&x.date<=date)){const weights=Object.fromEntries(item.trip.data.coils.map((c,i)=>[c.id,String(c.grams/1000+(i===0?item.delta:0))]));await send(keeper,'receipt',{date:item.date,weights},{id:item.trip.id,expectedVersion:item.trip.version});for(const c of item.trip.data.coils){const e=row(item.trip.pid,c.cableId);e.transitGrams-=c.grams;e.warehouseGrams+=Math.round(Number(weights[c.id])*1000)}item.done=true}
 for(const w of workers){reports++;const cable=cables[(di+w.i+w.p)%3][0],bad=reports%5===0;if(bad)violations++;const variant=bad?Math.floor(reports/5)%4:-1;let data={pid:w.pid,date,category:w.role==='foreman'?'excavation':'winding',status:'work',note:''};
  if(w.role==='foreman')Object.assign(data,{cableId:cable,trench:String(80+(di%5)*10+w.p*5),cable:String(180+(di%7)*10+w.i*20)});else data.lines=[{cableId:cable,count:String(2+(di+w.i)%3)}];
  if(bad){data.note=variant===0?comments[Math.floor(reports/5)%comments.length]:variant===1?'Отчёт передан с опозданием: на участке отсутствовала связь.':variant===2?'Сниженная выработка: подготовка подходов и сортировка кабеля.':'После сверки сменной ведомости требуется уточнение количества.';anomalies.push({date,who:names.get(w.id),pid:w.pid,type:['Простой','Поздний отчёт','Сниженная выработка','Исправление'][variant],note:data.note});if(variant===0)data.status='idle';if(variant===2){if(w.role==='foreman')data.cable=String(Number(data.cable)/2);else data.lines[0].count='1'}}
  const execute=async()=>{const saved=await send(w.id,'report',data,{label:bad?data.note:'Обычная смена'});if(data.status==='work'){const e=row(w.pid,cable);if(w.role==='foreman')e.mm+=Number(data.cable)*1000;else e.coils+=Number(data.lines[0].count)}
   if(variant===3){const fixed=structuredClone(data);fixed.reason=w.role==='foreman'?'Уточнена оценка извлечения по журналу прораба.':'Сверка готовых катушек: одна катушка учтена дважды.';if(w.role==='foreman'){fixed.cable=String(Number(data.cable)-10);row(w.pid,cable).mm-=10000}else{fixed.lines[0].count=String(Number(data.lines[0].count)-1);row(w.pid,cable).coils--}await send(w.id,'report',fixed,{id:saved.id,expectedVersion:1,label:'Исправление с сохранением версии'})}
  };
  if(variant===1)pending.push({due:di+2,execute});else await execute();
 }
 for(const item of pending.filter(x=>!x.done&&x.due<=di)){await item.execute();item.done=true}
 // Exactly two departures per PID in each simulated month, multi-cable manifests.
 if(['2026-06-12','2026-06-26','2026-08-14','2026-08-28'].includes(date))for(const [p,code]of pids.entries()){
  const pid='pid:'+code,groups=cables.map(([cableId],ci)=>({cableId,masses:[0,1,2].map(i=>String((240+p*10+ci*5+i*5)*coef.get(cableId))).join(' ')}));
  const trip=await send(shipper,'trip',{pid,date,groups});for(const c of trip.data.coils){const e=row(pid,c.cableId);e.mm-=Math.round(c.grams/coef.get(c.cableId));e.transitGrams+=c.grams;e.coils--}
  if(date==='2026-06-12'&&p===0){const first=trip.data.coils[0];await send(keeper,'receipt',{date,weights:{[first.id]:'100'}},{id:trip.id,expectedVersion:1,expect:400,label:'Неполная приёмка отклонена'});await send(observer,'trip',{pid,date,groups},{expect:403,label:'Наблюдатель не отправляет кабель'})}
  const receiveDate=date.endsWith('12')?'2026-06-15':date.endsWith('26')?'2026-06-29':date.endsWith('14')?'2026-08-17':'2026-08-31';
  if(!(date==='2026-08-28'&&p===2))receipts.push({trip,date:receiveDate,delta:p===1?-3:p===2?2:0});
  if(p!==0)anomalies.push({date:receiveDate,pid,who:names.get(keeper),type:'Расхождение массы',note:p===1?'Приёмка на 3 кг меньше отправки; требуется сверка весов и тары.':'Приёмка на 2 кг больше отправки; проверить погрешность взвешивания.'});
 }
 if(date==='2026-08-03'){for(const code of pids)await send(admin,'coefficient',{pid:'pid:'+code,cableId:cables[0][0],date,sampleMetres:'10',sampleKg:'25'});coef.set(cables[0][0],2.5)}
 if(di%5===0||date.endsWith('-30')||date==='2026-08-31')await verify('Контроль '+date,date);
}
for(const item of pending.filter(x=>!x.done)){await item.execute();item.done=true}
await verify('Август после поздних отчётов','2026-08-31');
// Verify replay without duplicated movement and an optimistic version conflict.
const original=tasks.find(t=>t.command.action==='report'&&t.expectedStatus===200);let rr=await request(original.who,'command','POST',original.command);assert.equal((await rr.json()).replayed,true);checks++;
await send(original.who,'report',{...original.command.data,reason:'Попытка правки устаревшей версии'},{id:original.result,expectedVersion:99,expect:409});
await send(workers.find(w=>w.role==='winder').id,'report',{pid:'pid:101',date:'2026-09-01',category:'winding',status:'work',lines:[{cableId:cables[0][0],count:'1.5'}]},{expect:400,label:'Дробное количество катушек отклонено'});
const before=await readDocs('production');
// A late report after a stocktake must flag that stocktake for review.
const e=row('pid:101',cables[0][0]);const adjustment=await send(admin,'adjustment',{pid:e.pid,cableId:e.cableId,date:'2026-08-31',location:'pid',actualMetres:String((e.mm-5000)/1000),reason:'Контрольный пересчёт остатка: уточнение полевой оценки на 5 м.'});e.mm-=5000;
const late=before.find(d=>d.kind==='report'&&d.author===workers[0].id&&d.data.status==='work'&&d.data.cableId===cables[0][0]);await send(workers[0].id,'report',{pid:late.pid,date:late.date,...late.data,trench:String(late.data.trenchMm/1000),cable:String(late.data.cableMm/1000+2),reason:'Позднее уточнение первичного отчёта: дополнительно извлечено 2 м.'},{id:late.id,expectedVersion:late.version});e.mm+=2000;
rr=await request(admin,'state?date=2026-08-31');let state=await rr.json();assert.ok(state.reviewIds.includes(adjustment.id));checks++;
await verify('Финальный остаток','2026-08-31');
const ledger=db.prepare("SELECT l.origin_pid,l.cable_id,a.kind,SUM(e.sign*q.value_base) amount FROM ledger_entries e JOIN quantity_values q ON q.id=e.value_id JOIN stock_accounts a ON a.id=e.account_id JOIN document_lines l ON l.id=e.line_id GROUP BY l.origin_pid,l.cable_id,a.kind").all();
for(const e of expected.values())for(const [kind,field]of [['pid','mm'],['warehouse','warehouseGrams'],['transit','transitGrams']]){assert.equal(Number(ledger.find(x=>x.origin_pid===e.pid&&x.cable_id===e.cableId&&x.kind===kind)?.amount||0),e[field]);checks++}
assert.deepEqual(db.prepare('SELECT e.line_id,q.unit,SUM(e.sign*q.value_base) total FROM ledger_entries e JOIN quantity_values q ON q.id=e.value_id GROUP BY e.line_id,q.unit HAVING SUM(e.sign*q.value_base)<>0').all(),[]);checks++;
rr=await request(observer,'state?date=2026-08-31');assert.equal((await rr.json()).docs.filter(x=>x.kind==='pid').length,3);checks++;
rr=await request(workers[0].id,'state?date=2026-08-31');assert.deepEqual((await rr.json()).docs.filter(x=>x.kind==='pid').map(x=>x.id),['pid:101']);checks++;
for(const month of ['06','08']){rr=await request(admin,'export','POST',{from:`2026-${month}-01`,to:`2026-${month}-${month==='06'?'30':'31'}`,requestId:'export-'+month});assert.equal(rr.status,200);fs.writeFileSync(`${out}/export-${month}.xlsx`,new Uint8Array(await rr.arrayBuffer()));checks++}
// Remove all temporary authentication IDs from deliverable data. Real testers bind IDs later.
const allUsers=(await readDocs('production')).filter(d=>d.kind==='user');for(const u of [...allUsers.filter(u=>u.id!==admin),allUsers.find(u=>u.id===admin)])await send(admin,'user',{...u.data,telegramId:''},{id:u.id,expectedVersion:u.version,label:'Профиль готов к привязке реального тестировщика'});
const tables=['documents','accounting_documents','stock_accounts','document_lines','quantity_values','quantity_inputs','ledger_entries','coil_entries','opening_batches'];const dump={format:'season-simulation/1',periods:['2026-06','2026-08'],tables:{}};
for(const table of tables){dump.tables[table]=db.prepare('SELECT * FROM '+table).all();if(table==='documents')for(const d of dump.tables[table])if(d.kind==='user'){const p=JSON.parse(d.payload);p.telegramId='';d.payload=JSON.stringify(p)}}
const compressed=gzipSync(JSON.stringify(dump));fs.writeFileSync(out+'/dataset.json.gz',compressed);
const result={dbFile,checks,reportSlots:reports,reportViolations:violations,violationPercent:100*violations/reports,weekdays:days.length,users:allUsers.map(u=>({id:u.id,name:u.data.name,roles:u.data.roles,telegramId:''})),documentVersions:dump.tables.documents.length,trips:12,receivedTrips:11,balances:[...expected.values()],reviewIds:state.reviewIds,datasetSha256:createHash('sha256').update(compressed).digest('hex')};
fs.writeFileSync(out+'/result.json',JSON.stringify(result,null,2));fs.writeFileSync(out+'/tasks.json',JSON.stringify(tasks,null,2));fs.writeFileSync(out+'/anomalies.json',JSON.stringify(anomalies,null,2));fs.writeFileSync(out+'/snapshots.json',JSON.stringify(snapshots,null,2));fs.writeFileSync(out+'/state.json',JSON.stringify({docs:await readDocs('production')},null,2));
console.log(JSON.stringify(result,null,2));db.close();

