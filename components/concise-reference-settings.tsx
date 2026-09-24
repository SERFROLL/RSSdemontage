'use client';
import {useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Choice,Field} from './review-common';
import type {Update} from './concise-work';
import * as M from '@/lib/concise-model';

export function MeasurementSettings({s,update}:{s:M.State;update:Update}){
 const [pid,setPid]=useState(s.pids[0]?.id||''),[cable,setCable]=useState(s.materials.find(m=>m.kind==='cable')?.id||''),[date,setDate]=useState(s.today),[grams,setGrams]=useState(''),[confirmer,setConfirmer]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const save=async()=>{try{const gPerM=M.n(grams);if(!Number.isFinite(gPerM)||gPerM<=0||!pid||!date||date>s.today||!s.employees.some(e=>e.id===confirmer&&e.active))throw Error('Укажите ПИД, дату не позже сегодня, положительное значение г/м и подтвердившего сотрудника.');
  await update(st=>({...st,measurements:[...st.measurements,{id:'УМ-'+crypto.randomUUID().slice(0,8),pid,material:cable,date,gPerM,author:confirmer,confirmed:true}]}));setError('');setMessage('Удельная масса сохранена. Существующие документы не пересчитаны.');setGrams('');
 }catch(e){setError((e as Error).message)}};
 return <details className="c-setting"><summary>Удельная масса · г/м</summary><p className="c-help">Последнее подтверждённое значение по ПИД и кабелю предлагается в задании на извлечение. Оно фиксируется в отчёте.</p>
 {s.measurements.map(m=><div className="c-total-line" key={m.id}><span>ПИД{m.pid} · {M.material(s,m.material)}<small>{M.dateLabel(m.date)} · подтвердил {M.person(s,m.author)}</small></span><b>{M.fmt(M.measurementGrams(m))} г/м</b></div>)}
 <div className="c-inset c-form"><div className="c-grid-two"><Choice label="ПИД" value={pid} onChange={setPid} options={M.pidCatalog(s).map(p=>[p.id,'ПИД'+p.id])}/><Choice label="Кабель" value={cable} onChange={setCable} options={s.materials.filter(m=>m.kind==='cable').map(m=>[m.id,m.name])}/></div>
 <Field label="Дата измерения" type="date" value={date} onChange={setDate}/><Field label="Удельная масса, г/м" value={grams} onChange={setGrams}/><Choice label="Кто подтвердил" value={confirmer} onChange={setConfirmer} options={[["","Выберите сотрудника"],...s.employees.filter(e=>e.active).map(e=>[e.id,e.name] as [string,string])]}/>
 {error&&<p className="c-error" role="alert">{error}</p>}{message&&<p className="c-success" role="status">{message}</p>}<Button onClick={save}>Сохранить удельную массу</Button></div></details>
}

type Template=M.State['templates'][number];
export function CrewSettings({s,update}:{s:M.State;update:Update}){
 const [template,setTemplate]=useState<Template|null>(null),[employeeFilter,setEmployeeFilter]=useState(''),[crewFilter,setCrewFilter]=useState(''),[search,setSearch]=useState(''),[error,setError]=useState('');
 const save=async()=>{if(!template)return;try{if(!template.name.trim()||!template.warehouse||!template.members.length)throw Error('Укажите название бригады, склад мастера и состав.');
  await update(st=>({...st,templates:[...st.templates.filter(t=>t.id!==template.id),{...template,members:[...new Set(template.members)],name:template.name.trim()}]}));setTemplate(null);setError('');
 }catch(e){setError((e as Error).message)}};
 const crews=s.templates.filter(t=>(!crewFilter||t.id===crewFilter)&&(!employeeFilter||t.members.includes(employeeFilter)));
 return <section className="c-form"><h3>Шаблоны бригад разделки</h3><div className="c-grid-two"><Choice label="Проверить по сотруднику" value={employeeFilter} onChange={setEmployeeFilter} options={[["","Все сотрудники"],...s.employees.map(e=>[e.id,e.name] as [string,string])]}/><Choice label="Проверить по бригаде" value={crewFilter} onChange={setCrewFilter} options={[["","Все бригады"],...s.templates.map(t=>[t.id,t.name] as [string,string])]}/></div>
 {crews.map(t=><div className="c-card" key={t.id}><button className="c-done-line" onClick={()=>{setTemplate(structuredClone(t));setSearch('')}}><span><b>{t.name}</b><small>{t.warehouse?M.warehouse(s,t.warehouse):'Склад не назначен'} · {t.active===false?'Отключена':'Действует'}</small></span><b>Изменить ›</b></button><p>{t.members.map(id=>M.person(s,id)+(s.employees.find(e=>e.id===id)?.active?'':' (не работает)')).join(', ')}</p></div>)}
 {!crews.length&&<p className="c-empty">Нет сочетаний по выбранным условиям.</p>}
 <Button variant="outline" onClick={()=>{setTemplate({id:'Б-'+crypto.randomUUID().slice(0,8),name:'',warehouse:'',active:true,members:[]});setSearch('')}}>＋ Шаблон бригады</Button>
 {template&&<div className="c-inset c-form"><Field label="Название бригады" value={template.name} onChange={name=>setTemplate({...template,name})}/><Choice label="Склад мастера" value={template.warehouse||''} onChange={warehouse=>setTemplate({...template,warehouse})} options={[["","Выберите склад"],...s.warehouses.map(w=>[w.id,M.warehouse(s,w.id)] as [string,string])]}/>
 <label className="c-check"><input type="checkbox" checked={template.active!==false} onChange={e=>setTemplate({...template,active:e.target.checked})}/>Использовать для новых смен</label>
 <Input aria-label="Найти участника бригады" placeholder="Поиск сотрудника" value={search} onChange={e=>setSearch(e.target.value)}/>
 <div className="c-employee-list">{s.employees.filter(p=>(p.active||template.members.includes(p.id))&&p.name.toLowerCase().includes(search.toLowerCase())).map(p=><label className="c-check" key={p.id}><input type="checkbox" checked={template.members.includes(p.id)} onChange={e=>setTemplate({...template,members:e.target.checked?[...new Set([...template.members,p.id])]:template.members.filter(id=>id!==p.id)})}/>{p.name}{!p.active?' · не работает':''}</label>)}</div>
 <p className="c-help">В смену попадут только работающие сотрудники. Состав смены и КТУ мастер может изменить. Сотрудник может входить в несколько шаблонов.</p>
 {error&&<p className="c-error" role="alert">{error}</p>}<div className="c-actions"><Button onClick={save}>Сохранить шаблон</Button><Button variant="outline" onClick={()=>setTemplate(null)}>Отмена</Button></div></div>}</section>
}
