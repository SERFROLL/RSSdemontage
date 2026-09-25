import * as M from './concise-model';

// Observation scope follows real responsibilities, never administrator privileges.
export function personalWarehouses(s:M.State,actor:string){
 if(!s.employees.some(e=>e.id===actor&&e.active))return [];
 return s.warehouses.filter(w=>w.owner===actor||s.replacements.some(r=>r.active&&r.warehouse===w.id&&r.deputy===actor)||(s.dailyTasks||[]).some(t=>t.warehouse===w.id&&t.editors.includes(actor))||s.tasks.some(t=>t.assignment.warehouse===w.id&&t.assignment.editors?.includes(actor))).map(w=>w.id);
}
export function matchingPids(s:M.State,materials:string[]|null){
 if(materials===null)return M.pidCatalog(s).map(p=>p.id);
 const cables=materials.filter(id=>s.materials.some(m=>m.id===id&&m.kind==='cable'));
 return M.pidCatalog(s).filter(p=>[...(p.cables||[]),...s.tasks.filter(t=>s.warehouses.some(w=>w.id===t.assignment.warehouse&&w.pid===p.id)).map(t=>t.assignment.material),...(s.dailyTasks||[]).filter(t=>t.pid===p.id).flatMap(t=>t.materials)].some(id=>cables.includes(id))).map(p=>p.id);
}
export function visibleBalance(row:{plus:number;minus:number;after:number},motion:boolean,stock:boolean){return !motion&&!stock||motion&&(row.plus!==0||row.minus!==0)||stock&&row.after!==0;}
export function workMatches(s:M.State,d:M.WorkDoc,materials:string[]|null,pids:string[]){
 if(materials===null)return true;
 if(d.assignment.work==='dig')return s.warehouses.some(w=>w.id===d.assignment.warehouse&&pids.includes(w.pid));
 if(materials.includes(d.assignment.material))return true;
 return d.assignment.work==='strip'&&['copper','lead','aluminium'].some((id,i)=>materials.includes(id)&&(M.current(d).metals?.[i]||0)!==0);
}
