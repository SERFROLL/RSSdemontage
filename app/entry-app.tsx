'use client';
import {useEffect,useState} from 'react';
import CableApp from './cable-app';
import OperationalApp from './operational-app';
export default function EntryApp(){const [mode,setMode]=useState<boolean|null>(null);useEffect(()=>{fetch('/api/operational/status',{cache:'no-store'}).then(r=>r.json()).then(r=>setMode(r.operational)).catch(()=>setMode(false))},[]);return mode===null?<p style={{padding:24}}>Загружаем учёт кабеля…</p>:mode?<OperationalApp/>:<CableApp/>}
