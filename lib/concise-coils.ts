import * as M from './concise-model';
export type CoilMove = {date:string;warehouse:string;material:string;qty:number;docId:string};
// Legacy flat weights are attributable only when the shipment has a single line.
export function transferCoils(t:M.Transfer,i:M.TransferItem):number|null{
 if(i.weights?.length)return i.weights.length;
 if(i.coils!==undefined)return i.coils;
 if(t.items.length===1&&t.weights.length)return t.weights.length;
 return null;
}
export function coilMovements(s:M.State):CoilMove[]{
 const out:CoilMove[]=[];
 const add=(date:string,warehouse:string,material:string,qty:number,docId:string)=>out.push({date,warehouse,material,qty,docId});
 for(const d of s.documents){
  if(d.kind==='work'&&d.assignment.work==='wind'){const v=M.current(d);if(v.mode==='work')add(d.date,d.assignment.warehouse,d.assignment.material,v.qty,d.id)}
  if(d.kind==='transfer')for(const i of d.items){if(!s.materials.some(m=>m.id===i.material&&m.kind==='cable'))continue;const count=transferCoils(d,i);if(count===null)continue;add(d.date,d.from,i.material,-count,d.id);add(d.date,'transit',i.material,count,d.id);if(i.received!==null){add(d.receivedAt||d.date,'transit',i.material,-count,d.id);add(d.receivedAt||d.date,d.to,i.material,count,d.id)}}
 }
 return out;
}
export function coilBalance(s:M.State,from:string,to:string,inScope:(w:string)=>boolean,company:boolean,material='all'){
 const raw=coilMovements(s).filter(m=>m.date<=to&&inScope(m.warehouse)&&(material==='all'||m.material===material));
 const moves=company?Object.values(raw.reduce((out,m)=>{const key=m.docId+'|'+m.material+'|'+m.date;out[key]=out[key]?{...m,qty:out[key].qty+m.qty}:{...m};return out},{} as Record<string,CoilMove>)):raw;
 const rows=s.materials.filter(m=>m.kind==='cable'&&(material==='all'||material===m.id)).map(m=>{const all=moves.filter(x=>x.material===m.id),before=all.filter(x=>x.date<from),plus=all.filter(x=>x.date>=from&&x.qty>0),minus=all.filter(x=>x.date>=from&&x.qty<0),sum=(list:CoilMove[])=>list.reduce((n,x)=>n+x.qty,0);return {material:m,before:sum(before),plus:sum(plus),minus:Math.abs(sum(minus)),after:sum(all),ids:{before:before.map(x=>x.docId),plus:plus.map(x=>x.docId),minus:minus.map(x=>x.docId),after:all.map(x=>x.docId)}}});
 const unknown=s.documents.filter((d):d is M.Transfer=>d.kind==='transfer'&&d.date<=to&&(inScope(d.from)||inScope(d.to)||inScope('transit'))&&d.items.some(i=>s.materials.some(m=>m.id===i.material&&m.kind==='cable')&&(material==='all'||material===i.material)&&transferCoils(d,i)===null));
 return {rows,unknown};
}
