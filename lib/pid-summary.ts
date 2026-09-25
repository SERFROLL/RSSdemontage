import * as M from './concise-model';
import type {BalanceQuery} from './concise-balance';

// Responsibility is the owner of the field warehouse, not the person who typed the report.
export function pidForemen(s:M.State,pid:string,from:string,to:string,inScope:(id:string)=>boolean=()=>true,materials:string[]|null=null,actor=''){
 const warehouses=s.warehouses.filter(w=>w.pid===pid&&w.kind==='field'&&inScope(w.id));
 const cableIds=s.materials.filter(m=>m.kind==='cable'&&(materials===null||materials.includes(m.id))).map(m=>m.id);
 return [...new Set(warehouses.map(w=>w.owner))].map(employee=>{
  const ids=new Set(warehouses.filter(w=>w.owner===employee).map(w=>w.id));
  const digDocs=s.documents.filter((d):d is M.WorkDoc=>d.kind==='work'&&d.assignment.work==='dig'&&ids.has(d.assignment.warehouse)&&d.date>=from&&d.date<=to&&M.current(d).mode==='work');
  const query:BalanceQuery={scope:'owners',owners:[employee],pids:[pid],actor,material:'',materials:cableIds,from,to,unit:'tonnes',column:'after'};
  return {employee,dig:M.round(digDocs.reduce((n,d)=>n+M.current(d).qty,0)),digIds:digDocs.map(d=>d.id),extracted:{...query,column:'plus',operation:'extract'} as BalanceQuery,sent:{...query,column:'minus',operation:'dispatch'} as BalanceQuery,stock:query};
 });
}

// Remaining route is company-wide: selecting one foreman must not reopen a completed PID.
export function visiblePid(s:M.State,pid:string,from:string,to:string,inScope:(id:string)=>boolean,motion:boolean,stock:boolean){
 if(!motion&&!stock)return true;
 const p=M.pidProgress(s,pid,from,to,inScope),whole=M.pidProgress(s,pid,from,to);
 const unknownOrExceeded=whole.length===null||whole.total>whole.length;
 return motion&&p.period!==0||stock&&(unknownOrExceeded||whole.total<whole.length!);
}
