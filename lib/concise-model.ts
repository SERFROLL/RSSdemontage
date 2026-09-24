import type {Duty,DailyTask} from './daily-work';
export const REVISION = 'production-2026-09-23';
export const STORAGE = 'rss-concise-v7';
export const START = '2026-09-01';
export const DAY = '2026-09-16';
export const works = {dig:{name:'Копка',unit:'м'},extract:{name:'Извлечение',unit:'м'},wind:{name:'Намотка',unit:'шт.'},strip:{name:'Разделка',unit:'т'}};
export type Work = keyof typeof works;
export type Employee = {id:string;name:string;active:boolean};
export type Pid = {id:string;lengthM:number|null;cables?:string[];locality?:string;status?:'active'|'planned'|'inactive'|null};
export const pidStatuses = {active:'В работе',planned:'В плане',inactive:'Не в работе'};
export const pidStatusLabel=(p?:Pid)=>p?.status?pidStatuses[p.status]:'Не указано';
export type Replacement = {warehouse:string;deputy:string;active:boolean};
export type ExclusionVersion = {version:number;lengthM?:number;startM?:number;endM?:number;reason:string;actor:string;at:string};
export type Exclusion = {id:string;kind:'exclusion';date:string;warehouse:string;versions:ExclusionVersion[]};
export type Warehouse = {id:string;name:string;pid:string;owner:string;kind:'field'|'main'|'master'|'sales'};
export type Material = {id:string;name:string;kind:'cable'|'metal'};
export type Assignment = {id:string;warehouse:string;material:string;work:Work;active:boolean};
// Responsible person and access are snapshots of the warehouse when a task is created.
// Legacy performer is kept only inside old task/document data, never used for assignment or discipline.
export type AssignedWork = Assignment & {responsible?:string;editors?:string[];performer?:string};
export type Task = {id:string;date:string;assignment:AssignedWork;source?:'restored'};
export type Measurement = {id:string;pid:string;material:string;date:string;gPerM?:number;metres?:number;kg?:number;confirmed:boolean;author:string;method?:'measured'|'manual';kgPerM?:number;reason?:string};
export type Snapshot = {id:string;date:string;kgPerM:number;confirmedBy:string;method?:'measured'|'manual';reason?:string};
export type Crew = {employee:string;ktu:number};
export type Revision = {version:number;qty:number;actor:string;at:string;reason:string;mode:'work'|'off'|'idle';measure?:Snapshot;metals?:number[];crew:Crew[];rate:number;norm:number[]};
export type WorkDoc = {source?:'restored';id:string;kind:'work';taskId:string;date:string;assignment:AssignedWork;versions:Revision[]};
export type TransferItem = {material:string;sent:number;received:number|null;weights?:number[];coils?:number};
export type Transfer = {id:string;kind:'transfer';date:string;from:string;to:string;actor:string;items:TransferItem[];weights:number[];receivedAt?:string;receiver?:string;reason:string;history?:{at:string;actor:string;reason:string;items:TransferItem[]}[]};
export type Opening = {id:string;kind:'opening';date:string;warehouse:string;material:string;qty:number;actor:string};
export type Adjustment = {id:string;kind:'adjustment';date:string;warehouse:string;material:string;qty:number;actor:string;reason:string;basis:string};
export type Document = WorkDoc|Transfer|Opening|Adjustment|Exclusion;
export type Standard = {material?:string;date:string;rate:number;norm:number[]};
export type State = {version:7;dailyVersion?:1;duties?:Duty[];dailyTasks?:DailyTask[];pids:Pid[];replacements:Replacement[];today:string;hour:number;generated:string[];employees:Employee[];warehouses:Warehouse[];materials:Material[];assignments:Assignment[];tasks:Task[];documents:Document[];measurements:Measurement[];standards:Standard[];templates:{id:string;name:string;members:string[];warehouse?:string;active?:boolean}[]};
export const n = (s:string) => /^-?\d+(?:[.,]\d+)?$/.test(s.trim()) ? Number(s.replace(',','.')) : NaN;
export const fmt = (x:number,d=3) => (Object.is(x,-0)?0:x).toLocaleString('ru-RU',{maximumFractionDigits:d});
export const dateLabel = (date:string) => new Date(date+'T12:00:00Z').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
export const taskDateLabel = (date:string) => new Date(date+'T12:00:00Z').toLocaleDateString('ru-RU',{weekday:'long',day:'numeric',month:'long'});
export const round = (x:number) => Math.round(x*1e6)/1e6||0;
export const current = (d:WorkDoc) => d.versions[d.versions.length-1];
export const person = (s:State,id:string) => id==='admin'?'Администратор':id==='system:historical-import'?'Восстановление истории':s.employees.find(p=>p.id===id)?.name||id;
export const warehouse = (s:State,id:string) => id==='transit'?'В пути / расхождения':s.warehouses.find(w=>w.id===id)?.name||id;
export const material = (s:State,id:string) => s.materials.find(m=>m.id===id)?.name||id;
export const workMaterialMatches = (a:Assignment,id:string) => id==='all'||a.material===id||a.work==='strip'&&['copper','lead','aluminium'].includes(id);
export function dateRange(from:string,to:string){const out:string[]=[];for(let date=from;date<=to&&out.length<370;){out.push(date);const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);date=d.toISOString().slice(0,10);}return out;}
export function tomorrow(date:string){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
// Keep the frozen historical kg/m snapshots compatible; new forms store g/m.
export const measurementCoefficient = (m:Measurement) => m.gPerM !== undefined ? m.gPerM/1000 : m.method==='manual' ? m.kgPerM! : m.kg!/m.metres!;
export const measurementGrams = (m:Measurement) => round(measurementCoefficient(m)*1000);
export const exclusionLength = (v:ExclusionVersion) => v.lengthM ?? (v.endM! - v.startM!);
export const crewTemplates = (s:State,warehouseId:string) => s.templates.filter(t=>t.active!==false&&t.warehouse===warehouseId);
export function parseCoilWeights(text:string){
 if(!text.trim())return [];
 // Whitespace separates coils. A comma or dot belongs to one decimal mass in kg.
 // Keep invalid tokens visible to the form; never silently drop a coil.
 return text.trim().split(/\s+/).map(token=>/^\d+(?:[.,]\d{1,3})?$/.test(token)?n(token):NaN);
}
export function eligibleMeasurements(s:State,a:Assignment,date:string){const pid=s.warehouses.find(w=>w.id===a.warehouse)?.pid;return [...s.measurements].reverse().filter(m=>m.confirmed&&m.pid===pid&&m.material===a.material&&m.date<=date&&Number.isFinite(measurementCoefficient(m))&&measurementCoefficient(m)>0).sort((a,b)=>b.date.localeCompare(a.date));}
export function measurementAt(s:State,a:Assignment,date:string){return eligibleMeasurements(s,a,date)[0];}
export function addTaskMeasurement(s:State,taskId:string,m:Measurement,actor:string):State{
 const task=s.tasks.find(t=>t.id===taskId);
 if(!task||task.assignment.work!=='extract'||!canReport(s,task.assignment,actor))throw Error('Нет доступа к замеру по этому заданию.');
 const pid=s.warehouses.find(w=>w.id===task.assignment.warehouse)?.pid;
 if(m.pid!==pid||m.material!==task.assignment.material)throw Error('Замер должен относиться к ПИД и кабелю задания.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(Date.parse(m.date))||m.date>task.date)throw Error('Дата замера не может быть позже даты работы.');
 if(s.measurements.some(x=>x.id===m.id))throw Error('Этот замер уже записан.');
 if(!Number.isFinite(measurementGrams(m))||measurementGrams(m)<=0)throw Error('Укажите положительную удельную массу, г/м.');
 const record:Measurement={id:m.id,pid:m.pid,material:m.material,date:m.date,gPerM:measurementGrams(m),author:actor,confirmed:true};
 return {...s,measurements:[...s.measurements,record]};
}
export function standardAt(s:State,date:string,material?:string){return [...s.standards].filter(v=>v.date<=date&&(!v.material||v.material===material)).sort((a,b)=>b.date.localeCompare(a.date))[0];}
export function generate(s:State,date:string,hour=9):State{
 if(hour<9||s.generated.includes(date))return {...s,today:date,hour};
 const tasks=s.assignments.filter(a=>a.active&&s.employees.some(e=>e.active&&e.id===s.warehouses.find(w=>w.id===a.warehouse)?.owner)).map(a=>{const responsible=s.warehouses.find(w=>w.id===a.warehouse)!.owner;return {id:a.id+'@'+date,date,assignment:{...cleanAssignment(a),responsible,editors:[...new Set([responsible,...s.replacements.filter(r=>r.active&&r.warehouse===a.warehouse).map(r=>r.deputy)])]}}});
 return {...s,today:date,hour,generated:[...s.generated,date],tasks:[...s.tasks,...tasks]};
}
export const cleanAssignment = (a:Assignment):Assignment => ({id:a.id,warehouse:a.warehouse,material:a.work==='dig'?'':a.material,work:a.work,active:a.active});
export const assignmentOwner = (s:State,a:AssignedWork) => a.responsible||s.warehouses.find(w=>w.id===a.warehouse)!.owner;
export function canReport(s:State,a:AssignedWork,actor:string){return actor==='admin'||(s.employees.some(p=>p.id===actor&&p.active)&&(a.editors?a.editors.includes(actor):canManageWarehouse(s,a.warehouse,actor)));}
export function taskPlace(s:State,warehouseId:string,actor:string,date:string){
 const w=s.warehouses.find(w=>w.id===warehouseId);if(!w?.pid)return warehouse(s,warehouseId);
 const ids=new Set(s.tasks.filter(t=>t.date===date&&canReport(s,t.assignment,actor)&&s.warehouses.some(x=>x.id===t.assignment.warehouse&&x.pid===w.pid)).map(t=>t.assignment.warehouse));
 return 'ПИД'+w.pid+(ids.size>1?' · '+person(s,w.owner):'');
}
export function personalMaterialKinds(s:State,actor:string,to:string):Material['kind'][] {
 const owned=s.warehouses.filter(w=>canManageWarehouse(s,w.id,actor));
 const actual=movements(s).filter(m=>m.date<=to&&owned.some(w=>w.id===m.warehouse));
 return (['metal','cable'] as const).filter(kind=>owned.some(w=>kind==='cable'?w.kind!=='sales':['main','master','sales'].includes(w.kind))||actual.some(m=>s.materials.some(x=>x.id===m.material&&x.kind===kind)));
}
export function taskDoc(s:State,id:string){return s.documents.find((d):d is WorkDoc=>d.kind==='work'&&d.taskId===id);}
export function payout(total:number,crew:Crew[]){const sum=crew.reduce((a,c)=>a+c.ktu,0);if(!sum)return crew.map(()=>0);const cents=Math.round(total*100),values=crew.map(c=>cents*c.ktu/sum),floors=values.map(Math.floor);const order=values.map((v,i)=>({i,f:v-floors[i]})).sort((a,b)=>b.f-a.f);for(let i=0,left=cents-floors.reduce((a,b)=>a+b,0);i<left;i++)floors[order[i].i]++;return floors.map(v=>v/100);}
export type Entry = {taskId:string;qty:number;mode:Revision['mode'];reason:string;expected:number;measureId?:string;confirmed?:boolean;metals?:number[];crew:Crew[]};
export function saveDay(s:State,entries:Entry[],actor:string):State{
 let next=structuredClone(s);
 for(const e of entries){
  const task=next.tasks.find(t=>t.id===e.taskId);if(!task||!canReport(next,task.assignment,actor))throw Error('Нет доступа к этому заданию.');
  const a=task.assignment,old=taskDoc(next,task.id),v=old?current(old):undefined;
  if((v?.version||0)!==e.expected)throw Error('Задание уже изменено другим сотрудником. Откройте его заново.');
  if(!Number.isFinite(e.qty)||e.qty<0||(a.work==='wind'&&!Number.isInteger(e.qty)))throw Error('Проверьте количество. Катушки указываются целым числом.');
  if((v||e.mode!=='work'||e.qty===0)&&e.reason.trim().length<3)throw Error('Укажите причину исправления, выходного или простоя.');
  if(e.mode!=='work'&&e.qty!==0)throw Error('При выходном или простое объём должен быть равен нулю.');
  if(a.work==='strip'&&e.mode==='work'&&e.qty>0&&(!e.crew.length||new Set(e.crew.map(c=>c.employee)).size!==e.crew.length||e.crew.some(c=>!Number.isFinite(c.ktu)||c.ktu<0||!next.employees.some(p=>p.id===c.employee&&(p.active||v?.crew.some(old=>old.employee===p.id))))||!e.crew.some(c=>c.ktu>0)))throw Error('Выберите действующих участников и укажите КТУ больше нуля хотя бы одному.');
  let measure:Snapshot|undefined;
  if(a.work==='extract'&&e.qty>0){
   const selected=eligibleMeasurements(next,a,task.date).find(m=>m.id===e.measureId);const saved=v?.measure;
   if(!e.confirmed)throw Error('Подтвердите удельную массу кабеля.');
   if(saved&&e.measureId===saved.id)measure={...saved,confirmedBy:actor};
   else if(selected)measure={id:selected.id,date:selected.date,kgPerM:measurementCoefficient(selected),confirmedBy:actor,method:selected.method,reason:selected.reason};
   else throw Error('Выберите подтверждённый замер для этого ПИД и кабеля на дату работы.');
  }
  const standard=standardAt(next,task.date,a.material);if(a.work==='strip'&&e.mode==='work'&&e.qty>0&&!standard)throw Error('Нет действующего тарифа и норматива для этого кабеля.');
  const rate=v?.rate??standard?.rate??0,norm=v?.norm??standard?.norm??[0,0,0];
  if(a.work==='strip'&&e.mode==='work'){if(!e.metals||e.metals.length!==3||e.metals.some(q=>!Number.isFinite(q)||q<0)||e.metals.reduce((x,y)=>x+y,0)>e.qty+1e-6)throw Error('Укажите взвешенные металлы. Их масса не может превышать массу кабеля.');if(e.metals.some((q,i)=>Math.abs(q-e.qty*norm[i]/100)>.000001)&&e.reason.trim().length<3)throw Error('Поясните отклонение выхода металлов от нормы.');}
  const rev:Revision={version:e.expected+1,qty:e.qty,actor,at:new Date().toISOString(),reason:e.reason.trim(),mode:e.mode,measure,metals:a.work==='strip'?(e.mode==='work'?e.metals:[0,0,0]):undefined,crew:e.mode==='work'?structuredClone(a.work==='strip'?e.crew:v?.crew||[]):[],rate,norm:[...norm]};
  const doc:WorkDoc={id:old?.id||'Д-'+task.id,kind:'work',taskId:task.id,date:task.date,assignment:structuredClone(a),...(old?.source?{source:old.source}:{}),versions:[...(old?.versions||[]),rev]};
  next.documents=next.documents.filter(d=>d.id!==doc.id).concat(doc);
 }
 assertStock(next);
 return next;
}
export type Move={date:string;warehouse:string;material:string;qty:number;docId:string;label:string;basis:'calculated'|'weighed'|'opening'|'adjustment'};
export function movements(s:State):Move[]{const out:Move[]=[];const add=(date:string,w:string,m:string,q:number,id:string,label:string,basis:Move['basis'])=>out.push({date,warehouse:w,material:m,qty:round(q),docId:id,label,basis});
 for(const d of s.documents){
  if(d.kind==='exclusion')continue;
  if(d.kind==='opening'||d.kind==='adjustment'){add(d.date,d.warehouse,d.material,d.qty,d.id,d.kind==='opening'?'Начальный остаток':'Уточнение массы',d.kind);continue;}
  if(d.kind==='work'){const v=current(d),a=d.assignment;if(v.mode!=='work')continue;if(a.work==='extract'&&v.measure)add(d.date,a.warehouse,a.material,v.qty*v.measure.kgPerM/1000,d.id,'Извлечено · расчётная масса','calculated');if(a.work==='strip'){add(d.date,a.warehouse,a.material,-v.qty,d.id,'Разделано кабеля','weighed');['copper','lead','aluminium'].forEach((m,i)=>add(d.date,a.warehouse,m,v.metals?.[i]||0,d.id,'Получено при разделке','weighed'));}continue;}
  for(const item of d.items){add(d.date,d.from,item.material,-item.sent,d.id,'Отправлено','weighed');add(d.date,'transit',item.material,item.sent,d.id,'В пути','weighed');if(item.received!==null){add(d.receivedAt||d.date,'transit',item.material,-item.received,d.id,'Принято / разница','weighed');add(d.receivedAt||d.date,d.to,item.material,item.received,d.id,'Принято','weighed');}}
 }
 return out;
}
export function stock(s:State,w:string,m:string,date=s.today){return round(movements(s).filter(x=>x.warehouse===w&&x.material===m&&x.date<=date).reduce((q,x)=>q+x.qty,0));}
export function assertStock(s:State){const grouped=new Map<string,Move[]>();for(const m of movements(s)){if(m.warehouse==='transit')continue;const key=m.warehouse+'|'+m.material;grouped.set(key,[...(grouped.get(key)||[]),m]);}for(const list of grouped.values()){let qty=0;const ds=[...new Set(list.map(m=>m.date))].sort();for(const date of ds){qty=round(qty+list.filter(m=>m.date===date).reduce((a,m)=>a+m.qty,0));if(qty<0)throw Error(`Недостаточно материала: ${warehouse(s,list[0].warehouse)} · ${material(s,list[0].material)} на ${date}. Проверьте связанные документы.`);}}}
export function transfer(s:State,t:Transfer):State{
 if(t.actor!=='admin'&&!s.employees.some(p=>p.id===t.actor&&p.active))throw Error('Сотрудник не работает.');
 if(t.from===t.to||!s.warehouses.some(w=>w.id===t.from)||!s.warehouses.some(w=>w.id===t.to))throw Error('Выберите разные склады отправителя и получателя.');
 if(!t.items.length||t.items.some(i=>!Number.isFinite(i.sent)||i.sent<=0||!s.materials.some(m=>m.id===i.material))||new Set(t.items.map(i=>i.material)).size!==t.items.length)throw Error('Укажите массу хотя бы одного материала без повторяющихся строк.');
 if(t.items.some(i=>i.coils!==undefined&&(!Number.isInteger(i.coils)||i.coils<0)||i.weights!==undefined&&(i.weights.some(q=>!Number.isFinite(q)||q<=0)||i.coils!==undefined&&i.coils!==i.weights.length)))throw Error('Количество катушек должно быть целым; каждая указанная масса — положительной.');
 if(t.items.some(i=>i.weights?.length&&Math.abs(round(i.weights.reduce((sum,q)=>sum+q,0)/1000)-i.sent)>.000001))throw Error('Масса отправки должна совпадать с суммой масс катушек.');
 if(!canManageWarehouse(s,t.from,t.actor))throw Error('Отправку оформляет МОЛ или доверенное лицо.');
 if(s.documents.some(d=>d.id===t.id))throw Error('Эта отправка уже сохранена.');
 const next={...s,documents:[...s.documents,t]};assertStock(next);return next;
}
export function receive(s:State,id:string,values:number[],actor:string,reason:string):State{
 if(actor!=='admin'&&!s.employees.some(p=>p.id===actor&&p.active))throw Error('Сотрудник не работает.');
 const t=s.documents.find((d):d is Transfer=>d.id===id&&d.kind==='transfer');if(!t||t.items.some(i=>i.received!==null))throw Error('Поставка уже принята или недоступна.');
 if(!canManageWarehouse(s,t.to,actor))throw Error('Приёмку подтверждает МОЛ или доверенное лицо.');
 if(values.length!==t.items.length||values.some(q=>!Number.isFinite(q)||q<0))throw Error('Укажите измеренную массу каждой позиции.');
 if(values.some((q,i)=>Math.abs(q-t.items[i].sent)>.000001)&&reason.trim().length<3)throw Error('Поясните расхождение отправленной и принятой массы.');
 return {...s,documents:s.documents.map(d=>d.id!==id?d:{...t,receivedAt:s.today,receiver:actor,reason,items:t.items.map((i,k)=>({...i,received:values[k]}))})};
}
export function saveAssignment(s:State,a:Assignment):State{
 a=cleanAssignment(a);
 if(!s.warehouses.some(w=>w.id===a.warehouse))throw Error('Выберите склад. Ответственный уже указан в нём.');
 const w=s.warehouses.find(w=>w.id===a.warehouse)!;
 if(['dig','extract','wind'].includes(a.work)&&!w.pid)throw Error('Копка, извлечение и намотка назначаются по ПИД.');
 if(a.work!=='dig'&&!s.materials.some(m=>m.id===a.material&&m.kind==='cable'))throw Error('Выберите кабель.');
 if(s.assignments.some(x=>x.id!==a.id&&x.active&&a.active&&x.warehouse===a.warehouse&&x.material===a.material&&x.work===a.work))throw Error('Функция для этого склада и кабеля уже назначена. Измените существующее назначение; доступ коллег задаётся в «Доверенных лицах».');
 return {...s,assignments:[...s.assignments.filter(x=>x.id!==a.id),a]};
}
export function canManageWarehouse(s:State,id:string,actor:string){return actor==='admin'||s.employees.some(p=>p.id===actor&&p.active)&&!!s.warehouses.find(w=>w.id===id&&(w.owner===actor||s.replacements.some(r=>r.warehouse===id&&r.deputy===actor&&r.active)));}
export function saveReplacement(s:State,r:Replacement):State{
 const w=s.warehouses.find(w=>w.id===r.warehouse);
 if(!w||w.owner===r.deputy||!s.employees.some(p=>p.id===r.deputy&&(!r.active||p.active)))throw Error('Выберите склад МОЛ и другого действующего сотрудника.');
 return {...s,replacements:[...s.replacements.filter(x=>x.warehouse!==r.warehouse||x.deputy!==r.deputy),r]};
}
export function pidCatalog(s:State):Pid[]{return [...new Set([...s.pids.map(p=>p.id),...s.warehouses.map(w=>w.pid).filter(Boolean)])].map(id=>s.pids.find(p=>p.id===id)||{id,lengthM:null});}
export function savePid(s:State,pid:Pid):State{
 const id=pid.id.trim();if(!id||pid.lengthM!==null&&(!Number.isFinite(pid.lengthM)||pid.lengthM<=0))throw Error('Укажите номер ПИД и положительную длину трассы в метрах.');
 if(pid.status!=null&&!Object.hasOwn(pidStatuses,pid.status))throw Error('Неизвестный статус ПИД.');
 const previous=s.pids.find(p=>p.id===id);
 const next={...previous,id,lengthM:pid.lengthM,...(pid.locality!==undefined?{locality:pid.locality.trim()}:{}),...(pid.status!==undefined?{status:pid.status}:{})};
 return {...s,pids:previous?s.pids.map(p=>p.id===id?next:p):[...s.pids,next]};
}
export function pidProgress(s:State,pid:string,from:string,to:string){
 const docs=s.documents.filter((d):d is WorkDoc|Exclusion=>(d.kind==='work'&&d.assignment.work==='dig'||d.kind==='exclusion')&&d.date<=to&&s.warehouses.some(w=>w.pid===pid&&w.id===(d.kind==='work'?d.assignment.warehouse:d.warehouse)));
 const qty=(d:WorkDoc|Exclusion)=>d.kind==='work'?current(d).qty:exclusionLength(d.versions.at(-1)!);
 const dig=round(docs.filter(d=>d.kind==='work').reduce((a,d)=>a+qty(d),0)),excluded=round(docs.filter(d=>d.kind==='exclusion').reduce((a,d)=>a+qty(d),0));
 const total=round(dig+excluded),length=s.pids.find(p=>p.id===pid)?.lengthM||null,period=round(docs.filter(d=>d.date>=from).reduce((a,d)=>a+qty(d),0));
 return {dig,excluded,total,length,period,percent:length?round(total/length*100):null,docs};
}
export function saveExclusion(s:State,input:{id:string;date:string;warehouse:string;lengthM:number;reason:string;expected:number},actor:string):State{
 const w=s.warehouses.find(w=>w.id===input.warehouse),old=s.documents.find(d=>d.id===input.id);
 if(!w||w.kind!=='field'||!canManageWarehouse(s,w.id,actor))throw Error('Участок фиксирует МОЛ по ПИД или доверенное лицо.');
 if(old&&old.kind!=='exclusion'||(old?.kind==='exclusion'?old.versions.at(-1)!.version:0)!==input.expected)throw Error('Документ уже изменён. Откройте его заново.');
 if(old?.kind==='exclusion'&&(old.date!==input.date||old.warehouse!==input.warehouse))throw Error('Склад и дата документа остаются прежними.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!Number.isFinite(Date.parse(input.date))||input.date>s.today)throw Error('Укажите дату не позже сегодня.');
 if(!Number.isFinite(input.lengthM)||input.lengthM<=0||input.reason.trim().length<3)throw Error('Укажите положительную длину участка и причину.');
 const length=s.pids.find(p=>p.id===w.pid)?.lengthM;if(length&&input.lengthM>length)throw Error('Длина участка больше полной длины ПИД.');
 const v:ExclusionVersion={version:input.expected+1,lengthM:input.lengthM,reason:input.reason.trim(),actor,at:new Date().toISOString()};
 const d:Exclusion={id:input.id,kind:'exclusion',date:input.date,warehouse:w.id,versions:[...(old?.kind==='exclusion'?old.versions:[]),v]};
 return {...s,documents:[...s.documents.filter(x=>x.id!==d.id),d]};
}
