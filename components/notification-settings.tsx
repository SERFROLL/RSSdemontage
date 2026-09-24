'use client';
import {Fragment,useState} from 'react';
import type {State} from '@/lib/concise-model';
import {notificationSettings,notificationSchema,notificationSummary,type NotificationSettings as Preferences} from '@/lib/task-notifications';
import type {Update} from './concise-work';
import {Choice} from './review-common';
import {Button} from './ui/button';

export function NotificationSettings({s,update,visible}:{s:State;update:Update;visible?:Set<string>}){
 const [edit,setEdit]=useState<{employee:string;value:Preferences}|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[saving,setSaving]=useState(false);
 const hours:[string,string][]=Array.from({length:13},(_,i)=>[String(i+9),String(i+9).padStart(2,'0')+':00']);
 const set=(patch:Partial<Preferences>)=>{if(edit)setEdit({...edit,value:{...edit.value,...patch}})};
 const save=async()=>{if(!edit)return;setError('');setMessage('');const parsed=notificationSchema.safeParse(edit.value);if(!parsed.success){setError(parsed.error.issues[0].message);return;}setSaving(true);
  try{await update(st=>({...st,employees:st.employees.map(e=>e.id===edit.employee?{...e,notifications:{...parsed.data,hours:[...parsed.data.hours].sort((a,b)=>a-b)}}:e)}));setEdit(null);setMessage('Настройки сохранены. Они применяются к следующим отправкам.');}
  catch(e){setError((e as Error).message)}finally{setSaving(false)}
 };
 return <div className="c-form"><p className="c-help">Личные сообщения от бота по доступным сотруднику заданиям. Для дисциплинированного сотрудника можно оставить только просрочки. Все часы — Красноярск.</p>
 <p className="c-help">Сотрудник должен быть привязан в «Доступ TG / WEB» и нажать «Запустить» в @rsskablebot. Неработающим сотрудникам сообщения не отправляются.</p>
 {message&&<p role="status" className="c-success">{message}</p>}
 <div className="c-table-scroll"><table className="c-table"><thead><tr><th>Сотрудник</th><th>Что отправлять</th><th>Когда напоминать</th><th>Настройка</th></tr></thead><tbody>{s.employees.filter(e=>!visible||visible.has(e.id)).map(e=>{const n=notificationSettings(e);return <Fragment key={e.id}><tr><td>{e.name}{!e.active&&<small>Не работает — отправка отключена</small>}</td><td>{notificationSummary(n)}</td><td>{n.current||n.overdue?n.hours.map(h=>String(h).padStart(2,'0')+':00').join(', '):'—'}</td><td><button className="c-text-button" aria-label={'Уведомления: '+e.name} disabled={saving} onClick={()=>{setEdit({employee:e.id,value:structuredClone(n)});setError('');setMessage('')}}>Изменить</button></td></tr>
 {edit?.employee===e.id&&<tr><td colSpan={4}><div className="c-inset c-form" role="region" aria-label={'Уведомления для '+e.name}>
 <h3>{e.name}</h3>
 <label className="c-check"><input type="checkbox" checked={edit.value.newTasks} onChange={e=>set({newTasks:e.target.checked})}/>Новые задания — в 09:00</label>
 <label className="c-check"><input type="checkbox" checked={edit.value.current} onChange={e=>set({current:e.target.checked})}/>Незакрытые задания за сегодня — до срока сдачи</label>
 <label className="c-check"><input type="checkbox" checked={edit.value.overdue} onChange={e=>set({overdue:e.target.checked})}/>Просроченные задания — включая сегодняшний день после 21:00</label>
 {(edit.value.current||edit.value.overdue)&&<><Choice label="Частота напоминаний" value={String(edit.value.hours.length)} onChange={v=>set({hours:v==='1'?[edit.value.hours[0]]:[edit.value.hours[0],edit.value.hours[0]===20?19:20]})} options={[["1","Один раз в день"],["2","Два раза в день"]]}/><div className="c-grid-two">{edit.value.hours.map((h,i)=><Choice key={i} label={i?'Второе напоминание':'Первое напоминание'} value={String(h)} onChange={v=>set({hours:edit.value.hours.map((x,k)=>k===i?Number(v):x)})} options={hours}/>)}</div><p className="c-help">После 21:00 сегодняшнее задание считается просроченным: для напоминания в 21:00 включите «Просроченные задания».</p></>}
 <p className="c-help">В одно время приходит одно общее сообщение с количеством заданий. Заполненные задания не напоминаются. Не более двух напоминаний в день, плюс сообщение о новых заданиях, если оно включено. Чтобы отключить всё, снимите три галочки.</p>
 <div className="c-inset"><strong>Пример сообщения</strong><p>Заполните задания.<br/>{(edit.value.current||edit.value.newTasks)&&<>За сегодня: 1. Срок — 21:00.<br/></>}{edit.value.overdue&&<>Просроченных: 2.<br/></>}Мои задания →</p><small>Количество рассчитывается при отправке; если подходящих заданий нет, сообщения не будет.</small></div>
 {error&&<p role="alert" className="c-error">{error}</p>}<div className="c-actions"><Button disabled={saving} onClick={save}>{saving?'Сохранение…':'Сохранить уведомления'}</Button><Button variant="ghost" disabled={saving} onClick={()=>setEdit(null)}>Отмена</Button></div>
 </div></td></tr>}</Fragment>})}</tbody></table></div></div>
}
