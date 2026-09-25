import ts from 'typescript';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const out='outputs/operational-test';mkdirSync(out,{recursive:true});
for(const name of ['bot','domain','ledger','company-notifications','task-notifications','daily-work','concise-model','concise-coils','concise-balance','production-domain','production-store','production-auth','telegram-auth','settings-filters','pid-metadata']){
 const code=ts.transpileModule(readFileSync('lib/'+name+'.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText.replace(/from (['"])\.\/([a-z-]+)\1/g,'from "./$2.mjs"');writeFileSync(`${out}/${name}.mjs`,code);
}
writeFileSync(`${out}/store.mjs`,'export const runtime=()=>globalThis.OPERATIONAL_TEST_ENV; export const database=()=>runtime().DB; export const readDocs=()=>{throw Error("Not used")}; export const saveDoc=readDocs; export const hash=readDocs;');
const M=await import(`../${out}/concise-model.mjs`),D=await import(`../${out}/production-domain.mjs`),B=await import(`../${out}/concise-balance.mjs`);
let checks=0;const check=(name,fn)=>{fn();checks++;console.log('PASS '+name)};
const today='2026-09-24';
let s={version:7,today,hour:10,generated:[],employees:[{id:'a',name:'МОЛ А',active:true},{id:'b',name:'МОЛ Б',active:true},{id:'helper',name:'Доверенный',active:true},{id:'boss',name:'Администратор',active:true}],pids:[{id:'101',lengthM:10000}],warehouses:[{id:'a101',name:'А · ПИД101',pid:'101',owner:'a',kind:'field'},{id:'b101',name:'Б · ПИД101',pid:'101',owner:'b',kind:'field'},{id:'main',name:'Основной',pid:'',owner:'b',kind:'main'},{id:'master',name:'Разделка',pid:'',owner:'b',kind:'master'}],materials:[{id:'c',name:'Кабель',kind:'cable'},...['copper','lead','aluminium'].map(id=>({id,name:id,kind:'metal'}))],replacements:[{warehouse:'a101',deputy:'helper',active:true}],assignments:['dig','extract','wind'].map(work=>({id:'a-'+work,warehouse:'a101',material:work==='dig'?'':'c',work,active:true})).concat([{id:'strip',warehouse:'master',material:'c',work:'strip',active:true}]),tasks:[],documents:[],measurements:[{id:'m',pid:'101',material:'c',date:'2026-01-01',gPerM:1688,confirmed:true,author:'a'}],standards:[{material:'c',date:'2026-01-01',rate:20000,norm:[15,15,10]}],templates:[]};
const legacyFixture=structuredClone(s);
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
const Daily=await import(`../${out}/daily-work.mjs`);
let dailyFixture=structuredClone(legacyFixture);dailyFixture.warehouses=dailyFixture.warehouses.filter(w=>w.id!=='main');
dailyFixture.materials.push({id:'c2',name:'Второй кабель',kind:'cable'});dailyFixture.assignments.push({id:'strip2',warehouse:'master',material:'c2',work:'strip',active:true});
dailyFixture.standards.push({material:'c2',date:'2026-01-01',rate:30000,norm:[10,10,10]});
dailyFixture.documents.push(...['c','c2'].map(material=>({id:'opening-'+material,kind:'opening',date:'2026-01-01',warehouse:'master',material,qty:10,actor:'boss'})));
let daily=Daily.migrateDaily(M.generate(dailyFixture,today,10));
check('Миграция объединяет кабели и функции без изменений учёта',()=>{assert.equal(daily.duties.length,2);assert.equal(daily.dailyTasks.length,2);assert.deepEqual(daily.documents,dailyFixture.documents);assert.deepEqual(D.postings(daily),D.postings(dailyFixture));assert.deepEqual(Daily.migrateDaily(daily),daily);});
const masterTask=daily.dailyTasks.find(t=>t.warehouse==='master'),fieldTask=daily.dailyTasks.find(t=>t.warehouse==='a101');
check('Личный отбор администратора не включает чужие задания',()=>{assert.equal(daily.dailyTasks.filter(t=>Daily.canFill(daily,t,'boss')).length,0);assert.equal(daily.dailyTasks.filter(t=>Daily.canFill(daily,t,'helper')).length,1)});
check('Матрица и повтор генерации сохраняют старые задания',()=>{const changed=Daily.saveDuty(daily,{...daily.duties[0],active:false});assert.deepEqual(changed.dailyTasks,daily.dailyTasks);assert.equal(Daily.generateDaily(changed,today,10).dailyTasks.length,2);assert.equal(Daily.generateDaily(changed,'2026-09-25',10).dailyTasks.length,3)});
const stripSubmission={id:masterTask.id,mode:'work',reason:'',crew:[{employee:'a',ktu:1},{employee:'helper',ktu:2}],lines:[{work:'strip',material:'c',qty:1,metals:[.15,.15,.1]},{work:'strip',material:'c2',qty:2,metals:[.2,.2,.2]}]};
check('Посторонний не заполняет общую смену',()=>assert.throws(()=>D.applyChanges(daily,[{key:'dailySubmission',rows:[stripSubmission]}],helper),/Нет доступа/));
daily=D.applyChanges(daily,[{key:'dailySubmission',rows:[stripSubmission]}],b);
check('Несколько кабелей в одном задании: расход, металлы, общая бригада и ФОТ',()=>{assert.equal(Daily.completed(daily,masterTask),true);assert.equal(M.stock(daily,'master','c'),9);assert.equal(M.stock(daily,'master','c2'),8);assert.equal(M.stock(daily,'master','copper'),.35);const docs=Daily.documents(daily,masterTask);assert.equal(docs.length,2);assert.equal(docs.reduce((n,d)=>n+M.current(d).qty*M.current(d).rate,0),80000);assert.ok(docs.every(d=>M.current(d).actor==='b'&&M.current(d).crew.length===2));});
check('Повтор закрытой смены запрещён',()=>assert.throws(()=>D.applyChanges(daily,[{key:'dailySubmission',rows:[stripSubmission]}],b),/уже заполнено/));
const editedStrip={...stripSubmission,edit:true,expected:Daily.documents(daily,masterTask).map(d=>({id:d.id,version:M.current(d).version})),reason:'Исправили измерения',lines:[{work:'strip',material:'c',qty:2,metals:[.3,.3,.2]}]};
const corrected=D.applyChanges(daily,[{key:'dailySubmission',rows:[editedStrip]}],b);
check('Исправление смены сохраняет версии и снимает убранную строку из баланса',()=>{assert.equal(M.stock(corrected,'master','c'),8);assert.equal(M.stock(corrected,'master','c2'),10);assert.equal(M.stock(corrected,'master','copper'),.3);assert.ok(Daily.documents(corrected,masterTask).every(d=>d.versions.length===2&&d.versions[0].actor==='b'));assert.throws(()=>D.applyChanges(corrected,[{key:'dailySubmission',rows:[editedStrip]}],b),/заново/)});

check('Неуказанные работы нельзя тихо пропустить',()=>assert.throws(()=>Daily.saveDaily(daily,{id:fieldTask.id,mode:'work',reason:'',crew:[],lines:[{work:'dig',material:'',qty:10}]},'helper'),/каждую/));
const fieldSubmission={id:fieldTask.id,mode:'work',reason:'',crew:[],lines:[{work:'dig',material:'',qty:1000},{work:'extract',material:'c',qty:2000,measureId:'m',confirmed:true},{work:'wind',material:'c',qty:4}]};
daily=D.applyChanges(daily,[{key:'dailySubmission',rows:[fieldSubmission]}],helper);
check('Доверенный закрывает одно задание у себя и МОЛ, автор и склад сохранены',()=>{assert.ok(Daily.completed(daily,fieldTask));assert.ok(Daily.canFill(daily,fieldTask,'a'));assert.ok(Daily.canFill(daily,fieldTask,'helper'));assert.ok(Daily.documents(daily,fieldTask).every(d=>M.current(d).actor==='helper'&&d.assignment.responsible==='a'));assert.equal(M.stock(daily,'a101','c'),3.376)});
check('Служебные задания нельзя подменить запросом браузера',()=>assert.throws(()=>D.applyChanges(daily,[{key:'dailyTasks',rows:[{...fieldTask,employee:'boss'}]}],boss),/Служебные/));
check('Отключение сотрудника не уничтожает его историю',()=>{const next=D.applyChanges(daily,[{key:'employees',rows:[{...daily.employees.find(e=>e.id==='a'),active:false}]}],boss);assert.equal(Daily.canFill(next,fieldTask,'a'),false);assert.deepEqual(next.documents,daily.documents)});
const tomorrow=Daily.generateDaily(daily,'2026-09-25',10),noWork=tomorrow.dailyTasks.find(t=>t.date==='2026-09-25'&&t.warehouse==='master');
const N=await import(`../${out}/task-notifications.mjs`);
const noticeClock={today:'2026-09-25',hour:19};
const prefs={newTasks:false,current:false,overdue:true,hours:[19]};
const configure=(state,employee,notifications)=>D.applyChanges(state,[{key:'employees',rows:[{...state.employees.find(e=>e.id===employee),notifications}]}],boss);
check('Уведомления: прежние настройки остаются 19:00 и 20:00, без новых рассылок',()=>{
 assert.equal(N.taskNotification(tomorrow,'a',{...noticeClock,hour:9}),null);
 assert.equal(N.taskNotification(tomorrow,'a',noticeClock).taskIds.length,1);
 assert.equal(N.taskNotification(tomorrow,'a',{...noticeClock,hour:20}).taskIds.length,1);
 assert.equal(N.taskNotification(tomorrow,'a',{...noticeClock,hour:18}),null);
 assert.equal(N.taskNotification(tomorrow,'boss',noticeClock),null);
});
check('Уведомления меняет только администратор, настройки сохраняются без изменения учёта',()=>{
 const next=configure(tomorrow,'a',prefs);assert.deepEqual(next.employees.find(e=>e.id==='a').notifications,prefs);
 assert.deepEqual(next.documents,tomorrow.documents);assert.deepEqual(next.dailyTasks,tomorrow.dailyTasks);assert.deepEqual(D.postings(next),D.postings(tomorrow));
 assert.throws(()=>D.applyChanges(tomorrow,D.changes(tomorrow,next),a),/администратору/);
 for(const invalid of [{...prefs,hours:[19,19]},{...prefs,hours:[19,20,21]},{...prefs,hours:[8]},{...prefs,hours:[22]},{...prefs,hours:[]},{...prefs,other:true}])assert.throws(()=>configure(tomorrow,'a',invalid));
});
const unfinished=tomorrow.dailyTasks.find(t=>t.date===noticeClock.today&&t.employee==='a');
const lateTask={...unfinished,id:'late-task',date:'2026-09-23',legacyTaskIds:[]};
const notices={...tomorrow,dailyTasks:[...tomorrow.dailyTasks,lateTask,{...lateTask,id:'restored-task',restored:true},{...lateTask,id:'future-task',date:'2026-09-26'}]};
check('Дисциплинированному можно оставить только просрочки, полностью отключить или менять частоту',()=>{
 const late=configure(notices,'a',prefs);assert.deepEqual(N.taskNotification(late,'a',noticeClock).taskIds,['late-task']);
 assert.equal(N.taskNotification(late,'a',{...noticeClock,hour:20}),null);
 const off=configure(notices,'a',{...prefs,overdue:false});assert.equal(N.taskNotification(off,'a',noticeClock),null);
 const inactive={...notices,employees:notices.employees.map(e=>e.id==='a'?{...e,active:false}:e)};assert.equal(N.taskNotification(inactive,'a',noticeClock),null);
});
check('Новые, текущие и просрочки объединены; общая задача учтена один раз',()=>{
 const combined=configure(notices,'a',{...prefs,newTasks:true,current:true,hours:[9]});
 const notice=N.taskNotification({...combined,dailyTasks:[...combined.dailyTasks,lateTask]},'a',{...noticeClock,hour:9});assert.equal(notice.taskIds.length,2);assert.match(notice.text,/За сегодня: 1/);assert.match(notice.text,/Просроченных: 1/);
 assert.equal(notice.key,`operational:${noticeClock.today}:9:a`);
 const edited=configure(combined,'a',{...prefs,current:true,hours:[9]});assert.equal(N.taskNotification(edited,'a',{...noticeClock,hour:9}).key,notice.key);
});
check('Напоминания учитывают закрытие доверенным, простой, срок и независимые настройки помощника',()=>{
 const done=D.applyChanges(tomorrow,[{key:'dailySubmission',rows:[{id:unfinished.id,mode:'idle',reason:'Простой бригады',crew:[],lines:[]}]}],helper);
 assert.equal(N.taskNotification(done,'a',noticeClock),null);assert.equal(N.taskNotification(done,'helper',noticeClock),null);
 const at21=configure(tomorrow,'a',{...prefs,hours:[21]});assert.equal(N.taskNotification(at21,'a',{...noticeClock,hour:21}).taskIds.length,1);
 assert.equal(N.taskNotification(at21,'a',{...noticeClock,hour:20}),null);
 assert.ok(N.taskNotification(configure(tomorrow,'a',{...prefs,overdue:false}),'helper',noticeClock));
});
check('Простой закрывает смену без фиктивных кабелей и движения',()=>{const after=D.applyChanges(tomorrow,[{key:'dailySubmission',rows:[{id:noWork.id,mode:'idle',reason:'Нет сырья',crew:[],lines:[]}]}],b);assert.ok(Daily.completed(after,noWork));assert.deepEqual(D.postings(after),D.postings(tomorrow))});
if(process.env.OPERATIONAL_IMPORT_FILE){const input=JSON.parse(readFileSync(process.env.OPERATIONAL_IMPORT_FILE,'utf8'));D.validateReferences(input.state);const totals={};for(const p of D.postings(input.state).filter(p=>p.unit==='g'&&p.basis==='calculated')){const k=p.warehouse+'|'+p.material;totals[k]=(totals[k]||0)+p.quantity;}assert.deepEqual(totals,input.expectedExtractionGrams);assert.equal(M.stock(input.state,'W003','M007'),129.718);assert.equal(M.stock(input.state,'W003','M008'),97.184);assert.equal(M.stock(input.state,'W003','M009'),13.272);assert.equal(M.stock(input.state,'W006','M007'),143.6488);assert.equal(M.stock(input.state,'W007','M007'),0);console.log('PASS private approved import: all reference links and exact gram controls');checks++;}
const C=await import(`../${out}/company-notifications.mjs`);
const companySub={id:'company',enabled:true,recipient:'boss',hour:9,periods:['shift','week','month']};
const adminIdentity=[{employee:'boss',telegram_id:'test-boss',is_admin:true}];
check('Сводки: завершённые календарные периоды, границы года и високосный месяц',()=>{
 assert.deepEqual(C.summaryWindow('shift','2026-01-01'),{from:'2025-12-31',to:'2025-12-31'});
 assert.deepEqual(C.summaryWindow('week','2027-01-04'),{from:'2026-12-28',to:'2027-01-03'});
 assert.equal(C.summaryWindow('week','2027-01-05'),null);
 assert.deepEqual(C.summaryWindow('month','2024-03-01'),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(C.summaryWindow('month','2026-01-01'),{from:'2025-12-01',to:'2025-12-31'});
 assert.equal(C.summaryWindow('month','2026-09-25'),null);
 assert.deepEqual(C.lastCompletePeriod('week','2026-09-25'),{from:'2026-09-14',to:'2026-09-20'});
});
check('Сводки: первое сохранение в старой базе, только администратор, учёт неизменен',()=>{
 const proposed={...daily,summarySubscriptions:[companySub]},patches=D.changes(daily,proposed);
 assert.equal(patches.length,1);assert.equal(patches[0].key,'summarySubscriptions');
 const result=D.applyChanges(daily,patches,boss);assert.deepEqual(result.summarySubscriptions,[companySub]);assert.deepEqual(result.documents,daily.documents);assert.deepEqual(result.dailyTasks,daily.dailyTasks);assert.deepEqual(D.postings(result),D.postings(daily));
 assert.throws(()=>D.applyChanges(daily,patches,a),/администратору/);
 for(const bad of [{...companySub,recipient:''},{...companySub,periods:[]},{...companySub,periods:['week','week']},{...companySub,id:'discipline'},{...companySub,hour:8},{...companySub,recipient:'unknown'}])assert.throws(()=>D.applyChanges(daily,[{key:'summarySubscriptions',rows:[bad]}],boss));
 assert.ok(C.summarySubscriptions(daily).every(n=>!n.enabled&&!n.recipient));
});
check('Показатели компании: единицы, металлы, только последняя версия, без остатков и передач',()=>{
 const q=C.companyMetrics(daily,today,today);assert.equal(q.dig,1000);assert.equal(q.extracted,2000);assert.equal(q.extractedTonnes,3.376);assert.equal(q.coils,4);assert.equal(q.stripped,3);assert.deepEqual(q.metals,[.35,.35,.3]);assert.equal(q.tasks,2);assert.equal(q.closed,2);
 const fixed=C.companyMetrics(corrected,today,today);assert.equal(fixed.stripped,2);assert.deepEqual(fixed.metals,[.3,.3,.2]);
 assert.equal(C.companyMetrics(daily,'2026-01-01','2026-01-01').stripped,0);
 const extra={...daily,documents:[...daily.documents,{id:'summary-transfer',kind:'transfer',date:today,from:'a101',to:'master',items:[{material:'c',sent:1,received:1}],weights:[],reason:'',actor:'a'}]};assert.deepEqual(C.companyMetrics(extra,today,today),q);
});
const disciplineFixture=structuredClone(daily);
for(const d of disciplineFixture.documents.filter(d=>d.kind==='work'))for(const v of d.versions)v.at=d.assignment.responsible==='a'?'2026-09-24T14:01:00Z':'2026-09-24T14:00:00Z';
disciplineFixture.dailyTasks.push(lateTask,{...lateTask,id:'ignored-history',restored:true},{...lateTask,id:'ignored-future',date:'2026-09-26'});
check('Дисциплина: МОЛ вместо вводившего, ровно 21:00 вовремя, история и будущие дни исключены',()=>{
 const r=C.disciplineSnapshot(disciplineFixture,{today:'2026-09-25',hour:9});assert.deepEqual(r.rows,[{employee:'a',open:1,closedLate:1,oldest:'2026-09-23'}]);
 const duplicated={...disciplineFixture,dailyTasks:[...disciplineFixture.dailyTasks,lateTask]};assert.deepEqual(C.disciplineSnapshot(duplicated,{today:'2026-09-25',hour:9}),r);
 assert.equal(C.companyMetrics(disciplineFixture,today,today).late,1);
});
check('Позднее исправление с новой строкой кабеля не превращает своевременную сдачу в опоздание',()=>{
 const task=disciplineFixture.dailyTasks.find(t=>t.employee==='b'),first=Daily.closedAt(disciplineFixture,task),doc=structuredClone(Daily.documents(disciplineFixture,task)[0]);
 doc.id='added-line';doc.taskId=task.id+'#strip:added';doc.versions[0].at='2026-09-26T15:00:00Z';
 assert.equal(Daily.closedAt({...disciplineFixture,documents:[...disciplineFixture.documents,doc]},task),first);
});
check('Расписание: выбранные периоды, отключение, отзыв прав и стабильный ключ при смене времени',()=>{
 const configured={...daily,summarySubscriptions:[companySub,{id:'discipline',enabled:true,recipient:'boss',hour:9,periods:['shift']}]},clock={today:'2026-06-01',hour:9};
 const rows=C.summaryNotifications(configured,adminIdentity,clock);assert.equal(rows.length,4);assert.equal(new Set(rows.map(r=>r.key)).size,4);
 assert.equal(C.summaryNotifications(configured,adminIdentity,{...clock,hour:10}).length,0);
 assert.equal(C.summaryNotifications(configured,adminIdentity.map(i=>({...i,is_admin:false})),clock).length,0);
 assert.equal(C.summaryNotifications({...configured,employees:configured.employees.map(e=>e.id==='boss'?{...e,active:false}:e)},adminIdentity,clock).length,0);
 assert.equal(C.summaryNotifications({...configured,summarySubscriptions:configured.summarySubscriptions.map(n=>({...n,enabled:false}))},adminIdentity,clock).length,0);
 assert.deepEqual(C.summaryNotifications({...configured,summarySubscriptions:configured.summarySubscriptions.map(n=>({...n,hour:10}))},adminIdentity,{...clock,hour:10}).map(n=>n.key),rows.map(n=>n.key));
 const parts=C.notificationParts(Array.from({length:300},(_,i)=>'Сотрудник '+i+': просрочено 5; сдано с опозданием 1.').join('\n'));assert.ok(parts.length>1);assert.ok(parts.every(p=>p.length<=3500&&p));assert.match(parts.at(-1),/Сотрудник 299/);
});
{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE notifications(key TEXT PRIMARY KEY,status TEXT,chat_id TEXT,created_at TEXT,message_id TEXT,error TEXT)');
 const binding={prepare:sql=>({bind:(...values)=>({first:async()=>db.prepare(sql).get(...values),run:async()=>db.prepare(sql).run(...values)})})};
 globalThis.OPERATIONAL_TEST_ENV={APP_MODE:'production',BOT_ENABLED:'true',TELEGRAM_BOT_TOKEN:'fake-test-token',DB:binding};
 const originalFetch=globalThis.fetch;let deliveries=0;
 globalThis.fetch=async()=>{deliveries++;return Response.json({ok:true,result:{message_id:1}})};
 try{
  const {sendOnce,sendBatchOnce}=await import(`../${out}/bot.mjs`),notice=N.taskNotification(tomorrow,'a',noticeClock);
  const concurrent=await Promise.all([sendOnce(notice.key,'test',notice.text),sendOnce(notice.key,'test',notice.text)]);
  assert.equal(concurrent.filter(Boolean).length,1);assert.equal(deliveries,1);assert.equal(await sendOnce(notice.key,'test','Changed settings'),false);assert.equal(deliveries,1);
  checks++;console.log('PASS Notification delivery: concurrent schedule and retries send only once');
  const batch=await Promise.all([sendBatchOnce('batch','test',['One','Two']),sendBatchOnce('batch','test',['One','Two'])]);assert.equal(batch.reduce((a,b)=>a+b,0),2);assert.equal(deliveries,3);
  assert.equal(await sendBatchOnce('batch','test',['Changed','Changed','Extra']),0);assert.equal(deliveries,3);checks++;console.log('PASS Summary batch cannot grow or duplicate after retries');
  globalThis.fetch=async()=>{deliveries++;throw Error('Unknown delivery result')};
  assert.equal(await sendOnce('uncertain','test','test'),false);assert.equal(await sendOnce('uncertain','test','test'),false);assert.equal(deliveries,4);assert.equal(db.prepare('SELECT status FROM notifications WHERE key=?').get('uncertain').status,'uncertain');
  assert.equal(await sendBatchOnce('failed-batch','test',['One','Two']),0);assert.equal(await sendBatchOnce('failed-batch','test',['One','Two']),0);assert.equal(deliveries,5);
  checks++;console.log('PASS Uncertain delivery is not repeated and does not spam');
 }finally{globalThis.fetch=originalFetch;delete globalThis.OPERATIONAL_TEST_ENV;db.close()}
}
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
  const beforeNotifications=await S.row(),notifyEmployee=beforeNotifications.payload.employees.find(e=>e.id==='a');
  await S.mutate({revision:beforeNotifications.revision,requestId:'request-notifications-0001',patches:[{key:'employees',rows:[{...notifyEmployee,notifications:prefs}]}]},boss);
  const notificationReload=await S.row();assert.deepEqual(notificationReload.payload.employees.find(e=>e.id==='a').notifications,prefs);assert.deepEqual(notificationReload.payload.dailyTasks,beforeNotifications.payload.dailyTasks);assert.deepEqual(notificationReload.payload.documents,beforeNotifications.payload.documents);assert.equal((await pool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n,initialCount);checks++;console.log('PASS PostgreSQL notification preferences persist without changing tasks or ledger');
  await assert.rejects(S.mutate({revision:notificationReload.revision,requestId:'summary-invalid-recipient-1',patches:[{key:'summarySubscriptions',rows:[{...companySub,recipient:'a'}]}]},boss),/администратор/);
  assert.equal((await S.row()).revision,notificationReload.revision);
  await S.mutate({revision:notificationReload.revision,requestId:'summary-valid-recipient-1',patches:D.changes(notificationReload.payload,{...notificationReload.payload,summarySubscriptions:[companySub]})},boss);
  const summariesReload=await S.row();assert.deepEqual(summariesReload.payload.summarySubscriptions,[companySub]);assert.deepEqual(summariesReload.payload.documents,notificationReload.payload.documents);assert.equal((await pool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n,initialCount);checks++;console.log('PASS PostgreSQL summary settings persist, non-admin recipients rejected, ledger unchanged');
  const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456789})});const key=createHmac('sha256','WebAppData').update('test-token').digest();params.set('hash',createHmac('sha256',key).update([...params].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join('\n')).digest('hex'));
  const tgRequest=new Request('https://example.test',{headers:{'x-telegram-init-data':params.toString()}});await A.approveLogin(tgRequest,login.code);
  const approved=await A.finishLogin(new Request('https://example.test',{headers:{cookie:loginCookie}})),sessionCookie=approved.headers.get('set-cookie').split(';')[0];assert.equal((await A.authenticate(new Request('https://example.test',{headers:{cookie:sessionCookie}}))).employee,'a');await assert.rejects(A.finishLogin(new Request('https://example.test',{headers:{cookie:loginCookie}})));checks++;console.log('PASS Telegram signed approval, cookie session and one-time exchange');
  assert.equal((await pool.query('SELECT material,unit,SUM(quantity) FROM operational_postings GROUP BY material,unit HAVING SUM(quantity)<>0')).rows.length,0);checks++;console.log('PASS PostgreSQL journal balances');
  await root.query('CREATE SCHEMA IF NOT EXISTS daily_test');const dailyPool=new pg.Pool({connectionString:url.href,options:'-c search_path=daily_test'});
  try{await migrate(dailyPool);globalThis.OPERATIONAL_TEST_ENV={pool:dailyPool,TELEGRAM_BOT_TOKEN:'test-token'};
   const clock=S.localNow(),initial=M.generate({...dailyFixture,today:clock.today},clock.today,23);
   await S.transaction(c=>S.record(c,undefined,initial,1,'daily-fixture','fixture','system',{}));
   const postingCount=(await dailyPool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n;
   const results=await Promise.all([S.ensureTasks(),S.ensureTasks()]);const migrated=await S.row();assert.equal(migrated.payload.dailyVersion,1);assert.equal(migrated.payload.dailyTasks.length,2);assert.equal(migrated.revision,2);assert.deepEqual(migrated.payload.documents,initial.documents);assert.equal((await dailyPool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n,postingCount);assert.equal((await dailyPool.query('SELECT count(*) AS n FROM operational_backups')).rows[0].n,'1');
   const target=migrated.payload.dailyTasks.find(t=>t.warehouse==='a101'),request={revision:2,requestId:'daily-request-concurrent-1',patches:[{key:'dailySubmission',rows:[{id:target.id,mode:'off',reason:'Выходной день',crew:[],lines:[]}]}]};
   const saved=await Promise.allSettled([S.mutate(request,helper),S.mutate({...request,requestId:'daily-request-concurrent-2'},a)]);assert.equal(saved.filter(x=>x.status==='fulfilled').length,1);assert.ok(Daily.completed((await S.row()).payload,target));assert.equal((await dailyPool.query('SELECT count(*) AS n FROM operational_postings')).rows[0].n,postingCount);checks++;console.log('PASS PostgreSQL atomic one-time daily migration, backup, unchanged postings, concurrent owner/helper closure');
  }finally{await dailyPool.end();await root.query('DROP SCHEMA daily_test CASCADE');globalThis.OPERATIONAL_TEST_ENV={pool,TELEGRAM_BOT_TOKEN:'test-token'};}

 }finally{await pool.end();await root.query('DROP SCHEMA operational_test CASCADE');await root.end();}
}
console.log(`Operational checks passed: ${checks}`);
