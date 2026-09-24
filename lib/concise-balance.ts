import * as M from './concise-model';
import {coilMovements} from './concise-coils';

export type BalanceColumn='before'|'plus'|'minus'|'after';
export type BalanceQuery={scope:string;actor:string;material:string;unit:'tonnes'|'coils';from:string;to:string;column:BalanceColumn};
export type BalanceContribution={docId:string;quantity:number;dates:string[]};
export const columnLabels={before:'Было',plus:'Приход',minus:'Расход',after:'Стало'};
export const balanceUnit=(q:Pick<BalanceQuery,'unit'>)=>q.unit==='coils'?'шт.':'т';
export const balanceFormat=(value:number,q:Pick<BalanceQuery,'unit'>)=>M.fmt(value,q.unit==='coils'?0:6);
export function inBalanceScope(s:M.State,scope:string,actor:string,w:string){return scope==='all'||scope==='mine'&&M.canManageWarehouse(s,w,actor)||scope.startsWith('pid:')&&s.warehouses.some(x=>x.id===w&&x.pid===scope.slice(4))||w===scope;}
export function balanceScopeLabel(s:M.State,q:BalanceQuery){return q.scope==='all'?'Вся компания':q.scope==='mine'?'Мои склады · '+M.person(s,q.actor):q.scope.startsWith('pid:')?'ПИД'+q.scope.slice(4):M.warehouse(s,q.scope);}
export function balanceDateLabel(q:BalanceQuery){const date=(v:string)=>new Date(v+'T12:00:00Z').toLocaleDateString('ru-RU');return q.column==='before'?'До '+date(q.from)+' (не включая)':q.column==='after'?'По '+date(q.to)+' включительно':date(q.from)+' — '+date(q.to);}
export function balanceTitle(s:M.State,q:BalanceQuery){return M.material(s,q.material)+(q.unit==='coils'?' · катушки':'')+' · '+columnLabels[q.column];}

// Both the displayed figure and its drilldown are derived from this same query.
export function balanceCell(s:M.State,q:BalanceQuery){
 const raw=(q.unit==='coils'?coilMovements(s):M.movements(s)).filter(m=>m.material===q.material&&m.date<=q.to&&inBalanceScope(s,q.scope,q.actor,m.warehouse));
 // Across the whole company, paired internal entries cancel before sign selection.
 const scoped=q.scope==='all'?Object.values(raw.reduce((out,m)=>{const key=m.docId+'|'+m.date;out[key]=out[key]?{...m,qty:M.round(out[key].qty+m.qty)}:{...m};return out;},{} as Record<string,{date:string;docId:string;qty:number}>)):raw;
 // Keep receipts and dispatches separate for a warehouse/transit turnover.
 const selected=scoped.filter(m=>m.qty!==0&&(q.column==='before'?m.date<q.from:q.column==='after'?true:m.date>=q.from&&(q.column==='plus'?m.qty>0:m.qty<0)));
 const grouped:Record<string,BalanceContribution>={};
 for(const m of selected){const row=grouped[m.docId]||(grouped[m.docId]={docId:m.docId,quantity:0,dates:[]});row.quantity=M.round(row.quantity+(q.column==='minus'?-m.qty:m.qty));if(!row.dates.includes(m.date))row.dates.push(m.date);}
 const contributions=Object.values(grouped).filter(r=>r.quantity!==0).map(r=>({...r,dates:r.dates.sort()})).sort((a,b)=>b.dates.at(-1)!.localeCompare(a.dates.at(-1)!));
 return {value:M.round(contributions.reduce((sum,r)=>sum+r.quantity,0)),contributions,ids:contributions.map(r=>r.docId)};
}
