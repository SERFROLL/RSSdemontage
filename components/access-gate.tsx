'use client';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
export function AccessGate({onGranted}:{onGranted:()=>void}){
 const [status,setStatus]=useState('loading'),[name,setName]=useState(''),[editing,setEditing]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const api=async(body?:unknown)=>{const r=await fetch('/api/operational/access',{cache:'no-store',headers:{'x-telegram-init-data':window.Telegram?.WebApp.initData||'','Content-Type':'application/json'},...(body?{method:'POST',body:JSON.stringify(body)}:{})});const b=await r.json();if(!r.ok)throw Error(b.error);return b;};
 useEffect(()=>{let active=true;const load=async()=>{try{const r=await api();if(!active)return;setStatus(r.status);setName(n=>n||r.name||r.suggestedName||'');if(r.status==='approved')onGranted();}catch(e){if(active)setError((e as Error).message)}};void load();const timer=setInterval(load,15000);return()=>{active=false;clearInterval(timer)}},[]);
 return <main className="c-review production tg"><section className="c-card c-form"><h1>Учёт кабеля</h1>{status==='pending'?<p role="status">Запрос отправлен. Ожидайте решения администратора.</p>:status==='disabled'?<p>Доступ отключён. Обратитесь к администратору.</p>:status==='loading'?<p>Проверяем доступ…</p>:<><p>Доступ к просмотру статистики предоставляет администратор.</p>{editing&&<label className="c-field">Имя и фамилия<Input value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></label>}<Button disabled={busy} onClick={async()=>{if(!editing){setEditing(true);return;}setBusy(true);try{const r=await api({action:'request',name});setStatus(r.status);setError('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}>{editing?'Отправить запрос':'Запросить доступ'}</Button></>}{error&&<p className="c-error" role="alert">{error}</p>}</section></main>;
}
