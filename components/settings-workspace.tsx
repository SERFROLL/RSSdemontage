'use client';
import {useMemo,useState} from 'react';
import * as M from '@/lib/concise-model';
import {emptyFilter,matches,sections,settingsRows,type Filter,type Identity,type Section} from '@/lib/settings-filters';
import {SettingsPanel} from './concise-settings';
import {OperationalAccess} from './operational-access';
import {Choice,Field} from './review-common';
import {Button} from './ui/button';
import type {Update} from './concise-work';
export function SettingsWorkspace({s,update}:{s:M.State;update:Update}){
 const [active,setActive]=useState<Section>('pid'),[filters,setFilters]=useState<Partial<Record<Section,Filter>>>({}),[extra,setExtra]=useState(false),[identities,setIdentities]=useState<Identity[]>([]);
 const f=filters[active]||emptyFilter(),config=sections.find(x=>x.id===active)!;
 const all=useMemo(()=>settingsRows(s,active,identities),[s,active,identities]);
 const rows=all.filter(r=>matches(r,f)),pages=Math.max(1,Math.ceil(rows.length/25)),page=Math.min(f.page,pages-1),visible=new Set(rows.slice(page*25,page*25+25).map(r=>r.id));
 const change=(next:Partial<Filter>)=>setFilters(old=>({...old,[active]:{...f,page:0,...next}}));
 const setValue=(key:string,value:string)=>change({values:{...f.values,[key]:value}});
 const fields=extra?config.fields:config.fields.slice(0,config.primary||2);
 return <section className="settings-workspace"><h1>Настройки</h1><div className="settings-layout"><nav aria-label="Подразделы настроек">{sections.map(c=><button key={c.id} type="button" aria-current={active===c.id?'page':undefined} onClick={()=>{setActive(c.id);setExtra(false)}}>{c.name}</button>)}</nav><div className="settings-page"><h2>{config.name}</h2>
 <div className="settings-toolbar"><Field label={'Поиск в «'+config.name+'»'} type="search" value={f.query} onChange={query=>change({query})}/>{fields.map(([key,label])=><Choice key={key} label={'Отбор: '+label} value={f.values[key]||''} onChange={value=>setValue(key,value)} options={[["","Все"],...[...new Set(all.map(r=>r.values[key]).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ru')).map(v=>[v,v] as [string,string])]}/>)}{config.fields.length>(config.primary||2)&&<Button variant="outline" aria-expanded={extra} onClick={()=>setExtra(!extra)}>{extra?'Меньше отборов':'Ещё отборы'}</Button>}<Button variant="ghost" onClick={()=>setFilters(old=>({...old,[active]:emptyFilter()}))}>Сбросить</Button></div>
 <div className="settings-chips">{f.query&&<button onClick={()=>change({query:''})}>Поиск: {f.query} ×</button>}{config.fields.filter(([key])=>f.values[key]).map(([key,label])=><button key={key} onClick={()=>setValue(key,'')}>{label}: {f.values[key]} ×</button>)}</div>
 <p className="c-help" role="status">Найдено {rows.length} из {all.length}. Отбор действует только в этом подразделе.</p>{rows.length===0&&<p className="c-empty">{all.length?'По выбранным условиям записей нет. Измените или сбросьте отбор.':'Записей пока нет.'}</p>}
 {active==='access'?<OperationalAccess s={s} visible={visible} onList={setIdentities}/>:<SettingsPanel s={s} update={update} section={active} visible={visible}/>}
 {pages>1&&<div className="c-actions"><Button variant="outline" disabled={page===0} onClick={()=>change({page:page-1})}>Назад</Button><span>Страница {page+1} из {pages} · по 25 записей</span><Button variant="outline" disabled={page+1===pages} onClick={()=>change({page:page+1})}>Далее</Button></div>}
 </div></div></section>;
}
