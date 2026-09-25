import * as M from './concise-model';

export type Duty={id:string;employee:string;pid:string;functions:M.Work[];active:boolean};
export type DailyTask={id:string;date:string;employee:string;warehouse:string;pid:string;functions:M.Work[];editors:string[];materials:string[];legacyTaskIds:string[];restored?:boolean};
export type DailyLine={work:M.Work;material:string;qty:number;measureId?:string;confirmed?:boolean;metals?:number[]};
export type DailySubmission={id:string;edit?:boolean;expected?:{id:string;version:number}[];mode:'work'|'off'|'idle';reason:string;lines:DailyLine[];crew:M.Crew[]};
export const worksOrder:M.Work[]=['dig','extract','wind','strip'];
const unique=<T,>(a:T[])=>[...new Set(a)];
export const dutyWarehouse=(s:M.State,d:Pick<Duty,'employee'|'pid'>)=>s.warehouses.find(w=>w.owner===d.employee&&w.pid===d.pid);
export const dailyId=(date:string,warehouse:string)=>'day:'+date+':'+warehouse;
export function canFill(s:M.State,t:DailyTask,employee:string){return s.employees.some(e=>e.id===employee&&e.active)&&t.editors.includes(employee);}
export function documents(s:M.State,t:DailyTask){return s.documents.filter((d):d is M.WorkDoc=>d.kind==='work'&&(t.legacyTaskIds.includes(d.taskId)||d.taskId.startsWith(t.id+'#')));}
export const remaining=(s:M.State,t:DailyTask)=>t.functions.filter(w=>!documents(s,t).some(d=>d.assignment.work===w));
export const completed=(s:M.State,t:DailyTask)=>remaining(s,t).length===0;
// A later correction can add another cable line; it must not move first completion.
export const closedAt=(s:M.State,t:DailyTask)=>completed(s,t)?t.functions.map(w=>documents(s,t).filter(d=>d.assignment.work===w).map(d=>d.versions[0].at).sort()[0]).sort().at(-1):undefined;
export const overdue=(s:M.State,t:DailyTask)=>!completed(s,t)&&(t.date<s.today||t.date===s.today&&s.hour>=21);

