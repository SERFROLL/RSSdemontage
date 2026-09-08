import {type Doc,validDate,must} from "./domain";import {workbook} from "./xlsx";
export type ExportRow={id:string;kind:"dispatch"|"receipt";version:number;tripId:string;date:string;pid:string;cableId:string;cableName:string;author:string;grams:number;coilId:string;sequence:number;action:"UPSERT"|"DELETE"};
export function exportSnapshot(docs:Doc[],from:string,to:string){
 validDate(from);validDate(to);must(from<=to,"Начало периода позже конца");const name=(id:string)=>docs.find(d=>d.id===id)?.data.name||id;
 const all:ExportRow[]=[];
 for(const trip of docs.filter(d=>d.kind==="trip"))for(const c of trip.data.coils){
  all.push({id:"dispatch:"+trip.id+":"+c.id,kind:"dispatch",version:trip.data.dispatchVersion||1,tripId:trip.id,date:trip.date,pid:trip.pid!,cableId:c.cableId,cableName:name(c.cableId),author:name(trip.author),grams:c.grams,coilId:c.id,sequence:c.number,action:"UPSERT"});
  if(trip.data.receipt)all.push({id:"receipt:"+trip.id+":"+c.id,kind:"receipt",version:trip.data.receiptVersion||1,tripId:trip.id,date:trip.data.receipt.date,pid:trip.pid!,cableId:c.cableId,cableName:name(c.cableId),author:name(trip.data.receipt.author),grams:trip.data.receipt.weights[c.id],coilId:c.id,sequence:c.number,action:"UPSERT"});
 }
 const previous=new Map<string,ExportRow>();for(const e of docs.filter(d=>d.kind==="export").sort((a,b)=>(a.data.exportOrder||a.seq||0)-(b.data.exportOrder||b.seq||0)))for(const row of e.data.rows)previous.set(row.id,row);
 // A correction can add rows to an already exported operation. These rows have
 // no previous ID, but must travel with the corrected operation outside its date range.
 const exportedOperations=new Set([...previous.values()].map(r=>r.kind+":"+r.tripId));
 const addedToExportedOperation=(r:ExportRow)=>!previous.has(r.id)&&exportedOperations.has(r.kind+":"+r.tripId);
 const changed=(r:ExportRow,p:ExportRow)=>r.version!==p.version||r.grams!==p.grams||r.cableId!==p.cableId||r.date!==p.date||r.pid!==p.pid||p.action==="DELETE";
 const rows=all.filter(r=>(r.date>=from&&r.date<=to)||addedToExportedOperation(r)||(previous.has(r.id)&&changed(r,previous.get(r.id)!)));
 const current=new Set(all.map(r=>r.id));
 for(const p of previous.values())if(p.action!=="DELETE"&&!current.has(p.id))rows.push({...p,version:p.version+1,action:"DELETE"});
 const changes=rows.filter(r=>addedToExportedOperation(r)||(previous.has(r.id)&&(r.action==="DELETE"||changed(r,previous.get(r.id)!)))).map(r=>({id:r.id,kind:r.kind,before:previous.get(r.id),after:r}));
 return {rows,changes,from,to,exportOrder:Math.max(0,...docs.map(d=>d.seq||0))+1,formatVersion:"1.0",importedAt:null};
}
export function exportWorkbook(data:ReturnType<typeof exportSnapshot>,id:string){
 const headers=["ID записи","Версия","Действие","ID рейса","Дата","ПИД","ID типа","Тип кабеля","Автор","Масса, кг","ID строки катушки","№ в ведомости"];
 const rows=(kind:string)=>[headers,...data.rows.filter(r=>r.kind===kind).map(r=>[r.id,r.version,r.action,r.tripId,r.date,r.pid,r.cableId,r.cableName,r.author,r.grams/1000,r.coilId,r.sequence])];
 return workbook([{name:"Отправки",rows:rows("dispatch")},{name:"Приёмки",rows:rows("receipt")},{name:"Изменения",rows:[["ID записи","Вид","Старая версия","Новая версия","Было, кг","Стало, кг","Действие"],...data.changes.map(x=>[x.id,x.kind,x.before?.version,x.after.version,(x.before?.grams||0)/1000,x.after.action==="DELETE"?null:x.after.grams/1000,x.after.action])]},{name:"Формат",rows:[["Параметр","Значение"],["Версия формата",data.formatVersion],["ID выгрузки",id],["Период",data.from+" — "+data.to],["Масса","Килограммы кабеля без тары"],["UPSERT","Создать или обновить по ID и версии; не дублировать"],["DELETE","Отменить ранее выгруженную строку по ID"],["Примечание","Это обменные данные. Документы 1С должны исключать двойное оприходование."],["Загрузка в 1С","Не подтверждена"]]}]);
}
