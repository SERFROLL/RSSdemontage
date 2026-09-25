import * as M from './concise-model';
import {coilMovements} from './concise-coils';
import {personalWarehouses} from './stats-filters';

export type BalanceColumn='before'|'plus'|'minus'|'after';
export type BalanceQuery={scope:string;actor:string;owners?:string[];pids?:string[];material:string;materials?:string[];operation?:'extract'|'dispatch';unit:'tonnes'|'coils';from:string;to:string;column:BalanceColumn};
export type BalanceContribution={docId:string;quantity:number;dates:string[]};
export const columnLabels={before:'Было',plus:'Приход',minus:'Расход',after:'Стало'};
export const balanceUnit=(q:Pick<BalanceQuery,'unit'>)=>q.unit==='coils'?'шт.':'т';
export const balanceFormat=(value:number,q:Pick<BalanceQuery,'unit'>)=>M.fmt(value,q.unit==='coils'?0:6);
export function inBalanceScope(s:M.State,scope:string,actor:string,w:string){return scope==='all'||scope==='mine'&&personalWarehouses(s,actor).includes(w)||scope.startsWith('pid:')&&s.warehouses.some(x=>x.id===w&&x.pid===scope.slice(4))||w===scope;}
export function inBalanceQuery(s:M.State,q:Pick<BalanceQuery,'scope'|'actor'|'owners'|'pids'>,id:string){const w=s.warehouses.find(w=>w.id===id);return (q.scope==='owners'?!!w&&(q.owners||[]).includes(w.owner):inBalanceScope(s,q.scope,q.actor,id))&&(q.pids===undefined||!!w&&q.pids.includes(w.pid));}
export function balanceScopeLabel(s:M.State,q:BalanceQuery){const label=q.scope==='owners'?'Склады: '+(q.owners||[]).map(id=>M.person(s,id)).join(', '):q.scope==='all'?'Вся компания':q.scope==='mine'?'Мои склады · '+M.person(s,q.actor):q.scope.startsWith('pid:')?'ПИД'+q.scope.slice(4):M.warehouse(s,q.scope);return label+(q.pids?' · ПИД: '+q.pids.join(', '):'');}
export function balanceDateLabel(q:BalanceQuery){const date=(v:string)=>new Date(v+'T12:00:00Z').toLocaleDateString('ru-RU');return q.column==='before'?'До '+date(q.from)+' (не включая)':q.column==='after'?'По '+date(q.to)+' включительно':date(q.from)+' — '+date(q.to);}
export const balanceMaterialLabel=(s:M.State,q:BalanceQuery)=>q.materials?'Кабель · суммарная масса':M.material(s,q.material);
export const balanceColumnLabel=(q:BalanceQuery)=>q.operation==='extract'?'Извлечено':q.operation==='dispatch'?'Отправлено':columnLabels[q.column];
export function balanceTitle(s:M.State,q:BalanceQuery){return balanceMaterialLabel(s,q)+(q.unit==='coils'?' · катушки':'')+' · '+balanceColumnLabel(q);}

// Both the displayed figure and its drilldown are derived from this same query.
export function balanceCell(s:M.State,q:BalanceQuery){
 const operationDocs=q.operation?new Set(s.documents.filter(d=>q.operation==='extract'?d.kind==='work'&&d.assignment.work==='extract':d.kind==='transfer').map(d=>d.id)):null;
 const raw=(q.unit==='coils'?coilMovements(s):M.movements(s)).filter(m=>(q.materials?q.materials.includes(m.material):m.material===q.material)&&m.date<=q.to&&inBalanceQuery(s,q,m.warehouse)&&(!operationDocs||operationDocs.has(m.docId))&&(q.operation!=='dispatch'||m.qty<0));
 // Paired entries inside the selected warehouse group cancel before sign selection.
 const scoped=Object.values(raw.reduce((out,m)=>{const key=m.docId+'|'+m.date;out[key]=out[key]?{...m,qty:M.round(out[key].qty+m.qty)}:{...m};return out;},{} as Record<string,{date:string;docId:string;qty:number}>));
 // Only movement across the group's boundary contributes to its turnover.
 const selected=scoped.filter(m=>m.qty!==0&&(q.column==='before'?m.date<q.from:q.column==='after'?true:m.date>=q.from&&(q.column==='plus'?m.qty>0:m.qty<0)));
 const grouped:Record<string,BalanceContribution>={};
 for(const m of selected){const row=grouped[m.docId]||(grouped[m.docId]={docId:m.docId,quantity:0,dates:[]});row.quantity=M.round(row.quantity+(q.column==='minus'?-m.qty:m.qty));if(!row.dates.includes(m.date))row.dates.push(m.date);}
 const contributions=Object.values(grouped).filter(r=>r.quantity!==0).map(r=>({...r,dates:r.dates.sort()})).sort((a,b)=>b.dates.at(-1)!.localeCompare(a.dates.at(-1)!));
 return {value:M.round(contributions.reduce((sum,r)=>sum+r.quantity,0)),contributions,ids:contributions.map(r=>r.docId)};
}
