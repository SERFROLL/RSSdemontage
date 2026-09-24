'use client';
import {useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {Choice,Field} from './review-common';
import type {Update} from './concise-work';
import * as M from '@/lib/concise-model';

export function MeasurementField({s,task,actor,update,measureId,confirmed,qty,saved,onChange}:{
 s:M.State;task:M.Task;actor:string;update:Update;measureId:string;confirmed:boolean;qty:number;saved?:M.Snapshot;
 onChange:(id:string,confirmed:boolean)=>void;
}){
 const [open,setOpen]=useState(false),[createNew,setCreateNew]=useState(false),[selection,setSelection]=useState(measureId);
 const [date,setDate]=useState(task.date),[grams,setGrams]=useState(''),[error,setError]=useState('');
 const a=task.assignment,w=s.warehouses.find(w=>w.id===a.warehouse)!,record=s.measurements.find(x=>x.id===measureId);
 const frozen=saved?.id===measureId?saved:undefined;
 const coefficient=frozen?M.round(frozen.kgPerM*1000):record?M.measurementGrams(record):0;
 const sourceDate=frozen?.date||record?.date,confirmer=record?.author||frozen?.confirmedBy;
 const eligible=M.eligibleMeasurements(s,a,task.date);
 const options: [string,string][]=[['','Выберите значение'],...eligible.map(m=>[m.id,M.fmt(M.measurementGrams(m))+' г/м · '+M.dateLabel(m.date)+' · '+M.person(s,m.author)] as [string,string])];
 if(saved&&!eligible.some(m=>m.id===saved.id))options.push([saved.id,M.fmt(saved.kgPerM*1000)+' г/м · сохранено в документе']);
 const begin=()=>{setOpen(true);setCreateNew(!coefficient);setSelection(measureId);setError('');onChange(measureId,false)};
 const choose=()=>{if(!selection){setError('Выберите удельную массу.');return;}onChange(selection,false);setOpen(false)};
 const create=async()=>{try{
  const item:M.Measurement={id:'УМ-'+crypto.randomUUID().slice(0,8),pid:w.pid,material:a.material,date,gPerM:M.n(grams),author:actor,confirmed:true};
  await update(st=>M.addTaskMeasurement(st,task.id,item,actor));onChange(item.id,true);setOpen(false);setError('');
 }catch(e){setError((e as Error).message)}};
 return <div className="c-measure-wrap">
  <div className="c-measure">
   <div><span className="c-coefficient-label">{M.material(s,a.material)} · <strong>{coefficient?M.fmt(coefficient)+' г/м':'удельная масса не задана'}</strong></span>
    <span>{sourceDate?M.dateLabel(sourceDate)+' · подтвердил '+M.person(s,confirmer||''):'Укажите коэффициент для этого ПИД и кабеля.'}</span></div>
   <strong>{M.fmt(Number.isFinite(qty)?qty*coefficient/1_000_000:0)} т<small>расчётный приход</small></strong>
   <label className="c-check"><input type="checkbox" checked={confirmed} disabled={!coefficient||open} onChange={e=>onChange(measureId,e.target.checked)}/>Подтверждаю {coefficient?M.fmt(coefficient):'—'} г/м</label>
   <button type="button" className="c-text-button" onClick={begin}>{coefficient?'Выбрать другое или ввести новое значение':'Указать удельную массу'}</button>
  </div>
  {open&&<div className="c-measure-editor">
   <b>{M.material(s,a.material)} · ПИД{w.pid}</b>
   <div className="c-segments"><button aria-pressed={!createNew} onClick={()=>{setCreateNew(false);setError('')}}>Из сохранённых</button><button aria-pressed={createNew} onClick={()=>{setCreateNew(true);setError('')}}>Новое значение</button></div>
   {createNew?<>
    <Field label="Дата измерения" type="date" value={date} onChange={setDate}/>
    <label className="c-field">Удельная масса, г/м<Input aria-label="Удельная масса, г/м" inputMode="decimal" placeholder="Например, 5200" value={grams} onChange={e=>setGrams(e.target.value)}/></label>
    <p className="c-help">Подтвердит: <b>{M.person(s,actor)}</b>. Сохранённые отчёты не пересчитаются.</p>
   </>:<Choice label="Подтверждённая удельная масса" value={selection} onChange={setSelection} options={options}/>}
   {error&&<p className="c-error" role="alert">{error}</p>}
   <div className="c-actions"><Button variant="outline" onClick={()=>{setOpen(false);setError('')}}>Отмена</Button><Button onClick={createNew?create:choose}>{createNew?'Подтвердить и применить':'Выбрать'}</Button></div>
  </div>}
 </div>
}
