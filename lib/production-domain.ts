import {z} from 'zod';
import {notificationSchema} from './task-notifications';
import * as Daily from './daily-work';
import * as M from './concise-model';
import {coilMovements} from './concise-coils';

const id=z.string().min(1).max(180), text=z.string().max(4000), date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(x=>new Date(x+'T12:00:00Z').toISOString().slice(0,10)===x,'Некорректная дата');
const number=z.number().finite().min(0).max(1e9), qty=number;
const crew=z.array(z.object({employee:id,ktu:number}).strict()).max(200);
const item=z.object({material:id,sent:qty,received:qty.nullable(),weights:z.array(number.positive()).max(10000).optional(),coils:number.int().optional()}).strict();
const assignment=z.object({id,warehouse:id,material:z.string().max(180),work:z.enum(['dig','extract','wind','strip']),active:z.boolean()}).strict();
const measurement=z.object({id,pid:id,material:id,date,gPerM:number.positive(),confirmed:z.literal(true),author:id}).strict();
const schemas={
 employees:z.object({id,name:z.string().trim().min(3).max(200),active:z.boolean(),notifications:notificationSchema.optional()}).strict(),
 pids:z.object({id,lengthM:number.positive().nullable(),cables:z.array(id).max(200).optional(),locality:z.string().trim().max(200).optional(),status:z.enum(['active','planned','inactive']).nullable().optional()}).strict(),
 warehouses:z.object({id,name:z.string().min(1).max(240),pid:z.string().max(180),owner:id,kind:z.enum(['field','main','master','sales'])}).strict(),
 materials:z.object({id,name:z.string().trim().min(1).max(240),kind:z.enum(['cable','metal'])}).strict(),
 assignments:assignment,
 duties:z.object({id,employee:id,pid:z.string().max(180),functions:z.array(z.enum(['dig','extract','wind','strip'])).min(1).max(4),active:z.boolean()}).strict(),
 replacements:z.object({warehouse:id,deputy:id,active:z.boolean()}).strict(),
 measurements:measurement,
 templates:z.object({id,name:z.string().trim().min(1).max(200),members:z.array(id).min(1).max(200),warehouse:id,active:z.boolean().optional()}).strict(),
 standards:z.object({material:id,date,rate:number.positive(),norm:z.array(number.max(100)).length(3)}).strict(),
};
type Catalog=keyof typeof schemas;
export type Principal={employee:string;admin:boolean};
export type Patch={key:string;rows:unknown[]};
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const keyFor=(key:string,row:Record<string,unknown>)=>key==='replacements'?`${row.warehouse}|${row.deputy}`:key==='standards'?`${row.material}|${row.date}`:String(row.id);
export function changes(before:M.State,after:M.State):Patch[]{return Object.keys(before).filter(k=>!same(before[k as keyof M.State],after[k as keyof M.State])).map(key=>{
 const a=before[key as keyof M.State],b=after[key as keyof M.State];
 if(!Array.isArray(a)||!Array.isArray(b))throw Error('Нельзя изменять служебные данные приложения.');
 const old=new Map((a as Record<string,unknown>[]).map(row=>[keyFor(key,row),row]));
 if((a as Record<string,unknown>[]).some(row=>!(b as Record<string,unknown>[]).some(x=>keyFor(key,x)===keyFor(key,row))))throw Error('Удаление учётных данных запрещено. Используйте исправление.');
 return {key,rows:(b as Record<string,unknown>[]).filter(row=>!same(old.get(keyFor(key,row)),row))};
}).filter(p=>p.rows.length>0);}
function fail(message:string):never{throw Error(message);}
function requireAdmin(p:Principal){if(!p.admin)fail('Настройки и уточнения доступны администратору.');}
export function validateReferences(s:M.State){
 for(const name of ['employees','pids','warehouses','materials','assignments','tasks','documents','measurements','templates'] as const){const rows=s[name];if(new Set(rows.map(x=>x.id)).size!==rows.length)fail('Повторяющиеся коды: '+name);}
 const employee=(id:string)=>s.employees.some(e=>e.id===id), wh=(id:string)=>s.warehouses.some(w=>w.id===id), mat=(id:string)=>s.materials.some(m=>m.id===id);
 for(const w of s.warehouses)if(!employee(w.owner)||w.kind==='field'&&(!w.pid||!s.pids.some(p=>p.id===w.pid)))fail('Проверьте МОЛ и ПИД склада.');
 if(new Set(s.warehouses.map(w=>w.owner+'|'+w.pid+(s.dailyVersion?'':'|'+w.kind))).size!==s.warehouses.length)fail('Склад этого ответственного уже существует.');
 for(const p of s.pids)if(p.cables?.some(id=>!s.materials.some(m=>m.id===id&&m.kind==='cable')))fail('Неверный кабель ПИД.');
 for(const d of s.duties||[])Daily.saveDuty({...s,employees:s.employees.map(e=>({...e,active:true})),duties:(s.duties||[]).filter(x=>x.id!==d.id)},d);
 if(new Set((s.dailyTasks||[]).map(t=>t.id)).size!==(s.dailyTasks||[]).length)fail('Повтор суточного задания.');
 for(const a of s.assignments)if(!wh(a.warehouse)||a.work!=='dig'&&!mat(a.material))fail('Неверное назначение склада или материала.');
 for(const r of s.replacements)if(!wh(r.warehouse)||!employee(r.deputy))fail('Неверное доверенное лицо.');
 for(const m of s.measurements)if(!employee(m.author)||!mat(m.material)||!s.pids.some(p=>p.id===m.pid))fail('Неверные связи удельной массы.');
 for(const t of s.templates)if(!wh(t.warehouse||'')||t.members.some(x=>!employee(x))||new Set(t.members).size!==t.members.length)fail('Проверьте склад и состав бригады.');
 for(const v of s.standards)if(!mat(v.material||'')||v.norm.reduce((a,b)=>a+b,0)>100)fail('Проверьте норматив кабеля.');
 for(const m of M.movements(s))if(!mat(m.material)||m.warehouse!=='transit'&&!wh(m.warehouse)||!Number.isSafeInteger(Math.round(m.qty*1e6)))fail('Неверное движение материала.');
 M.assertStock(s);
}

