import {z} from 'zod';
import * as M from './concise-model';
import * as Daily from './daily-work';

export const periodNames={shift:'Смена',week:'Неделя',month:'Месяц'};
export type SummaryPeriod=keyof typeof periodNames;
export const summarySchema=z.object({id:z.enum(['discipline','company']),enabled:z.boolean(),recipient:z.string().max(180),hour:z.number().int().min(9).max(21),periods:z.array(z.enum(['shift','week','month'])).min(1).max(3)}).strict().superRefine((v,c)=>{
 if(v.enabled&&!v.recipient)c.addIssue({code:'custom',message:'Выберите администратора — получателя сводки.'});
 if(new Set(v.periods).size!==v.periods.length)c.addIssue({code:'custom',message:'Период указан дважды.'});
 if(v.id==='discipline'&&(v.periods.length!==1||v.periods[0]!=='shift'))c.addIssue({code:'custom',message:'Дисциплина проверяется ежедневно.'});
});
export type SummarySubscription=z.infer<typeof summarySchema>;
export const summaryNames={discipline:'Дисциплина исполнения',company:'Показатели компании'};
export const summarySubscriptions=(s:M.State):SummarySubscription[]=>Object.keys(summaryNames).map(id=>s.summarySubscriptions?.find(x=>x.id===id)||{id:id as SummarySubscription['id'],enabled:false,recipient:'',hour:9,periods:['shift']});
export type Clock={today:string;hour:number};
export const shiftDate=(date:string,days:number)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)};
export function lastCompletePeriod(period:SummaryPeriod,today:string){
 if(period==='shift'){const to=shiftDate(today,-1);return {from:to,to}}
 if(period==='week'){const monday=shiftDate(today,-((new Date(today+'T12:00:00Z').getUTCDay()+6)%7));return {from:shiftDate(monday,-7),to:shiftDate(monday,-1)}}
 const to=shiftDate(today.slice(0,8)+'01',-1);return {from:to.slice(0,8)+'01',to};
}
export function summaryWindow(period:SummaryPeriod,today:string){
 if(period==='week'&&new Date(today+'T12:00:00Z').getUTCDay()!==1)return null;
 if(period==='month'&&!today.endsWith('-01'))return null;
 return lastCompletePeriod(period,today);
}
const deadline=(date:string)=>new Date(date+'T21:00:00+07:00').getTime();
const localDate=(at:string)=>new Date(new Date(at).getTime()+7*3600000).toISOString().slice(0,10);
const days=(s:M.State)=>[...new Map((s.dailyTasks||[]).filter(t=>!t.restored).map(t=>[t.id,t])).values()];
const late=(s:M.State,t:Daily.DailyTask)=>{const at=Daily.closedAt(s,t);return !!at&&new Date(at).getTime()>deadline(t.date)};
export function disciplineSnapshot(s:M.State,clock:Clock){
 const yesterday=shiftDate(clock.today,-1),rows=new Map<string,{employee:string;open:number;closedLate:number;oldest:string}>();
 for(const t of days(s)){
  if(t.date>clock.today)continue;
  const open=!Daily.completed(s,t)&&(t.date<clock.today||clock.hour>=21),at=Daily.closedAt(s,t);
  const closedLate=!!at&&late(s,t)&&localDate(at)===yesterday;
  if(!open&&!closedLate)continue;
  const r=rows.get(t.employee)||{employee:t.employee,open:0,closedLate:0,oldest:''};
  if(open){r.open++;r.oldest=!r.oldest||t.date<r.oldest?t.date:r.oldest}if(closedLate)r.closedLate++;
  rows.set(t.employee,r);
 }
 return {yesterday,rows:[...rows.values()].sort((a,b)=>b.open-a.open||b.closedLate-a.closedLate||M.person(s,a.employee).localeCompare(M.person(s,b.employee),'ru'))};
}
export function companyMetrics(s:M.State,from:string,to:string){
 const docs=s.documents.filter((d):d is M.WorkDoc=>d.kind==='work'&&d.date>=from&&d.date<=to&&M.current(d).mode==='work');
 const total=(work:M.Work)=>M.round(docs.filter(d=>d.assignment.work===work).reduce((n,d)=>n+M.current(d).qty,0));
 const grams=docs.filter(d=>d.assignment.work==='extract').reduce((n,d)=>{const v=M.current(d);return n+Math.round(v.qty*(v.measure?.kgPerM||0)*1000)},0);
 const metals=[0,1,2].map(i=>M.round(docs.filter(d=>d.assignment.work==='strip').reduce((n,d)=>n+(M.current(d).metals?.[i]||0),0)));
 const tasks=days(s).filter(t=>t.date>=from&&t.date<=to),closed=tasks.filter(t=>Daily.completed(s,t));
 return {dig:total('dig'),extracted:total('extract'),extractedTonnes:grams/1e6,coils:total('wind'),stripped:total('strip'),metals,tasks:tasks.length,closed:closed.length,late:closed.filter(t=>late(s,t)).length,open:tasks.length-closed.length};
}
export function disciplineText(s:M.State,clock:Clock){
 const r=disciplineSnapshot(s,clock),open=r.rows.reduce((n,x)=>n+x.open,0),closed=r.rows.reduce((n,x)=>n+x.closedLate,0);
 return [`Дисциплина · ${clock.today} (Красноярск), на момент формирования`,
 `Незакрытых просроченных заданий: ${open}.`, `Сдано с опозданием за ${r.yesterday}: ${closed}.`,
 ...r.rows.map(x=>`${M.person(s,x.employee)}: просрочено ${x.open}${x.open?` (самое раннее — ${x.oldest})`:''}; сдано с опозданием ${x.closedLate}.`),
 !r.rows.length?'Нарушений по этим условиям нет.':'',
 'Учёт по ответственным: одно суточное задание по области работы. Историческая имитация исключена.'
 ].filter(Boolean).join('\n');
}
export function companyText(s:M.State,period:SummaryPeriod,from:string,to:string){
 const q=companyMetrics(s,from,to),fmt=M.fmt;
 return [`Компания · ${periodNames[period].toLowerCase()} · ${from===to?to:from+' — '+to}`,
 `Копка: ${fmt(q.dig)} м.`, `Извлечено: ${fmt(q.extracted)} м / ${fmt(q.extractedTonnes,6)} т (расчёт).`,
 `Намотано: ${fmt(q.coils,0)} катушек.`, `Разделано кабеля: ${fmt(q.stripped,6)} т.`,
 `Получено из разделки: медь ${fmt(q.metals[0],6)} т; свинец ${fmt(q.metals[1],6)} т; алюминий ${fmt(q.metals[2],6)} т.`,
 `Задания периода на момент сводки: закрыто ${q.closed} из ${q.tasks}, из них с опозданием ${q.late}; не закрыто ${q.open}.`,
 'По проведённым документам с учётом исправлений. Начальные остатки и внутренние передачи не являются выработкой. Намотка не меняет массу кабеля.'
 ].join('\n');
}
export function summaryNotifications(s:M.State,identities:{employee:string;is_admin:boolean;telegram_id:string}[],clock:Clock){
 const out:{key:string;chatId:string;text:string;recipient:string;kind:SummarySubscription['id']}[]=[];
 for(const n of s.summarySubscriptions||[]){
  if(!n.enabled||clock.hour!==n.hour||!s.employees.some(e=>e.id===n.recipient&&e.active))continue;
  const identity=identities.find(i=>i.employee===n.recipient&&i.is_admin);if(!identity)continue;
  if(n.id==='discipline')out.push({key:`summary:discipline:${clock.today}:${n.recipient}`,chatId:identity.telegram_id,recipient:n.recipient,kind:n.id,text:disciplineText(s,clock)});
  else for(const period of n.periods){const w=summaryWindow(period,clock.today);if(w)out.push({key:`summary:company:${period}:${w.to}:${n.recipient}`,chatId:identity.telegram_id,recipient:n.recipient,kind:n.id,text:companyText(s,period,w.from,w.to)})}
 }
 return out;
}
// Telegram text is bounded; keep every employee, split on lines rather than truncate.
export function notificationParts(text:string,limit=3500){const parts:string[]=[];let chunk='';for(const line of text.split('\n')){if(chunk.length+line.length+1>limit){parts.push(chunk);chunk=''}chunk+=(chunk?'\n':'')+line}if(chunk)parts.push(chunk);return parts;}
