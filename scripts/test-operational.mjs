import ts from 'typescript';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
const out='outputs/operational-test';mkdirSync(out,{recursive:true});
for(const name of ['concise-model','concise-coils','concise-balance','production-domain','production-store','production-auth','telegram-auth','settings-filters','pid-metadata']){
 const code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from (['"])\.\/([a-z-]+)\1/g,'from "./$2.mjs"');writeFileSync(`${out}/${name}.mjs`,code);
}
writeFileSync(`${out}/store.mjs`,'export const runtime=()=>globalThis.OPERATIONAL_TEST_ENV;');
writeFileSync(`${out}/domain.mjs`,'export class DomainError extends Error{constructor(message,status=400){super(message);this.status=status;}}');
const M=await import(`../${out}/concise-model.mjs`),D=await import(`../${out}/production-domain.mjs`),B=await import(`../${out}/concise-balance.mjs`);
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
const today='2026-09-24';
let s={version:7,today,hour:10,generated:[],employees:[{id:'a',name:'МОЛ А',active:true},{id:'b',name:'МОЛ Б',active:true},{id:'helper',name:'Доверенный',active:true},{id:'boss',name:'Администратор',active:true}],pids:[{id:'101',lengthM:10000}],warehouses:[{id:'a101',name:'А · ПИД101',pid:'101',owner:'a',kind:'field'},{id:'b101',name:'Б · ПИД101',pid:'101',owner:'b',kind:'field'},{id:'main',name:'Основной',pid:'',owner:'b',kind:'main'},{id:'master',name:'Разделка',pid:'',owner:'b',kind:'master'}],materials:[{id:'c',name:'Кабель',kind:'cable'},...['copper','lead','aluminium'].map(id=>({id,name:id,kind:'metal'}))],replacements:[{warehouse:'a101',deputy:'helper',active:true}],assignments:['dig','extract','wind'].map(work=>({id:'a-'+work,warehouse:'a101',material:work==='dig'?'':'c',work,active:true})).concat([{id:'strip',warehouse:'master',material:'c',work:'strip',active:true}]),tasks:[],documents:[],measurements:[{id:'m',pid:'101',material:'c',date:'2026-01-01',gPerM:1688,confirmed:true,author:'a'}],standards:[{material:'c',date:'2026-01-01',rate:20000,norm:[15,15,10]}],templates:[]};
const a={employee:'a',admin:false},helper={employee:'helper',admin:false},b={employee:'b',admin:false},boss={employee:'boss',admin:true};
const F=await import(`../${out}/settings-filters.mjs`),P=await import(`../${out}/pid-metadata.mjs`);
check('Метаданные ПИД не меняют длины, документы, задания и матрицу',()=>{const next=P.applyPidMetadata(s,[{id:'101',locality:'Город',status:'planned'}]);assert.equal(next.pids[0].lengthM,10000);assert.equal(next.pids[0].locality,'Город');for(const key of Object.keys(s).filter(k=>k!=='pids'))assert.deepEqual(next[key],s[key]);assert.deepEqual(M.generate(next,today,10).tasks,M.generate(s,today,10).tasks);const edited=D.applyChanges(next,[{key:'pids',rows:[{id:'101',lengthM:11000}]}],boss);assert.equal(edited.pids[0].status,'planned');assert.equal(edited.pids[0].locality,'Город');});
check('Неизвестный ПИД и дубликаты отвергаются до импорта',()=>{assert.throws(()=>P.applyPidMetadata(s,[{id:'unknown',locality:'Город',status:'active'}]),/не найден/);assert.throws(()=>P.applyPidMetadata(s,[{id:'101',locality:'Город',status:'active'},{id:'101',locality:'Город',status:'planned'}]),/повторяется/);});
check('Отборы функций используют МОЛ склада и признаки ПИД',()=>{const state=P.applyPidMetadata(s,[{id:'101',locality:'Город',status:'active'}]);const rows=F.settingsRows(state,'functions'),f={query:'',values:{owner:'МОЛ А',locality:'Город',pidStatus:'В работе'},page:0};assert.equal(rows.filter(r=>F.matches(r,f)).length,3);assert.equal(rows.filter(r=>F.matches(r,{...f,query:'нет такого'})).length,0);assert.equal(F.settingsRows(s,'pid')[0].values.pidStatus,'Не указано');});
check('Состав бригад проверяется по сотруднику и бригаде без потери связей',()=>{const state={...s,templates:[{id:'one',name:'Первая',warehouse:'master',members:['a','helper']},{id:'two',name:'Вторая',warehouse:'master',members:['helper']}]};const rows=F.settingsRows(state,'crew');assert.equal(rows.filter(r=>F.matches(r,{query:'',values:{employee:'Доверенный'},page:0})).length,2);assert.equal(rows.filter(r=>F.matches(r,{query:'',values:{crew:'Первая'},page:0})).length,2);});
check('До 09:00 заданий нет',()=>assert.equal(M.generate(s,today,8).tasks.length,0));s=M.generate(s,today,10);
check('Повтор генерации не создаёт задания',()=>assert.equal(M.generate(s,today,12).tasks.length,4));
check('Правка матрицы не меняет созданное задание',()=>{const changed=M.saveAssignment(s,{...s.assignments[0],active:false});assert.equal(changed.tasks[0].assignment.active,true)});
const entries=['dig','extract','wind'].map(work=>({taskId:`a-${work}@${today}`,qty:work==='dig'?1000:work==='extract'?2000:4,mode:'work',reason:'',expected:0,measureId:work==='extract'?'m':undefined,confirmed:true,crew:[]}));
let proposed=M.saveDay(s,entries,'helper');let patch=D.changes(s,proposed);
check('Посторонний не выполняет чужое задание',()=>assert.throws(()=>D.applyChanges(s,patch,b),/Нет доступа/));
s=D.applyChanges(s,patch,helper);
check('Поступление в тоннах только на личный склад',()=>{assert.equal(M.stock(s,'a101','c'),3.376);assert.equal(M.stock(s,'b101','c'),0)});
check('Доверенное лицо реально указано автором',()=>assert.equal(M.current(s.documents[0]).actor,'helper'));
check('Повтор заполненного задания отвергается',()=>assert.throws(()=>D.applyChanges(s,patch,helper),/уже изменён/));
check('Подмена служебной матрицы заданий отвергается',()=>assert.throws(()=>D.applyChanges(s,[{key:'tasks',rows:[{id:'fake'}]}],boss),/Служебные/));
check('Настройки закрыты сотруднику',()=>assert.throws(()=>D.applyChanges(s,[{key:'employees',rows:[{id:'a',name:'Другой',active:true}]}],a),/администратору/));
check('Массы катушек через пробел с дробями',()=>assert.deepEqual(M.parseCoilWeights('801 803,5 806.25'),[801,803.5,806.25]));
check('Ошибочный токен катушки не теряется',()=>assert.ok(Number.isNaN(M.parseCoilWeights('800 ошибка 900')[1])));
let t={id:'trip1',kind:'transfer',date:today,from:'a101',to:'main',actor:'a',items:[{material:'c',sent:1.6,received:null,weights:[800,800]}],weights:[800,800],reason:''};
check('Нельзя отгрузить сверх остатка',()=>assert.throws(()=>D.applyChanges(s,[{key:'documents',rows:[{...t,items:[{material:'c',sent:5,received:null}],weights:[]}]}],a),/Недостаточно/));
s=D.applyChanges(s,[{key:'documents',rows:[t]}],a);
check('В пути сохраняется масса компании',()=>assert.equal(M.movements(s).reduce((a,m)=>a+m.qty,0),3.376));
let received=M.receive(s,t.id,[1.59],'b','Разница взвешивания');
check('Отправитель не принимает за получателя',()=>assert.throws(()=>D.applyChanges(s,D.changes(s,received),a),/Приёмку/));
s=D.applyChanges(s,D.changes(s,received),b);
check('Приёмка оставляет расхождение отдельно',()=>{assert.equal(M.stock(s,'main','c'),1.59);assert.equal(M.stock(s,'transit','c'),.01)});
check('Все ячейки баланса раскрываются в точную сумму',()=>{for(const scope of ['all','a101','main'])for(const column of ['before','plus','minus','after']){const r=B.balanceCell(s,{scope,actor:'a',material:'c',column,from:today,to:today,unit:'tonnes'});assert.equal(M.round(r.contributions.reduce((a,c)=>a+c.quantity,0)),r.value)}});
let forged=structuredClone(s.documents.find(d=>d.kind==='work'&&d.assignment.work==='extract'));forged.versions.push({...M.current(forged),version:2,qty:2001,actor:'b',at:'1900-01-01',reason:'Уточнили метраж',measure:{...M.current(forged).measure,kgPerM:900},rate:999999});
s=D.applyChanges(s,[{key:'documents',rows:[forged]}],a);
check('Автор и замер исправления вычисляются сервером',()=>{const v=M.current(s.documents.find(d=>d.id===forged.id));assert.equal(v.measure.kgPerM,1.688);assert.equal(v.actor,'a');assert.notEqual(v.at,'1900-01-01');assert.equal(v.rate,20000)});
check('Сохранена прежняя версия',()=>assert.equal(s.documents.find(d=>d.id===forged.id).versions[0].qty,2000));
check('Нельзя исправлением сделать старый остаток отрицательным',()=>{const d=structuredClone(s.documents.find(d=>d.id===forged.id));d.versions.push({...M.current(d),version:3,qty:10,reason:'Ошибка количества'});assert.throws(()=>D.applyChanges(s,[{key:'documents',rows:[d]}],a),/Недостаточно/)});
check('Тарифы и нормативы разделены по кабелям',()=>assert.equal(M.standardAt({...s,standards:[...s.standards,{material:'other',date:today,rate:1,norm:[0,0,0]}]},today,'c').rate,20000));
check('ФОТ распределяется без потери копеек',()=>assert.equal(M.payout(100,[{employee:'a',ktu:1},{employee:'b',ktu:1},{employee:'helper',ktu:1}]).reduce((a,b)=>a+b,0),100));
if(process.env.OPERATIONAL_IMPORT_FILE){const input=JSON.parse(readFileSync(process.env.OPERATIONAL_IMPORT_FILE,'utf8'));D.validateReferences(input.state);const totals={};for(const p of D.postings(input.state).filter(p=>p.unit==='g'&&p.basis==='calculated')){const k=p.warehouse+'|'+p.material;totals[k]=(totals[k]||0)+p.quantity;}assert.deepEqual(totals,input.expectedExtractionGrams);assert.equal(M.stock(input.state,'W003','M007'),129.718);assert.equal(M.stock(input.state,'W003','M008'),97.184);assert.equal(M.stock(input.state,'W003','M009'),13.272);assert.equal(M.stock(input.state,'W006','M007'),143.6488);assert.equal(M.stock(input.state,'W007','M007'),0);console.log('PASS private approved import: all reference links and exact gram controls');checks++;}
if(process.env.TEST_DATABASE_URL){
 const url=new URL(process.env.TEST_DATABASE_URL);if(!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!='/pid_cable_test')throw Error('Dedicated local test database required');
 const {default:pg}=await import('pg');const root=new pg.Pool({connectionString:url.href});await root.query('CREATE SCHEMA IF NOT EXISTS operational_test');
 const pool=new pg.Pool({connectionString:url.href,options:'-c search_path=operational_test'});const {migrate}=await import('../server/migrate.mjs');await migrate(pool);await migrate(pool);
 globalThis.OPERATIONAL_TEST_ENV={pool,TELEGRAM_BOT_TOKEN:'test-token'};
 const S=await import(`../${out}/production-store.mjs`),A=await import(`../${out}/production-auth.mjs`);
 try{
  await S.transaction(async c=>{await S.record(c,undefined,s,1,'fixture-initial','fixture','system',{});for(const [index,e] of s.employees.entries())await c.query('INSERT INTO operational_identities(employee,telegram_id,is_admin) VALUES($1,$2,$3)',[e.id,String(123456789+index),e.id==='boss'])});
  const initialCount=(await pool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n;
  const request={revision:1,requestId:'request-setting-0001',patches:[{key:'pids',rows:[{id:'101',lengthM:11000}]}]};
  const concurrent=await Promise.allSettled([S.mutate(request,boss),S.mutate({...request,requestId:'request-setting-0002'},boss)]);
  assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1);checks++;console.log('PASS PostgreSQL concurrent stale revision prevented');
  const replay=await S.mutate(request,boss);assert.equal(replay.revision,2);assert.equal((await pool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n,initialCount);checks++;console.log('PASS PostgreSQL idempotent retry');
  await assert.rejects(S.mutate({...request,patches:[{key:'pids',rows:[{id:'101',lengthM:12000}]}]},boss),/отличается/);
  const bad={revision:2,requestId:'request-invalid-0001',patches:[{key:'employees',rows:[{id:'new',name:'Новое имя',active:true}]},{key:'pids',rows:[{id:'101',lengthM:-1}]}]};await assert.rejects(S.mutate(bad,boss));assert.equal((await S.row()).revision,2);assert.ok(!(await S.row()).payload.employees.some(e=>e.id==='new'));checks++;console.log('PASS PostgreSQL atomic rollback');
  const beforeMetadata=await S.row();const metadata=await S.mutate({revision:beforeMetadata.revision,requestId:'request-pid-metadata-0001',patches:[{key:'pids',rows:[{id:'101',lengthM:11000,locality:'Город',status:'planned'}]}]},boss);assert.equal(metadata.payload.pids[0].status,'planned');assert.deepEqual(metadata.payload.documents,beforeMetadata.payload.documents);assert.deepEqual(metadata.payload.assignments,beforeMetadata.payload.assignments);assert.equal((await pool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n,initialCount);checks++;console.log('PASS PostgreSQL PID metadata changes no documents or ledger postings');
  const r=await A.beginLogin(new Request('https://example.test/api/operational/auth'));const login=await r.json(),loginCookie=r.headers.get('set-cookie').split(';')[0];
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456789})});const key=createHmac('sha256','WebAppData').update('test-token').digest();params.set('hash',createHmac('sha256',key).update([...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
  const tgRequest=new Request('https://example.test',{headers:{'x-telegram-init-data':params.toString()}});await A.approveLogin(tgRequest,login.code);
  const approved=await A.finishLogin(new Request('https://example.test',{headers:{cookie:loginCookie}})),sessionCookie=approved.headers.get('set-cookie').split(';')[0];assert.equal((await A.authenticate(new Request('https://example.test',{headers:{cookie:sessionCookie}}))).employee,'a');await assert.rejects(A.finishLogin(new Request('https://example.test',{headers:{cookie:loginCookie}})));checks++;console.log('PASS Telegram signed approval, cookie session and one-time exchange');
  assert.equal((await pool.query('SELECT material,unit,SUM(quantity) FROM operational_postings GROUP BY material,unit HAVING SUM(quantity)<>0')).rows.length,0);checks++;console.log('PASS PostgreSQL journal balances');
 }finally{await pool.end();await root.query('DROP SCHEMA operational_test CASCADE');await root.end();}
}
console.log(`Operational checks passed: ${checks}`);
