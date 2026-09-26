import * as M from './concise-model';
import {transferCoils} from './concise-coils';

// The statistics screen calculates totals in the browser. Give observers only
// the quantities needed for those totals, without document text, authors,
// rates, crew, measurements, settings, or correction history.
export function observerState(s:M.State):M.State{
 const documents:M.Document[]=s.documents.map((d,index)=>{
  const id='stat:'+index;
  if(d.kind==='work'){
   const current=M.current(d),first=d.versions[0];
   return {id,kind:'work',taskId:d.taskId,date:d.date,assignment:{id:'',warehouse:d.assignment.warehouse,material:d.assignment.material,work:d.assignment.work,active:false,responsible:d.assignment.responsible},versions:[{version:1,qty:current.qty,actor:'',at:first.at,reason:'',mode:current.mode,measure:current.measure?{id:'',date:'',kgPerM:current.measure.kgPerM,confirmedBy:''}:undefined,metals:current.metals,crew:[],rate:0,norm:[]}]};
  }
  if(d.kind==='transfer')return {id,kind:'transfer',date:d.date,from:d.from,to:d.to,actor:'',items:d.items.map(item=>{const coils=transferCoils(d,item);return {material:item.material,sent:item.sent,received:item.received,...(coils===null?{}:{coils})}}),weights:[],receivedAt:d.receivedAt,reason:''};
  if(d.kind==='exclusion')return {id,kind:'exclusion',date:d.date,warehouse:d.warehouse,versions:[{version:1,lengthM:M.exclusionLength(d.versions.at(-1)!),reason:'',actor:'',at:''}]};
  if(d.kind==='opening')return {id,kind:'opening',date:d.date,warehouse:d.warehouse,material:d.material,qty:d.qty,actor:''};
  return {id,kind:'adjustment',date:d.date,warehouse:d.warehouse,material:d.material,qty:d.qty,actor:'',reason:'',basis:''};
 });
 return {...s,documents,employees:s.employees.map(({id,name,active})=>({id,name,active})),
  dailyTasks:s.dailyTasks?.map(t=>({...t,editors:[]})),tasks:s.tasks.map(t=>({...t,assignment:{id:'',warehouse:t.assignment.warehouse,material:t.assignment.material,work:t.assignment.work,active:false,responsible:t.assignment.responsible}})),
  assignments:[],replacements:[],duties:[],measurements:[],standards:[],templates:[],summarySubscriptions:[],generated:[]};
}
