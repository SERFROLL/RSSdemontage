'use client';
import {useEffect,useState} from 'react';
import type {State} from '@/lib/concise-model';
import {Choice,Field} from './review-common';
import {Button} from './ui/button';
type Identity={employee:string;telegram_id:string;is_admin:boolean};
export function OperationalAccess({s}:{s:State}){
 const [list,setList]=useState<Identity[]>([]),[employee,setEmployee]=useState(s.employees[0]?.id||''),[telegram,setTelegram]=useState(''),[admin,setAdmin]=useState(false),[status,setStatus]=useState('');
 const load=async()=>{const r=await fetch('/api/operational/identities',{cache:'no-store'});const result=await r.json();if(!r.ok)throw Error(result.error);setList(result)};
 useEffect(()=>{void load().catch(e=>setStatus(e.message))},[]);
 return <details className="c-setting"><summary>Вход сотрудников · Telegram и WEB</summary><p className="c-help">Попросите сотрудника написать /id боту @rsskablebot и переслать числовой ID. ФИО и права относятся к одной записи сотрудника. Доверенные лица склада задаются отдельно.</p><Choice label="Сотрудник" value={employee} onChange={id=>{setEmployee(id);const i=list.find(x=>x.employee===id);setTelegram(i?.telegram_id||'');setAdmin(i?.is_admin||false)}} options={s.employees.filter(e=>e.active).map(e=>[e.id,e.name])}/><Field label="Telegram ID" value={telegram} onChange={setTelegram}/><label className="c-check"><input type="checkbox" checked={admin} onChange={e=>setAdmin(e.target.checked)}/>Администратор</label><Button onClick={async()=>{try{const r=await fetch('/api/operational/identities',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({employee,telegram_id:telegram.trim(),is_admin:admin})});const b=await r.json();if(!r.ok)throw Error(b.error);await load();setStatus('Доступ сохранён. Сотрудник может открыть приложение.')}catch(e){setStatus((e as Error).message)}}}>Сохранить доступ</Button><p role="status">{status}</p><div className="c-table-scroll"><table className="c-table"><thead><tr><th>Сотрудник</th><th>Telegram ID</th><th>Права</th></tr></thead><tbody>{list.map(i=><tr key={i.employee}><td>{s.employees.find(e=>e.id===i.employee)?.name}</td><td>{i.telegram_id}</td><td>{i.is_admin?'Администратор':'По складам и заданиям'}</td></tr>)}</tbody></table></div><a href="/api/operational/backup" download>Скачать резервную копию учёта</a></details>;
}