// Old accounting documents and their task IDs are deliberately left byte-for-byte intact.
// Only scheduling is migrated. Existing task rows become historical document detail.
export function migrateDaily(s:M.State):M.State{
 if(s.dailyVersion===1)return s;
 const groups=new Map<string,Duty>();
 for(const a of s.assignments){const w=s.warehouses.find(w=>w.id===a.warehouse)!;if(!a.active)continue;const key=w.owner+'|'+w.pid;
  const old=groups.get(key);groups.set(key,{id:'duty:'+w.id,employee:w.owner,pid:w.pid,functions:unique([...(old?.functions||[]),a.work]),active:true});}
 // Ambiguous pre-existing accounts require resolution, never silently select one.
 for(const d of groups.values())if(s.warehouses.filter(w=>w.owner===d.employee&&w.pid===d.pid).length!==1)throw Error('Несколько складов у одного МОЛ в одной области: '+M.person(s,d.employee));
 const dayGroups=new Map<string,DailyTask>();
 for(const t of s.tasks){const w=s.warehouses.find(w=>w.id===t.assignment.warehouse)!,id=dailyId(t.date,w.id),old=dayGroups.get(id),owner=M.assignmentOwner(s,t.assignment);
  if(old&&old.employee!==owner)throw Error('Разные ответственные в одной смене: '+id);
  const editors=t.assignment.editors||[owner,...s.replacements.filter(r=>r.active&&r.warehouse===w.id).map(r=>r.deputy)];
  if(old&&JSON.stringify([...old.editors].sort())!==JSON.stringify(unique(editors).sort()))throw Error('Различаются права на задания одной смены: '+id);
  dayGroups.set(id,{id,date:t.date,employee:owner,warehouse:w.id,pid:w.pid,functions:unique([...(old?.functions||[]),t.assignment.work]),editors:unique(editors),materials:unique([...(old?.materials||[]),t.assignment.material].filter(Boolean)),legacyTaskIds:[...(old?.legacyTaskIds||[]),t.id],restored:(old?.restored??true)&&t.source==='restored'});
 }
 const pids=s.pids.map(p=>({...p,cables:unique(s.assignments.filter(a=>s.warehouses.find(w=>w.id===a.warehouse)?.pid===p.id&&a.material).map(a=>a.material))}));
 return {...s,pids,dailyVersion:1,duties:[...groups.values()],dailyTasks:[...dayGroups.values()]};
}
export function saveDuty(s:M.State,d:Duty){
 const old=s.duties?.find(x=>x.id===d.id);
 if(old&&(old.employee!==d.employee||old.pid!==d.pid))throw Error('Создайте новое назначение для другой области работы.');
 if(!s.employees.some(e=>e.id===d.employee&&(!d.active||e.active)))throw Error('Выберите действующего сотрудника.');
 if(!dutyWarehouse(s,d))throw Error('Сначала создайте склад этого МОЛ для выбранного ПИД или без ПИД.');
 if(!d.functions.length||new Set(d.functions).size!==d.functions.length||d.functions.some(w=>!worksOrder.includes(w)||(d.pid?w==='strip':w!=='strip')))throw Error('Проверьте функции: работы на ПИД или разделка без ПИД.');
 if(s.duties?.some(x=>x.id!==d.id&&x.employee===d.employee&&x.pid===d.pid))throw Error('Назначение сотрудника в этой области уже существует.');
 return {...s,duties:old?(s.duties||[]).map(x=>x.id===d.id?d:x):[...(s.duties||[]),d]};
}
export function generateDaily(s:M.State,date:string,hour=9):M.State{
 if(hour<9||s.generated.includes(date))return {...s,today:date,hour};
 const added:DailyTask[]=[];
 for(const d of s.duties||[]){if(!d.active||!s.employees.some(e=>e.id===d.employee&&e.active))continue;const w=dutyWarehouse(s,d);if(!w)throw Error('Не найден склад для назначения.');const id=dailyId(date,w.id);if(s.dailyTasks?.some(t=>t.id===id))continue;
  added.push({id,date,employee:d.employee,warehouse:w.id,pid:d.pid,functions:[...d.functions],editors:unique([d.employee,...s.replacements.filter(r=>r.active&&r.warehouse===w.id).map(r=>r.deputy)]),materials:d.pid?[...(s.pids.find(p=>p.id===d.pid)?.cables||[])]:[],legacyTaskIds:[]});
 }
 return {...s,today:date,hour,generated:unique([...s.generated,date]),dailyTasks:[...(s.dailyTasks||[]),...added]};
}
export function taskForLine(t:DailyTask,line:Pick<DailyLine,'work'|'material'>):M.Task{return {id:t.id+'#'+line.work+':'+(line.material||'none'),date:t.date,assignment:{id:'line:'+t.id,warehouse:t.warehouse,material:line.material,work:line.work,active:true,responsible:t.employee,editors:t.editors}};}
export function saveDaily(s:M.State,input:DailySubmission,employee:string,admin=false):M.State{
 const t=s.dailyTasks?.find(t=>t.id===input.id);if(!t||(!admin&&!canFill(s,t,employee)))throw Error('Нет доступа к этому заданию.');
 if(!input.edit&&completed(s,t))throw Error('Задание уже заполнено. Исправление — через документы.');
 const previous=documents(s,t),signature=(rows:{id:string;version:number}[])=>JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)));
 if(input.edit&&(input.reason.trim().length<3||!input.expected||signature(input.expected)!==signature(previous.map(d=>({id:d.id,version:M.current(d).version})))))throw Error('Укажите причину исправления; если данные изменились, откройте документ заново.');
 const pending=input.edit?t.functions:remaining(s,t);
 if(input.mode!=='work'&&input.reason.trim().length<3)throw Error('Укажите причину выходного или простоя.');
 const lines:DailyLine[]=input.mode==='work'?input.lines:pending.map(work=>({work,material:'',qty:0}));
 if(!lines.length||lines.length>100||pending.some(work=>!lines.some(l=>l.work===work))||lines.some(l=>!pending.includes(l.work)))throw Error('Заполните каждую назначенную функцию один раз или по фактическим кабелям.');
 if(new Set(lines.map(l=>l.work+'|'+l.material)).size!==lines.length)throw Error('Один кабель в одной функции указан дважды.');
 for(const work of pending){const group=lines.filter(l=>l.work===work);if(group.length>1&&(work==='dig'||group.some(l=>l.qty===0)))throw Error('Нулевую работу указывают одной строкой на функцию.');}
 for(const l of lines){
  if(!Number.isFinite(l.qty)||l.qty<0)throw Error('Проверьте количество.');
  if(l.work==='dig'&&l.material)throw Error('Копка учитывает трассу, без кабеля.');
  if(l.work!=='dig'&&l.qty>0){if(!s.materials.some(m=>m.id===l.material&&m.kind==='cable'))throw Error('Выберите кабель.');if(t.pid&&!t.materials.includes(l.material))throw Error('Кабель не назначен этому ПИД в задании.');}
  if(l.qty===0&&input.reason.trim().length<3)throw Error('Поясните нулевой объём.');
  if(l.qty===0&&l.metals?.some(v=>v!==0))throw Error('Без разделки нельзя указать выход металлов.');
 }
 let next=structuredClone(s);
 const entries:M.Entry[]=lines.map(l=>{const old=input.edit?previous.find(d=>d.assignment.work===l.work&&d.assignment.material===l.material):undefined,task=old?next.tasks.find(x=>x.id===old.taskId)!:taskForLine(t,l);
  if(!old){if(next.tasks.some(x=>x.id===task.id))throw Error('Строка уже заполнена. Обновите данные.');next.tasks.push(task);}
  return {taskId:task.id,qty:l.qty,mode:input.mode==='work'&&l.qty===0?'idle' as const:input.mode,reason:input.reason,expected:old?M.current(old).version:0,measureId:l.measureId,confirmed:!!l.confirmed,metals:l.work==='strip'?(l.metals||[0,0,0]):undefined,crew:l.work==='strip'?input.crew:[]};});
 if(input.edit)for(const old of previous)if(!entries.some(e=>e.taskId===old.taskId))entries.push({taskId:old.taskId,qty:0,mode:'idle',reason:input.reason,expected:M.current(old).version,crew:[],metals:old.assignment.work==='strip'?[0,0,0]:undefined});
 next=M.saveDay(next,entries,admin?'admin':employee);
 next.documents=next.documents.map(d=>d.kind==='work'&&entries.some(e=>e.taskId===d.taskId)?{...d,versions:d.versions.map((v,i)=>i===d.versions.length-1?{...v,actor:employee,measure:v.measure?{...v.measure,confirmedBy:employee}:undefined}:v)}:d);
 return next;
}
