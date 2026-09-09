import {type Actor,type Command,type Doc,allowed,decimal,entity,must,sum,today,validDate} from "./domain";

export type InitialEntry={location:"pid"|"warehouse";cableId:string;metres?:string;kg?:string};
export type InitialLine={id:string;location:"pid"|"warehouse";cableId:string;mm:number;grams:number};
export function initializationStatus(docs:Doc[],pid:string){
 if(docs.some(d=>d.pid===pid&&d.kind==="initialization"))return "confirmed";
 if(docs.some(d=>d.pid===pid&&d.kind==="opening")||docs.some(d=>d.id===pid&&d.data.accumulatedTrenchMm>0))return "legacy";
 return "pending";
}

// Snapshot at the start of the cutoff day, before that day's operations.
// It creates no historical production or coil reports.
export function prepareInitialization(docs:Doc[],actor:Actor,cmd:Command,now=new Date().toISOString()){
 allowed(actor,"admin");must(cmd.action==="initialize"&&!cmd.id,"Начальные остатки подтверждаются один раз");
 must(typeof cmd.requestId==="string"&&cmd.requestId.length>0&&cmd.requestId.length<=120,"Нет ключа операции");
 const input=cmd.data??{},pid=String(input.pid||""),p=entity(docs,pid,"pid"),cutoff=validDate(p.data.cutoff);
 must(cutoff<=today(new Date(now)),"Дата начала учёта не может быть в будущем");
 must(input.date===undefined||input.date===cutoff,"Остатки вводятся на начало даты учёта ПИД");
 must(initializationStatus(docs,pid)==="pending","Начальные остатки по этому ПИД уже введены. Для изменения используйте корректировку с причиной.",409);
 must(input.entries===undefined&&input.noHistory===undefined,"Форма устарела. Обновите приложение для ввода остатков по местам хранения.",409);
 for(const key of ["coils","count","accumulatedExtracted","accumulatedWound","transit","transitKg"])must(input[key]===undefined,"Начальные остатки содержат только метры на ПИД и массу на основном складе");
 must(input.pidStockChecked===true&&input.mainStockChecked===true,"Проверьте и подтвердите остатки на ПИД и на основном складе");
 must(Array.isArray(input.lines)&&input.lines.length<=250,"Допускается до 250 строк начальных остатков");
 const id="initialization:"+pid;
 const lines:InitialLine[]=input.lines.map((entry:InitialEntry,index:number)=>{
  must(entry&&["pid","warehouse"].includes(entry.location),"Выберите место хранения: ПИД или основной склад");
  for(const key of ["coils","count","accumulatedExtracted","accumulatedWound","transitKg"])must((entry as any)[key]===undefined,"В начальные остатки не вводятся катушки или итоги прежних работ");
  entity(docs,entry.cableId,"cable");
  const mm=entry.location==="pid"?decimal(entry.metres):0,grams=entry.location==="warehouse"?decimal(entry.kg):0;
  must(mm>0||grams>0,"Укажите количество больше нуля. Если кабеля в этом месте нет — отметьте отсутствие остатков.");
  must(entry.location!=="pid"||entry.kg==null||entry.kg==="","На ПИД вводится оценка длины в метрах");
  must(entry.location!=="warehouse"||entry.metres==null||entry.metres==="","На основном складе вводится масса нетто в килограммах");
  return {id:id+":line:"+(index+1),cableId:entry.cableId,location:entry.location,mm,grams};
 });
 for(const [location,empty,label] of [["pid",input.pidEmpty,"на ПИД"],["warehouse",input.warehouseEmpty,"на основном складе"]] as const){
  const count=lines.filter(l=>l.location===location).length;
  must(count>0||empty===true,"Добавьте остатки "+label+" или подтвердите, что их нет");
  must(!count||empty!==true,"Есть строки остатков "+label+": снимите отметку об их отсутствии");
 }
 const totals=initializationTotals(lines);
 must(Number.isSafeInteger(totals.pidMm)&&Number.isSafeInteger(totals.warehouseGrams),"Сумма начальных остатков слишком велика");
 const marker:Doc={id,version:1,kind:"initialization",pid,date:cutoff,author:actor.id,createdAt:now,data:{schemaVersion:2,cutoff,lines,pidStockChecked:true,mainStockChecked:true,pidEmpty:input.pidEmpty===true,warehouseEmpty:input.warehouseEmpty===true,initialPidCoils:0,totals}};
 return {marker,documents:[] as Doc[],totals};
}

export function initializationTotals(lines:InitialLine[]){
 const grouped=new Map<string,{cableId:string;pidMm:number;warehouseGrams:number}>();
 for(const l of lines){const row=grouped.get(l.cableId)??{cableId:l.cableId,pidMm:0,warehouseGrams:0};row.pidMm+=l.mm;row.warehouseGrams+=l.grams;grouped.set(l.cableId,row);}
 return {pidMm:sum(lines.map(l=>l.mm)),warehouseGrams:sum(lines.map(l=>l.grams)),rows:[...grouped.values()]};
}
