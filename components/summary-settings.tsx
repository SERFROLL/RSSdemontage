'use client';
import {useEffect,useState} from 'react';
import * as M from '@/lib/concise-model';
import {summarySchema,summarySubscriptions,summaryNames,periodNames,lastCompletePeriod,companyText,disciplineText,type SummarySubscription,type SummaryPeriod} from '@/lib/company-notifications';
import type {Identity} from '@/lib/settings-filters';
import type {Update} from './concise-work';
import {Choice} from './review-common';
import {Button} from './ui/button';

export function SummarySettings({s,update,visible}:{s:M.State;update:Update;visible?:Set<string>}){
 const [identities,setIdentities]=useState<Identity[]>([]),[delivery,setDelivery]=useState<boolean|null>(null),[loadError,setLoadError]=useState('');
 const [edit,setEdit]=useState<SummarySubscription|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[preview,setPreview]=useState('');
 useEffect(()=>{let active=true;void Promise.all([fetch('/api/operational/identities',{cache:'no-store'}).then(async r=>{const data=await r.json();if(!r.ok)throw Error(data.error||'Не удалось загрузить получателей.');return data}),fetch('/api/operational/status',{cache:'no-store'}).then(r=>r.json())]).then(([list,status])=>{if(active){setIdentities(list);setDelivery(status.notificationsEnabled)}}).catch(e=>{if(active)setLoadError(e.message)});return()=>{active=false}},[]);
 const recipients=identities.filter(i=>i.is_admin&&s.employees.some(e=>e.id===i.employee&&e.active));
 const hours:[string,string][]=Array.from({length:13},(_,i)=>[String(i+9),String(i+9).padStart(2,'0')+':00']);
 const showPreview=(period:SummaryPeriod)=>{const w=lastCompletePeriod(period,s.today);setPreview(edit?.id==='discipline'?disciplineText(s,{today:s.today,hour:s.hour}):companyText(s,period,w.from,w.to))};
 const save=async()=>{if(!edit)return;setError('');setMessage('');const parsed=summarySchema.safeParse(edit);if(!parsed.success){setError(parsed.error.issues[0].message);return}if(edit.enabled&&!recipients.some(i=>i.employee===edit.recipient)){setError('Выберите действующего администратора с Telegram.');return}setBusy(true);
  try{await update(st=>({...st,summarySubscriptions:[...(st.summarySubscriptions||[]).filter(n=>n.id!==edit.id),parsed.data]}));setEdit(null);setPreview('');setMessage('Настройки сводки сохранены. Отправка — по выбранному расписанию.')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 };
 return <div className="c-form"><p className="c-help">Личные сводки выбранному администратору. У дисциплины и показателей могут быть разные получатели. Все часы — Красноярск.</p>
 {loadError&&<p className="c-error" role="alert">{loadError}</p>}{delivery===false&&<p className="c-error" role="status">Отправка ботом отключена на сервере. Сводки можно настроить и просмотреть, но пока они не отправляются.</p>}{message&&<p role="status" className="c-success">{message}</p>}
 {summarySubscriptions(s).filter(n=>!visible||visible.has(n.id)).map(n=><section className="c-card c-form" key={n.id}><h3>{summaryNames[n.id]}</h3><p>{n.enabled?'Включена':'Выключена'} · {n.recipient?M.person(s,n.recipient):'Получатель не выбран'} · {String(n.hour).padStart(2,'0')}:00</p>
 <p className="c-help">{n.id==='discipline'?'Ежедневно: кто и сколько заданий просрочил, самое раннее незакрытое задание; отдельно — сданные с опозданием за вчера. Ответственность считается по владельцу задания, без повторов для доверенных лиц.':'Копка, извлечение в метрах и тоннах, намотка, разделка и полученные металлы; заполнение заданий периода. Показатели за всю компанию.'}</p>
 {n.id==='company'&&<p>Периоды: {n.periods.map(p=>periodNames[p]).join(', ')}</p>}
 {edit?.id!==n.id?<Button variant="outline" disabled={busy} onClick={()=>{setEdit(structuredClone(n));setPreview('');setError('');setMessage('')}}>Настроить {n.id==='discipline'?'дисциплину':'показатели'}</Button>:<div className="c-inset c-form" role="region" aria-label={'Настройка: '+summaryNames[n.id]}>
 <label className="c-check"><input type="checkbox" checked={edit.enabled} onChange={e=>setEdit({...edit,enabled:e.target.checked})}/>Отправлять сводку</label>
 <Choice label="Администратор — получатель" value={edit.recipient} onChange={recipient=>setEdit({...edit,recipient})} options={[["","Выберите администратора"],...recipients.map(i=>[i.employee,M.person(s,i.employee)] as [string,string]),...(edit.recipient&&!recipients.some(i=>i.employee===edit.recipient)?[[edit.recipient,M.person(s,edit.recipient)+' — доступ недействителен'] as [string,string]]:[])]}/>
 <Choice label="Время сводки" value={String(edit.hour)} onChange={hour=>setEdit({...edit,hour:Number(hour)})} options={hours}/>
 {n.id==='company'&&<fieldset className="c-form"><legend>За какие периоды отправлять</legend>{(Object.keys(periodNames) as SummaryPeriod[]).map(p=><label className="c-check" key={p}><input type="checkbox" checked={edit.periods.includes(p)} onChange={e=>setEdit({...edit,periods:e.target.checked?[...edit.periods,p]:edit.periods.filter(x=>x!==p)})}/>{periodNames[p]} — {p==='shift'?'каждый день за вчера':p==='week'?'по понедельникам за прошлую неделю':'1-го числа за прошлый месяц'}</label>)}</fieldset>}
 <p className="c-help">Смена — календарный день. Неделя — понедельник–воскресенье. Отчёт отправляется после окончания периода и отражает данные на момент формирования. Один вид сводки за один период не повторяется при изменении времени или перезапуске. При выборе нескольких периодов приходят отдельные сводки.</p>
 <div className="c-actions">{(n.id==='discipline'?['shift'] as SummaryPeriod[]:edit.periods).map(p=><Button key={p} variant="outline" onClick={()=>showPreview(p)}>Просмотр: {n.id==='discipline'?'дисциплина':periodNames[p].toLowerCase()}</Button>)}</div>
 {preview&&<div className="c-inset"><strong>Предпросмотр по текущим данным — без отправки</strong><p style={{whiteSpace:'pre-wrap'}}>{preview}</p></div>}
 {error&&<p className="c-error" role="alert">{error}</p>}<div className="c-actions"><Button disabled={busy} onClick={save}>{busy?'Сохранение…':'Сохранить сводку'}</Button><Button disabled={busy} variant="ghost" onClick={()=>{setEdit(null);setPreview('')}}>Отмена</Button></div>
 </div>}</section>)}
 </div>
}
