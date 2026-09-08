// Pure accounting functions. Metres: millimetres; weight: grams. No display rounding in the ledger.
export type Role="admin"|"foreman"|"winder"|"shipper"|"warehouse"|"observer";
export const roleNames:Record<Role,string>={admin:"Администратор",foreman:"Прораб",winder:"Намотчик",shipper:"Отправитель",warehouse:"Кладовщик",observer:"Наблюдатель"};
export type Doc={id:string;version:number;kind:string;pid:string|null;date:string;author:string;createdAt:string;seq?:number;data:any};
export type Actor={id:string;name:string;roles:Role[]};
export type Command={action:string;requestId:string;id?:string;expectedVersion?:number;data:any};
export class DomainError extends Error{status:number;constructor(message:string,status=400){super(message);this.status=status;}}
export function must(ok:unknown,message:string,status=400):asserts ok{if(!ok)throw new DomainError(message,status);}
export function today(now=new Date()){return new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Krasnoyarsk"}).format(now);}
export function validDate(value:unknown){must(typeof value==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value),"Укажите дату");const parsed=new Date(value+"T12:00:00Z");must(Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value,"Некорректная дата");return value;}
export function decimal(value:unknown,places=3,allowNegative=false):number{
 const s=String(value??"").trim().replace(",",".");
 must((allowNegative?/^-?\d+(\.\d+)?$/:/^\d+(\.\d+)?$/).test(s),"Введите число без пробелов внутри");
 must((s.split(".")[1]?.length??0)<=places,"Допустимо не более "+places+" знаков после запятой");
 const n=Math.round(Number(s)*10**places);must(Number.isSafeInteger(n)&&Math.abs(n)<=1e12,"Число слишком велико");return n;
}
export function weightList(value:string):number[]{const parts=value.trim().split(/[\s;]+/).filter(Boolean);must(parts.length>0,"Введите массы катушек");must(parts.length<=250,"Не более 250 катушек в одном блоке");return parts.map(p=>{const w=decimal(p);must(w>0,"Масса должна быть больше нуля");return w;});}
export function lengthFromMass(grams:number,sampleGrams:number,sampleMm:number){must(sampleGrams>0&&sampleMm>0,"Нет контрольного взвешивания");const result=Number((BigInt(grams)*BigInt(sampleMm)+BigInt(Math.floor(sampleGrams/2)))/BigInt(sampleGrams));must(Number.isSafeInteger(result),"Расчётная длина вне допустимого диапазона");return result;}
export const sum=(a:number[])=>a.reduce((x,y)=>x+y,0);
export function entity(docs:Doc[],id:string,kind?:string){const d=docs.find(x=>x.id===id&&(!kind||x.kind===kind));must(d,"Запись не найдена",404);return d;}
export function isAdmin(actor:Actor){return actor.roles.includes("admin");}
export function allowed(actor:Actor,role:Role){must(actor.roles.includes(role)||isAdmin(actor),"Недостаточно прав",403);}
export function assignments(docs:Doc[],user:string,pid?:string,date=today(),role?:string){return docs.filter(x=>x.kind==="assignment"&&x.data.userId===user&&(!pid||x.data.pid===pid)&&(!role||x.data.role===role)&&x.data.from<=date&&(!x.data.until||x.data.until>=date));}
export function checkPid(actor:Actor,docs:Doc[],pid:string,date:string,role:Role){allowed(actor,role);entity(docs,pid,"pid");must(isAdmin(actor)||assignments(docs,actor.id,pid,date,role).length,"Вы не закреплены за этим ПИД на указанную дату",403);}
export function cutoff(docs:Doc[],pid:string,date:string){const p=entity(docs,pid,"pid");must(date>=p.data.cutoff,"Дата раньше начала учёта по ПИД");must(date<=today(),"Будущие операции не принимаются");}
export function coefficient(docs:Doc[],pid:string,cable:string,asOf:string,createdAt:string){const list=docs.filter(x=>x.kind==="coefficient"&&x.pid===pid&&x.data.cableId===cable&&x.date<=asOf&&x.createdAt<=createdAt).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));must(list[0],"Сначала добавьте контрольное взвешивание для ПИД и типа кабеля");return list[0];}
export type Balance={pid:string;cableId:string;mm:number;coils:number;extractedMm:number;wound:number;sentGrams:number;receivedGrams:number;transitGrams:number;differenceGrams:number;adjustMm:number;adjustCoils:number};
export function balances(docs:Doc[],asOf=today()):Balance[]{
 const map=new Map<string,Balance>();
 const row=(pid:string,cableId:string)=>{const k=pid+"|"+cableId;if(!map.has(k))map.set(k,{pid,cableId,mm:0,coils:0,extractedMm:0,wound:0,sentGrams:0,receivedGrams:0,transitGrams:0,differenceGrams:0,adjustMm:0,adjustCoils:0});return map.get(k)!;};
 for(const d of docs){if(d.date>asOf||!d.pid)continue;
  if(d.kind==="opening"){const r=row(d.pid,d.data.cableId);r.mm+=d.data.mm;r.coils+=d.data.coils;r.extractedMm+=d.data.accumulatedExtractedMm||0;r.wound+=d.data.accumulatedWound||0;}
  if(d.kind==="report"&&d.data.status==="work"){
   if(d.data.category==="excavation"){const r=row(d.pid,d.data.cableId);r.mm+=d.data.cableMm;r.extractedMm+=d.data.cableMm;}
   if(d.data.category==="winding")for(const line of d.data.lines){const r=row(d.pid,line.cableId);r.coils+=line.count;r.wound+=line.count;}
  }
  if(d.kind==="adjustment"){const r=row(d.pid,d.data.cableId);r.mm+=d.data.deltaMm;r.coils+=d.data.deltaCoils;r.adjustMm+=d.data.deltaMm;r.adjustCoils+=d.data.deltaCoils;}
  if(d.kind==="trip"){
   const received=d.data.receipt&&d.data.receipt.date<=asOf;
   for(const c of d.data.coils){const r=row(d.pid,c.cableId);r.coils--;r.mm-=c.sentMm;r.sentGrams+=c.grams;
    if(received){const w=d.data.receipt.weights[c.id];r.receivedGrams+=w;r.differenceGrams+=w-c.grams;}else r.transitGrams+=c.grams;
   }
  }
 }
 return [...map.values()].sort((a,b)=>a.pid.localeCompare(b.pid)||a.cableId.localeCompare(b.cableId));
}
export function summary(docs:Doc[],date=today(),pid?:string){
 const reports=docs.filter(x=>x.kind==="report"&&x.date===date&&(!pid||x.pid===pid));
 return {trenchMm:sum(reports.filter(x=>x.data.category==="excavation"&&x.data.status==="work").map(x=>x.data.trenchMm)),cableMm:sum(reports.filter(x=>x.data.category==="excavation"&&x.data.status==="work").map(x=>x.data.cableMm)),coils:sum(reports.filter(x=>x.data.category==="winding"&&x.data.status==="work").flatMap(x=>x.data.lines.map((l:any)=>l.count))),submitted:reports.length};
}
export function adjustmentReviews(docs:Doc[]){return docs.filter(a=>a.kind==="adjustment").filter(a=>docs.some(d=>["report","trip","opening"].includes(d.kind)&&d.pid===a.pid&&d.date<=a.date&&(d.seq??0)>(a.data.checkedSeq??0)));}
export function expectedReports(docs:Doc[],date:string){return docs.filter(d=>d.kind==="assignment"&&["foreman","winder"].includes(d.data.role)&&d.data.from<=date&&(!d.data.until||d.data.until>=date)).filter(d=>docs.some(p=>p.kind==="pid"&&p.id===d.data.pid&&p.data.active!==false&&p.data.cutoff<=date)).filter(d=>docs.some(u=>u.id===d.data.userId&&u.data.active!==false)).map(d=>({userId:d.data.userId,pid:d.data.pid,category:d.data.role==="foreman"?"excavation":"winding"})).filter((v,i,a)=>a.findIndex(x=>x.userId===v.userId&&x.pid===v.pid&&x.category===v.category)===i);}
export function prepareCommand(docs:Doc[],actor:Actor,cmd:Command,now=new Date().toISOString()):Doc{
 must(cmd.requestId&&cmd.requestId.length<=120,"Нет ключа операции");
 const data=cmd.data??{};let id=cmd.id||crypto.randomUUID(),kind=cmd.action,pid:string|null=data.pid||null,date=validDate(data.date||today()),payload:any={},old=cmd.id?docs.find(d=>d.id===cmd.id):undefined;
 if(old){must(cmd.expectedVersion===old.version,"Запись уже изменена. Обновите экран.",409);must(old.kind===(cmd.action==="receipt"?"trip":cmd.action),"Нельзя менять вид существующей записи");}
 if(cmd.action==="report"){
  const category=data.category;must(["excavation","winding"].includes(category),"Неизвестный вид отчёта");const role=category==="excavation"?"foreman":"winder";
  id=cmd.id||["report",actor.id,pid,date,category].join(":");old=docs.find(d=>d.id===id);
  if(old){must(cmd.expectedVersion===old.version,"Отчёт за этот день уже есть. Откройте его для исправления.",409);must(old.author===actor.id,"Исправить отчёт может его автор",403);must(old.pid===pid&&old.date===date&&old.data.category===category,"ПИД, дата и вид существующего отчёта закреплены за записью");allowed(actor,role);}else checkPid(actor,docs,pid!,date,role);
  cutoff(docs,pid!,date);
  must(["work","dayoff","idle"].includes(data.status),"Выберите работу, выходной или простой");
  payload={category,status:data.status,note:String(data.note||"").slice(0,2000),audioId:data.audioId||null};
  if(data.status==="work"&&category==="excavation"){entity(docs,data.cableId,"cable");payload={...payload,cableId:data.cableId,trenchMm:decimal(data.trench),cableMm:decimal(data.cable)};}
  if(data.status==="work"&&category==="winding"){must(Array.isArray(data.lines)&&data.lines.length>0,"Укажите количество катушек");const used=new Set();payload.lines=data.lines.map((l:any)=>{entity(docs,l.cableId,"cable");must(!used.has(l.cableId),"Тип кабеля повторяется");used.add(l.cableId);return {cableId:l.cableId,count:decimal(l.count,0)};});}
 }
 else if(cmd.action==="trip"){
  if(old){must(old.kind==="trip","Неверный рейс");must(old.author===actor.id||isAdmin(actor),"Исправить отправку может отправитель",403);must(old.pid===pid&&old.date===date,"ПИД и дата рейса закреплены; перенос требует отдельной сверки");allowed(actor,"shipper");}else checkPid(actor,docs,pid!,date,"shipper");
  cutoff(docs,pid!,date);must(Array.isArray(data.groups)&&data.groups.length>0,"Добавьте кабель");const used=new Set();let n=0;
  const coils=data.groups.flatMap((g:any)=>{entity(docs,g.cableId,"cable");must(!used.has(g.cableId),"Объедините массы одинакового типа");used.add(g.cableId);return weightList(g.masses).map((grams,i)=>{
   const oldCoil=old?.data.coils.filter((c:any)=>c.cableId===g.cableId)[i];
   const k=oldCoil?.coefficient||coefficient(docs,pid!,g.cableId,date,now).data;
   return {id:oldCoil?.id||crypto.randomUUID(),number:++n,cableId:g.cableId,grams,coefficient:{sampleGrams:k.sampleGrams,sampleMm:k.sampleMm},sentMm:lengthFromMass(grams,k.sampleGrams,k.sampleMm)};
  });});
  must(coils.length<=500,"Не более 500 катушек в рейсе");
  if(old?.data.receipt)must(coils.length===old.data.coils.length&&coils.every((c:any)=>old!.data.coils.some((o:any)=>o.id===c.id&&o.cableId===c.cableId)),"Рейс принят: изменение состава требует совместной сверки отправки и приёмки");
  payload={coils,receipt:old?.data.receipt||null,dispatchVersion:(old?.data.dispatchVersion||0)+1,receiptVersion:old?.data.receiptVersion||0,dispatchChangedAt:now};
 }
 else if(cmd.action==="receipt"){
  allowed(actor,"warehouse");must(old?.kind==="trip","Выберите рейс");must(!old.data.receipt||old.data.receipt.author===actor.id,"Исправить приёмку может её автор",403);must(date>=old.date&&date<=today(),"Дата приёмки должна быть от даты отправки до сегодняшнего дня");
  const weights:Record<string,number>={};must(Object.keys(data.weights||{}).length===old.data.coils.length,"Взвесьте все катушки рейса");for(const c of old.data.coils){must(c.id in data.weights,"Не все катушки взвешены");weights[c.id]=decimal(data.weights[c.id]);must(weights[c.id]>0,"Масса должна быть больше нуля");}
  kind="trip";pid=old.pid;payload={...old.data,receipt:{date,author:old.data.receipt?.author||actor.id,weights,changedAt:now},receiptVersion:(old.data.receiptVersion||0)+1};date=old.date;
 }
 else if(cmd.action==="adjustment"){
  allowed(actor,"admin");entity(docs,pid!,"pid");entity(docs,data.cableId,"cable");cutoff(docs,pid!,date);must(String(data.reason||"").trim().length>=3,"Укажите причину и результат проверки");
  const base=balances(docs.filter(x=>x.id!==id),date).find(x=>x.pid===pid&&x.cableId===data.cableId);
  const hasMm=data.actualMetres!==""&&data.actualMetres!=null,hasCoils=data.actualCoils!==""&&data.actualCoils!=null;must(hasMm||hasCoils,"Укажите проверенный остаток хотя бы в одной единице");
  const actualMm=hasMm?decimal(data.actualMetres):null,actualCoils=hasCoils?decimal(data.actualCoils,0):null;
  payload={cableId:data.cableId,actualMm,actualCoils,beforeMm:base?.mm||0,beforeCoils:base?.coils||0,deltaMm:hasMm?actualMm!-(base?.mm||0):0,deltaCoils:hasCoils?actualCoils!-(base?.coils||0):0,reason:data.reason,checkedSeq:Math.max(0,...docs.map(x=>x.seq||0))};
 }
 else if(cmd.action==="coefficient"){
  allowed(actor,"admin");must(!old,"Контрольные замеры добавляются новой записью");entity(docs,pid!,"pid");entity(docs,data.cableId,"cable");must(date<=today(),"Дата замера не может быть в будущем");const sampleMm=decimal(data.sampleMetres),sampleGrams=decimal(data.sampleKg);must(sampleMm>0&&sampleGrams>0,"Длина и масса должны быть больше нуля");payload={cableId:data.cableId,sampleMm,sampleGrams};
 }
 else if(cmd.action==="pid"){
  allowed(actor,"admin");const code=String(data.code||"").trim().toUpperCase().replace(/^ПИД\s*/,"");must(/^[A-ZА-ЯЁ0-9-]{1,30}$/.test(code),"Укажите номер ПИД");id=old?.id||"pid:"+code;must(old||!docs.some(d=>d.id===id),"ПИД уже существует");date=validDate(data.cutoff);must(date<=today(),"Дата начала учёта не может быть в будущем");if(old)must(old.data.cutoff===date&&old.data.code===code,"Номер и дата начала учёта закреплены");payload={code,cutoff:date,active:data.active!==false,accumulatedTrenchMm:decimal(data.accumulatedTrench||"0")};pid=id;
 }
 else if(cmd.action==="cable"){
  allowed(actor,"admin");const name=String(data.name||"").trim();must(name.length>=2&&name.length<=100,"Укажите тип кабеля");must(!docs.some(d=>d.kind==="cable"&&d.id!==id&&d.data.name.toLowerCase()===name.toLowerCase()),"Тип уже существует");payload={name};
 }
 else if(cmd.action==="user"){
  allowed(actor,"admin");must(String(data.name||"").trim(),"Укажите имя");must(Array.isArray(data.roles)&&data.roles.length>0&&data.roles.every((x:any)=>x in roleNames),"Выберите роли");
  if(old?.data.roles.includes("admin")&&(data.active===false||!data.roles.includes("admin")))must(docs.some(d=>d.kind==="user"&&d.id!==old!.id&&d.data.active!==false&&d.data.roles.includes("admin")),"Нельзя отключить последнего администратора");
  const telegramId=String(data.telegramId||"").trim();must(!telegramId||/^\d{5,20}$/.test(telegramId),"Укажите числовой Telegram ID");must(!telegramId||!docs.some(d=>d.kind==="user"&&d.id!==id&&d.data.telegramId===telegramId),"Этот Telegram ID уже назначен");payload={name:String(data.name).trim(),roles:data.roles,telegramId,active:data.active!==false};
 }
 else if(cmd.action==="assignment"){
  allowed(actor,"admin");entity(docs,data.userId,"user");entity(docs,pid!,"pid");must(["foreman","winder","shipper"].includes(data.role),"Укажите производственную роль");must(entity(docs,data.userId).data.roles.includes(data.role),"У сотрудника нет выбранной роли");const from=validDate(data.from);const until=data.until?validDate(data.until):null;must(!until||until>=from,"Конец раньше начала");if(old)must(old.data.userId===data.userId&&old.data.pid===pid&&old.data.role===data.role&&old.data.from===from,"Для нового закрепления создайте новую запись");
  must(!docs.some(d=>d.kind==="assignment"&&d.id!==id&&d.data.userId===data.userId&&d.data.pid===pid&&d.data.role===data.role&&d.data.from<=(until||"9999-12-31")&&(d.data.until||"9999-12-31")>=from),"Закрепление на эти даты уже есть");payload={userId:data.userId,pid,role:data.role,from,until};date=from;
 }
 else if(cmd.action==="opening"){
  allowed(actor,"admin");const p=entity(docs,pid!,"pid");entity(docs,data.cableId,"cable");date=p.data.cutoff;id=old?.id||"opening:"+pid+":"+data.cableId;must(old||!docs.some(x=>x.id===id),"Начальный остаток уже задан");payload={cableId:data.cableId,mm:decimal(data.metres),coils:decimal(data.coils,0),accumulatedExtractedMm:decimal(data.accumulatedExtracted||"0"),accumulatedWound:decimal(data.accumulatedWound||"0",0)};
 }
 else if(cmd.action==="draft"){
  const slot=String(data.slot||"");must(slot.length>0&&slot.length<200,"Неверный черновик");id="draft:"+actor.id+":"+slot;old=docs.find(d=>d.id===id);if(old)must(cmd.expectedVersion===old.version,"Черновик изменён в другом окне",409);payload={slot,values:data.values};pid=null;
 }
 else throw new DomainError("Неизвестная операция");
 return {id,version:(old?.version||0)+1,kind,pid,date,author:old?.author||actor.id,createdAt:now,data:payload};
}
