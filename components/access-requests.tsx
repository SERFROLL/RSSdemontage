'use client';
import {useEffect,useState} from 'react';
import {Button} from './ui/button';
import {Choice} from './review-common';
import type {State} from '@/lib/concise-model';
type RequestRow={id:string;name:string;username:string};
export function AccessRequests({s,identities,onChange}:{s:State;identities:{employee:string}[];onChange:()=>Promise<unknown>}){
 const [requests,setRequests]=useState<RequestRow[]>([]),[links,setLinks]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const api=async(body?:unknown)=>{const r=await fetch('/api/operational/access',{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const b=await r.json();if(!r.ok)throw Error(b.error);return b;};
 const load=async()=>setRequests(await api());
 useEffect(()=>{void load().catch(e=>setStatus(e.message))},[]);
 return <section className="c-card"><h3>Заявки на просмотр статистики</h3><p className="c-help">Telegram ID определяется автоматически. Одобрение даёт только просмотр статистики в TG и на сайте. Если сотрудник уже есть, выберите его ниже.</p><Button variant="outline" disabled={busy} onClick={()=>void load().catch(e=>setStatus(e.message))}>Обновить заявки</Button>{!requests.length&&<p>Новых заявок нет.</p>}{requests.map(r=><div key={r.id} className="c-inset c-form"><b>{r.name}{r.username?' · @'+r.username:''}</b><Choice label="Связать с сотрудником" value={links[r.id]||''} onChange={v=>setLinks({...links,[r.id]:v})} options={[["","Создать нового наблюдателя"],...s.employees.filter(e=>e.active&&!identities.some(i=>i.employee===e.id)).map(e=>[e.id,e.name] as [string,string])]}/><div className="c-actions">{(['approve','reject'] as const).map(action=><Button key={action} disabled={busy} variant={action==='approve'?'default':'outline'} onClick={async()=>{setBusy(true);try{await api({action,id:r.id,employee:links[r.id]||undefined});await load();await onChange();setStatus(action==='approve'?'Предоставлен просмотр статистики.':'Заявка отклонена.')}catch(e){setStatus((e as Error).message)}finally{setBusy(false)}}}>{action==='approve'?'Разрешить просмотр':'Отклонить'}</Button>)}</div></div>)}<p role="status">{status}</p></section>;
}