// The browser proposes edited fields. No client balances, permissions, frozen rates,
// authors, timestamps or task snapshots are accepted as authoritative.
export function applyChanges(state:M.State,input:unknown,p:Principal):M.State{
 const patches=z.array(z.object({key:z.string(),rows:z.array(z.unknown()).min(1).max(200)}).strict()).min(1).max(2).parse(input);
 if(new Set(patches.map(x=>x.key)).size!==patches.length)fail('Повтор раздела в запросе.');
 let s=structuredClone(state);const actor=p.admin?'admin':p.employee;
 if(!s.employees.some(e=>e.id===p.employee&&e.active))fail('Сотрудник отключён.');
 for(const patch of patches){
  if(patch.key==='dailySubmission'){
   if(patch.rows.length!==1)fail('Сохраните одно задание за раз.');
   const v=z.object({id,edit:z.boolean().optional(),expected:z.array(z.object({id,version:number.int()}).strict()).max(200).optional(),mode:z.enum(['work','off','idle']),reason:text,crew,lines:z.array(z.object({work:z.enum(['dig','extract','wind','strip']),material:z.string().max(180),qty,measureId:id.optional(),confirmed:z.boolean().optional(),metals:z.array(qty).length(3).optional()}).strict()).max(100)}).strict().parse(patch.rows[0]);
   s=Daily.saveDaily(s,v,p.employee,p.admin);
  }else if(patch.key==='documents'){
   const proposed=patch.rows as M.Document[];
   if(proposed.every(d=>d.kind==='work')){
    const entries=proposed.map(d=>{
     const doc=d as M.WorkDoc,task=s.tasks.find(t=>t.id===doc.taskId);if(!task)fail('Задание отсутствует.');
     if(s.dailyVersion&&!M.taskDoc(s,task.id))fail('Заполните общее суточное задание в новой версии приложения.');
     const old=M.taskDoc(s,task.id),version=old?M.current(old).version:0,v=doc.versions?.at(-1);
     if(s.documents.some(d=>d.id===doc.id&&(d.kind!=='work'||d.taskId!==task.id)))fail('Номер документа уже используется.');
     if(!v||v.version!==version+1||doc.id!==(old?.id||'Д-'+task.id))fail('Документ уже изменён. Обновите страницу.');
     return z.object({taskId:id,qty,mode:z.enum(['work','off','idle']),reason:text,expected:number.int(),measureId:id.optional(),confirmed:z.boolean(),metals:z.array(qty).length(3).optional(),crew}).strict().parse({taskId:task.id,qty:v.qty,mode:v.mode,reason:v.reason,expected:version,measureId:v.measure?.id,confirmed:!!v.measure,metals:v.metals,crew:v.crew});
    });
    if(new Set(entries.map(e=>e.taskId)).size!==entries.length)fail('Задание указано дважды.');
    s=M.saveDay(s,entries,actor);
    s.documents=s.documents.map(d=>d.kind==='work'&&entries.some(e=>e.taskId===d.taskId)?{...d,versions:d.versions.map((v,i)=>i===d.versions.length-1?{...v,actor:p.employee,measure:v.measure?{...v.measure,confirmedBy:p.employee}:undefined}:v)}:d);
   }else{
    if(proposed.length!==1)fail('Сохраните один документ за раз.');
    const raw=proposed[0];id.parse(raw.id);const old=s.documents.find(d=>d.id===raw.id);
    if(raw.kind==='transfer'){
     if(!old){
      const t=z.object({id,kind:z.literal('transfer'),date,from:id,to:id,actor:id,items:z.array(item).min(1).max(100),weights:z.array(number.positive()).max(10000),reason:text}).strict().parse(raw);
      if(t.date!==s.today||t.items.some(i=>i.received!==null))fail('Новая отправка оформляется сегодня, без приёмки за получателя.');
      s=M.transfer(s,{...t,actor});s.documents=s.documents.map(d=>d.id===t.id?{...t,actor:p.employee}:d);
     }else{
      if(old.kind!=='transfer'||raw.items.length!==old.items.length||!same(raw.items.map(i=>i.material),old.items.map(i=>i.material)))fail('Состав проведённой отправки менять нельзя.');
      const values=raw.items.map(i=>item.parse(i));text.parse(raw.reason);
      if(old.items.every(i=>i.received===null)){
       if(!same(values.map(({received,...v})=>v),old.items.map(({received,...v})=>v))||values.some(i=>i.received===null))fail('Приёмка не меняет отправку.');
       s=M.receive(s,old.id,values.map(i=>i.received!),actor,raw.reason);
       s.documents=s.documents.map(d=>d.id===old.id?{...(d as M.Transfer),receiver:p.employee}:d);
      }else{
       requireAdmin(p);if(raw.reason.trim().length<3)fail('Укажите причину исправления.');
       if(values.some((i,k)=>i.received===null||!same({...i,sent:old.items[k].sent,received:old.items[k].received},old.items[k])||(old.weights.length||i.weights?.length)&&i.sent!==old.items[k].sent))fail('Сохраните исходные массы катушек.');
       s.documents=s.documents.map(d=>d.id!==old.id?d:{...old,items:values,reason:raw.reason,history:[...(old.history||[]),{at:new Date().toISOString(),actor:p.employee,reason:raw.reason,items:old.items}]});
      }
     }
    }else if(raw.kind==='exclusion'){
     const v=raw.versions?.at(-1);if(!v)fail('Не указана длина участка.');
     const d=z.object({id,date,warehouse:id,lengthM:number.positive(),reason:text,expected:number.int()}).strict().parse({id:raw.id,date:raw.date,warehouse:raw.warehouse,lengthM:v.lengthM,reason:v.reason,expected:v.version-1});
     s=M.saveExclusion(s,d,actor);s.documents=s.documents.map(x=>x.id===d.id&&x.kind==='exclusion'?{...x,versions:x.versions.map((v,i)=>i===x.versions.length-1?{...v,actor:p.employee}:v)}:x);
    }else if(raw.kind==='opening'||raw.kind==='adjustment'){
     requireAdmin(p);if(old)fail('Изменение начального остатка оформляется уточнением.');
     const common={id,date,warehouse:id,material:id,qty:z.number().finite().min(-1e9).max(1e9),actor:id};
     const d=raw.kind==='opening'?z.object({...common,kind:z.literal('opening')}).strict().parse(raw):z.object({...common,kind:z.literal('adjustment'),reason:text.min(3),basis:id}).strict().parse(raw);
     if(d.date>s.today||d.kind==='opening'&&(d.qty<0||s.documents.some(x=>x.kind==='opening'&&x.warehouse===d.warehouse&&x.material===d.material)))fail('Начальный остаток уже существует или дата неверна.');
     if(d.kind==='adjustment'&&!s.documents.some(x=>(x.kind==='opening'||x.kind==='adjustment')&&x.id===d.basis&&x.warehouse===d.warehouse&&x.material===d.material))fail('Не найден документ-основание.');
     s.documents.push({...d,actor:p.employee});
    }else fail('Неизвестный документ.');
   }
  }else if(patch.key in schemas){
   const key=patch.key as Catalog;
   for(const row of patch.rows){
    const value=schemas[key].parse(row) as Record<string,unknown>;
    const records=s[key] as unknown as Record<string,unknown>[],old=records.find(r=>keyFor(key,r)===keyFor(key,value));
    if(key==='measurements'&&!p.admin){
     if(old)fail('Замер уже существует.');
     const m=value as unknown as M.Measurement;
     const task=s.tasks.find(t=>t.assignment.work==='extract'&&t.assignment.material===m.material&&s.warehouses.find(w=>w.id===t.assignment.warehouse)?.pid===m.pid&&m.date<=t.date&&M.canReport(s,t.assignment,actor));
     if(task){s=M.addTaskMeasurement(s,task.id,m,actor);continue;}
     const day=s.dailyTasks?.find(t=>t.functions.includes('extract')&&t.pid===m.pid&&t.materials.includes(m.material)&&m.date<=t.date&&Daily.canFill(s,t,p.employee));
     if(!day)fail('Нет доступа к замеру.');
     if(m.date>s.today)fail('Дата измерения ещё не наступила.');
     s={...s,measurements:[...s.measurements,{...m,author:p.employee}]};continue;
    }
    requireAdmin(p);
    if(key==='employees'&&value.id===p.employee&&value.active===false)fail('Нельзя отключить собственную учётную запись.');
    if(key==='measurements'&&old)fail('Сохранённый коэффициент не переписывается. Добавьте новый замер.');
    if(key==='standards'&&old)fail('Правило на эту дату уже есть. Создайте правило с новой датой.');
    if(key==='warehouses'&&old&&!same(old,value))fail('Ответственного проведённого склада менять нельзя. Создайте новый склад и перемещение.');
    if(key==='materials'&&old&&!same(old,value))fail('Материал проведённых документов менять нельзя.');
    if(key==='assignments'&&s.dailyVersion)fail('Используйте функции сотрудника. Обновите страницу.');
    if(key==='duties')s=Daily.saveDuty(s,value as unknown as Daily.Duty);
    else if(key==='assignments')s=M.saveAssignment(s,value as unknown as M.Assignment);
    else if(key==='replacements')s=M.saveReplacement(s,value as unknown as M.Replacement);
    else if(key==='pids')s=M.savePid(s,value as unknown as M.Pid);
    else (s as unknown as Record<string,unknown>)[key]=[...records.filter(r=>keyFor(key,r)!==keyFor(key,value)),value];
   }
  }else fail('Служебные записи изменяет только сервер.');
 }
 validateReferences(s);return s;
}

export function postings(s:M.State){
 const rows:{document:string;date:string;warehouse:string;material:string;unit:string;quantity:number;basis:string}[]=M.movements(s).filter(m=>m.qty!==0).map(m=>({document:m.docId,date:m.date,warehouse:m.warehouse,material:m.material,unit:'g',quantity:Math.round(m.qty*1e6),basis:m.basis}));
 return rows.concat(coilMovements(s).filter(m=>m.qty!==0).map(m=>({document:m.docId,date:m.date,warehouse:m.warehouse,material:m.material,unit:'coil',quantity:m.qty,basis:'auxiliary'})));
}
