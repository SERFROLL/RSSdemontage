import {z} from 'zod';
import type {Employee,State} from './concise-model';
import * as Daily from './daily-work';

export const notificationSchema=z.object({
 newTasks:z.boolean(),current:z.boolean(),overdue:z.boolean(),
 hours:z.array(z.number().int().min(9).max(21)).min(1).max(2)
  .refine(hours=>new Set(hours).size===hours.length,'Выберите разное время напоминаний.')
}).strict();
export type NotificationSettings=z.infer<typeof notificationSchema>;
// Preserve the existing schedule until an administrator explicitly changes it.
export const notificationSettings=(employee:Employee):NotificationSettings=>employee.notifications||{newTasks:false,current:true,overdue:false,hours:[19,20]};
export const notificationSummary=(n:NotificationSettings)=>[
 n.newTasks?'Новые в 09:00':'',n.current?'Текущие':'',n.overdue?'Просроченные':''
].filter(Boolean).join(' · ')||'Выключены';

export function taskNotification(s:State,employee:string,clock:{today:string;hour:number}){
 const person=s.employees.find(e=>e.id===employee&&e.active);if(!person)return null;
 const n=notificationSettings(person),atReminder=n.hours.includes(clock.hour);
 const current=(n.newTasks&&clock.hour===9)||(n.current&&atReminder);
 const overdue=n.overdue&&atReminder;
 if(!current&&!overdue)return null;
 // Shared tasks count once, and reconstructed historical tasks are never chased.
 const pending=[...new Map((s.dailyTasks||[]).filter(t=>!t.restored&&Daily.canFill(s,t,employee)&&!Daily.completed(s,t)).map(t=>[t.id,t])).values()];
 const selected=pending.filter(t=>t.date===clock.today&&clock.hour<21?current:
  (t.date<clock.today||t.date===clock.today&&clock.hour>=21)&&overdue);
 if(!selected.length)return null;
 const today=selected.filter(t=>t.date===clock.today&&clock.hour<21).length,late=selected.length-today;
 const text=['Заполните задания.',today?`За сегодня: ${today}. Срок — 21:00.`:'',late?`Просроченных: ${late}.`:'',
  `Всего в этом напоминании: ${selected.length}.`,
  'Если работа не выполнялась, укажите выходной или простой и причину в задании.'
 ].filter(Boolean).join('\n');
 // One delivery per person/hour, even if settings change or several types coincide.
 return {key:`operational:${clock.today}:${clock.hour}:${employee}`,text,taskIds:selected.map(t=>t.id)};
}
