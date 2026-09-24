'use client';
import {Fragment,useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Textarea} from './ui/textarea';
import {Choice} from './review-common';
import * as M from '@/lib/concise-model';
import {ExclusionForm} from './concise-pid';
import {MeasurementField} from './concise-measurement';
export type Update=(f:(s:M.State)=>M.State)=>Promise<void>;
type Props={s:M.State;actor:string;update:Update};
type Draft={qty:string;measureId:string;confirmed:boolean;metals:string[];crew:M.Crew[];expected:number;metalsTouched?:boolean};
export function DayCard({s,actor,update,tasks,editing=false,onSaved}:{s:M.State;actor:string;update:Update;tasks:M.Task[];editing?:boolean;onSaved?:()=>void}){
 const date=tasks[0].date;
 const [mode,setMode]=useState<M.Revision['mode']>(editing?M.current(M.taskDoc(s,tasks[0].id)!).mode:'work');
 const [reason,setReason]=useState(''),[error,setError]=useState('');
 const [draft,setDraft]=useState<Record<string,Draft>>(()=>Object.fromEntries(tasks.map(t=>{const d=M.taskDoc(s,t.id),v=d?M.current(d):undefined,m=M.measurementAt(s,t.assignment,t.date);return [t.id,{qty:v?String(v.qty):'',measureId:v?.measure?.id||m?.id||'',confirmed:false,expected:v?.version||0,metals:(v?.metals||[0,0,0]).map(String),crew:v?.crew?.length?v.crew:t.assignment.work==='strip'?(M.crewTemplates(s,t.assignment.warehouse)[0]?.members||[]).filter(id=>s.employees.some(e=>e.id===id&&e.active)).map(employee=>({employee,ktu:1})):[]}]})));
 const change=(id:string,p:Partial<Draft>)=>setDraft(d=>({...d,[id]:{...d[id],...p}}));
 const submit=async()=>{try{const entries=tasks.map(t=>{const d=draft[t.id];return {taskId:t.id,qty:mode==='work'?M.n(d.qty):0,mode,reason,expected:d.expected,measureId:d.measureId,confirmed:d.confirmed,metals:d.metals.map(M.n),crew:d.crew}});await update(st=>M.saveDay(st,entries,actor));setError('');onSaved?.();}catch(e){setError((e as Error).message)}};
 return <section className="c-day">
  <div className="c-day-title c-day-actions"><div><h3>{M.taskDateLabel(date)}</h3>{editing&&<span className="c-badge">Исправление</span>}</div><div className="c-day-modes" role="group" aria-label={'Состояние дня '+date}>{([['off','Выходной'],['idle','Простой']] as const).map(([v,t])=><button key={v} aria-pressed={mode===v} onClick={()=>setMode(mode===v?'work':v)}>{t}</button>)}</div></div>
  {mode==='work'&&[...tasks].sort((a,b)=>a.assignment.warehouse.localeCompare(b.assignment.warehouse)||a.assignment.material.localeCompare(b.assignment.material)).map((t,index,list)=>{const a=t.assignment,d=draft[t.id],old=M.taskDoc(s,t.id),v=old?M.current(old):undefined,qty=M.n(d.qty),standard=M.standardAt(s,date,a.material),norm=v?.norm||standard?.norm||[0,0,0],rate=v?.rate??standard?.rate??0,total=Number.isFinite(qty)?qty*rate:0,shares=M.payout(total,d.crew);return <Fragment key={t.id}>{(index===0||list[index-1].assignment.warehouse!==a.warehouse)&&<div className="c-task-location"><h3>{M.taskPlace(s,a.warehouse,actor,date)}</h3></div>}<div className={"c-work-line c-operation "+a.work}>
   <div className="c-line-caption">{a.material&&<b>{M.material(s,a.material)}</b>}</div>
   <label className="c-quantity"><b>{M.works[a.work].name}</b><Input aria-label={`${M.works[a.work].name} ${M.taskPlace(s,a.warehouse,actor,date)} ${date}`} inputMode="decimal" placeholder="0" value={d.qty} onChange={e=>{const q=M.n(e.target.value);change(t.id,{qty:e.target.value,...(a.work==='strip'&&!editing&&!d.metalsTouched?{metals:norm.map(x=>Number.isFinite(q)?String(M.round(q*x/100)):'')}: {})})}}/><span>{M.works[a.work].unit}</span></label>
   {a.work==='extract'&&<MeasurementField s={s} task={t} actor={actor} update={update} measureId={d.measureId} confirmed={d.confirmed} qty={qty} saved={v?.measure} onChange={(measureId,confirmed)=>change(t.id,{measureId,confirmed})}/>}
   {a.work==='strip'&&<>
    <div className="c-metal-input"><div className="c-mini-head"><span>Металлы, т</span><span>Норма</span><span>Факт</span></div>{['Медь','Свинец','Алюминий'].map((name,i)=><label className="c-mini-row" key={name}><b>{name}</b><span>{M.fmt((Number.isFinite(qty)?qty:0)*norm[i]/100)}</span><Input aria-label={name+' факт, т'} inputMode="decimal" value={d.metals[i]} onChange={e=>change(t.id,{metalsTouched:true,metals:d.metals.map((x,k)=>k===i?e.target.value:x)})}/><small>Отклонение: {M.fmt(M.n(d.metals[i])-(Number.isFinite(qty)?qty:0)*norm[i]/100)} т</small></label>)}</div>
    <p className="c-help">Расчётная разница: {M.fmt((Number.isFinite(qty)?qty:0)-d.metals.reduce((a,v)=>a+(M.n(v)||0),0))} т. Это не взвешенные отходы и не складской остаток.</p>
    <div className="c-pay"><span>Тариф {M.fmt(rate,0)} ₽/т · устанавливает администратор</span><b>Бригаде {M.fmt(total,2)} ₽</b></div>
   </>}
   {a.work==='strip'&&<details className="c-crew" open><summary>{a.work==='strip'?'Бригада и распределение оплаты':'Участники работы'} · {d.crew.length}</summary>
    {a.work==='strip'&&<Choice label="Заполнить по шаблону" value="" onChange={id=>{const tpl=s.templates.find(x=>x.id===id);if(tpl)change(t.id,{crew:tpl.members.filter(id=>s.employees.some(p=>p.id===id&&p.active)).map(employee=>({employee,ktu:1}))})}} options={[["","Выберите бригаду"],...M.crewTemplates(s,a.warehouse).map(t=>[t.id,t.name] as [string,string])]}/>}
    {d.crew.map((c,i)=><div className="c-person-row" key={c.employee}><span>{M.person(s,c.employee)}</span>{a.work==='strip'&&<><label>КТУ<Input aria-label={'КТУ '+M.person(s,c.employee)} inputMode="decimal" value={c.ktu} onChange={e=>change(t.id,{crew:d.crew.map((p,k)=>k===i?{...p,ktu:M.n(e.target.value)}:p)})}/></label><b>{M.fmt(shares[i]||0,2)} ₽<small>{M.fmt(total?100*(shares[i]||0)/total:0,1)}%</small></b></>}<button className="c-icon-button" aria-label={'Убрать '+M.person(s,c.employee)} onClick={()=>change(t.id,{crew:d.crew.filter((_,k)=>i!==k)})}>×</button></div>)}
    <Choice label="Добавить участника" value="" onChange={employee=>employee&&change(t.id,{crew:[...d.crew,{employee,ktu:1}]})} options={[["","Выберите сотрудника"],...s.employees.filter(p=>p.active&&!d.crew.some(c=>c.employee===p.id)).map(p=>[p.id,p.name] as [string,string])]}/>
   </details>}
  </div></Fragment>})}
  {(mode!=='work'||editing||tasks.some(t=>(t.assignment.work==='strip'&&draft[t.id].metals.some((value,i)=>Math.abs(M.n(value)-(M.n(draft[t.id].qty)||0)*(M.standardAt(s,date,t.assignment.material)?.norm[i]||0)/100)>.000001))||draft[t.id].qty.trim()!==''&&M.n(draft[t.id].qty)===0))&&<label className="c-field">{editing?'Причина исправления':mode==='off'?'Причина выходного':mode==='idle'?'Причина простоя':'Комментарий / причина нулевого объёма или отклонений'}<Textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Кратко поясните"/></label>}
  {error&&<p role="alert" className="c-error">{error}</p>}
  <Button className="c-primary" onClick={submit}>{editing?'Сохранить исправление':mode==='work'?'Подтвердить за день':'Закрыть с пояснением'}</Button>
 </section>
}
export function WorkPanel({s,actor,update,onTransfer,onDocument,onExclusion}:{s:M.State;actor:string;update:Update;onExclusion:()=>void;onTransfer:(id?:string)=>void;onDocument:(id:string)=>void}){
 const [tab,setTab]=useState('todo'),[all,setAll]=useState(false);
 const tasks=s.tasks.filter(t=>M.canReport(s,t.assignment,actor));
 const open=tasks.filter(t=>!M.taskDoc(s,t.id));
 const dates=[...new Set((tab==='todo'?open:tasks.filter(t=>M.taskDoc(s,t.id))).map(t=>t.date))].sort().reverse();
 const shown=all?dates:dates.slice(0,3),done=tasks.filter(t=>t.date===s.today&&M.taskDoc(s,t.id)).length,expectedToday=tasks.filter(t=>t.date===s.today).length;
 const incoming=s.documents.filter((d):d is M.Transfer=>d.kind==='transfer'&&d.items.every(i=>i.received===null)&&M.canManageWarehouse(s,d.to,actor));
 const outgoing=s.documents.filter((d):d is M.Transfer=>d.kind==='transfer'&&d.items.every(i=>i.received===null)&&M.canManageWarehouse(s,d.from,actor));
 const canSend=s.warehouses.some(w=>M.canManageWarehouse(s,w.id,actor));
 return <>
  <div className="c-heading"><div><h1>Моя работа</h1><p>{M.dateLabel(s.today)} · за сегодня {done} из {expectedToday} показателей заполнено</p></div></div>
  <div className="c-segments"><button aria-pressed={tab==='todo'} onClick={()=>setTab('todo')}>К заполнению <b>{[...new Set(open.map(t=>t.date))].length}</b></button><button aria-pressed={tab==='done'} onClick={()=>setTab('done')}>Заполненные</button></div>
  <div className="c-days">{shown.map(date=>tab==='todo'?<details className="c-task-fold" key={actor+date} open={date===s.today}><summary><b>{M.taskDateLabel(date)}</b><span>{date===s.today?"Сегодня":"Не заполнено"} · работ: {open.filter(t=>t.date===date).length}</span></summary><DayCard s={s} actor={actor} update={update} tasks={open.filter(t=>t.date===date)}/></details>:<section className="c-day" key={date}><div className="c-day-title"><h3>{M.taskDateLabel(date)}</h3><span className="c-badge">Заполнено</span></div>{tasks.filter(t=>t.date===date&&M.taskDoc(s,t.id)).map(t=>{const d=M.taskDoc(s,t.id)!;const v=M.current(d);return <button className="c-done-line" key={t.id} onClick={()=>onDocument(d.id)}><span>{M.works[t.assignment.work].name}<small>{M.taskPlace(s,t.assignment.warehouse,actor,date)} · ввёл {M.person(s,v.actor)}</small></span><b>{v.mode==='work'?M.fmt(v.qty)+' '+M.works[t.assignment.work].unit:v.mode==='off'?'Выходной':'Простой'} ›</b></button>})}</section>)}</div>
  {!dates.length&&<div className="c-empty">{tab==='todo'?'Всё заполнено. На сегодня незавершённых заданий нет.':'Заполненные задания появятся здесь.'}</div>}
  {dates.length>3&&<Button variant="outline" onClick={()=>setAll(!all)}>{all?'Показать последние дни':`Ещё ${dates.length-3} дней`}</Button>}
  {canSend&&<section className="c-occasional" aria-label="Действия по необходимости">
   <h2>По необходимости</h2>
   {s.warehouses.some(w=>w.pid&&M.canManageWarehouse(s,w.id,actor))&&<button className="c-action-tile" onClick={onExclusion}><span>Добавить информацию о неизвлекаемом участке на ПИД</span><b aria-hidden="true">＋</b></button>}
   <button className="c-action-tile" onClick={()=>onTransfer()}><span>Добавить документ перемещения материала</span><b aria-hidden="true">＋</b></button>
  </section>}
  {(incoming.length>0||outgoing.length>0)&&<section className="c-transfers"><h2>Перемещения</h2>{incoming.map(t=><button className="c-arrival" onClick={()=>onTransfer(t.id)} key={t.id}><span><b>Принять · {M.fmt(t.items.reduce((a,l)=>a+l.sent,0))} т</b><small>{M.warehouse(s,t.from)} → {M.warehouse(s,t.to)}</small></span><span>›</span></button>)}{outgoing.map(t=><button className="c-done-line" key={t.id} onClick={()=>onDocument(t.id)}><span>Ожидаю приёмку<small>{t.id} · {M.warehouse(s,t.to)}</small></span><b>{M.fmt(t.items.reduce((a,l)=>a+l.sent,0))} т ›</b></button>)}</section>}
 </>
}




