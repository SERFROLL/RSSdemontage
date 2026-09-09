import {runtime,database,readDocs,saveDoc,hash} from "./store";
import {type Doc,today,expectedReports,summary,balances,sum,must,DomainError,windingTotals} from "./domain";
export function dailyText(docs:Doc[],date:string){
 const q=summary(docs,date),format=(n:number,scale=1)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:3}).format(n/scale);
 const due=expectedReports(docs,date),missing=due.filter(x=>!docs.some(d=>d.kind==="report"&&d.author===x.userId&&d.pid===x.pid&&d.date===date&&d.data.category===x.category));
 const line=(pid:string)=>"ПИД"+(docs.find(d=>d.id===pid)?.data.code||"?");
 const names=(id:string)=>docs.find(d=>d.id===id)?.data.name||id;
 const dayTrips=docs.filter(d=>d.kind==="trip"&&d.date===date);
 const dayReceipts=docs.filter(d=>d.kind==="trip"&&d.data.receipt?.date===date);
 const winding=windingTotals(docs,date,undefined,true);
 const states=docs.filter(d=>d.kind==="report"&&d.date===date&&d.data.status!=="work").map(d=>line(d.pid!)+" · "+names(d.author)+": "+(d.data.status==="idle"?"простой":"выходной"));
 const changed=docs.filter(d=>d.version>1&&today(new Date(d.createdAt))===date&&!["draft","export","user","assignment","cable"].includes(d.kind));
 const text=["Сводка · "+date,"Трасса: "+format(q.trenchMm,1000)+" м · извлечено: "+format(q.cableMm,1000)+" м","Намотано: "+format(winding.knownMm,1000)+" м с указанной длиной · "+winding.coils+" катушек"+(winding.unknownCoils?"; у "+winding.unknownCoils+" катушек длина уточняется":""),"Отправлено: "+format(sum(dayTrips.flatMap(d=>d.data.coils.map((c:any)=>c.grams))),1000000)+" т","Принято: "+format(sum(dayReceipts.flatMap(d=>Object.values(d.data.receipt.weights) as number[])),1000000)+" т"];
 for(const p of docs.filter(d=>d.kind==="pid"&&d.data.active)){const b=balances(docs,date).filter(x=>x.pid===p.id),v=summary(docs,date,p.id);text.push(line(p.id)+": трасса "+format(v.trenchMm,1000)+" м; извлечено "+format(v.cableMm,1000)+" м; остаток расчётно "+format(sum(b.map(x=>x.mm)),1000)+" м / "+sum(b.map(x=>x.coils))+" кат.");}
 if(states.length)text.push(...states);
 text.push(missing.length?"Не сдали: "+missing.map(x=>names(x.userId)+" / "+line(x.pid)+" / "+(x.category==="excavation"?"копка":"намотка")).join("; "):"Все отчёты сданы");
 if(changed.length)text.push("Изменено записей: "+changed.length+". История доступна в приложении.");
 return text.join("\n");
}
export async function telegram(method:string,body:any){
 const e=runtime();must(e.APP_MODE==="production"&&e.BOT_ENABLED==="true","Отправка сообщений на стенде отключена",503);must(e.TELEGRAM_BOT_TOKEN,"Бот не настроен",503);
 // Never log URLs or exceptions: the Bot API places the credential in its URL.
 let response:Response;try{response=await fetch("https://api.telegram.org/bot"+e.TELEGRAM_BOT_TOKEN+"/"+method,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});}catch{throw new DomainError("Не удалось подтвердить отправку сообщения",503);}
 const r:any=await response.json();if(!r.ok)throw new DomainError("Telegram отклонил отправку",502);return r.result;
}
export async function sendOnce(key:string,chatId:string,text:string,markup?:any){
 const db=database(),now=new Date().toISOString();
 const claim=await db.prepare("INSERT OR IGNORE INTO notifications (key,status,chat_id,created_at) VALUES (?,'sending',?,?) RETURNING key").bind(key,chatId,now).first();if(!claim)return false;
 try{const r=await telegram("sendMessage",{chat_id:chatId,text,reply_markup:markup});await db.prepare("UPDATE notifications SET status='sent',message_id=? WHERE key=?").bind(String(r.message_id),key).run();return true;}
 catch{await db.prepare("UPDATE notifications SET status='uncertain',error=? WHERE key=?").bind("Требуется проверка доставки; автоматический повтор отключён",key).run();return false;}
}
export function miniUrl(env:any,pid?:string,category?:string,date?:string){const u=new URL(env.MINI_APP_URL);if(pid)u.searchParams.set("pid",pid);if(category)u.searchParams.set("category",category);if(date)u.searchParams.set("date",date);return u.toString();}
export async function runSchedule(now=new Date()){
 const env=runtime();if(env.APP_MODE!=="production"||env.BOT_ENABLED!=="true")return {enabled:false};
 const date=today(now),hour=Number(new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Krasnoyarsk",hour:"2-digit",hourCycle:"h23"}).format(now));
 const docs=await readDocs("production");let sent=0;
 if(hour===19||hour===20)for(const x of expectedReports(docs,date)){
  if(docs.some(d=>d.kind==="report"&&d.date===date&&d.pid===x.pid&&d.author===x.userId&&d.data.category===x.category))continue;
  if(hour===20){const firstKey=[date,19,x.userId,x.pid,x.category].join(":");const first=await database().prepare("SELECT created_at,status FROM notifications WHERE key=?").bind(firstKey).first();if(first&&now.getTime()-new Date(first.created_at).getTime()<3600000)continue;}
  const user=docs.find(d=>d.id===x.userId),pid=docs.find(d=>d.id===x.pid);
  if(!user?.data.telegramId||user.data.active===false||!pid?.data.active)continue;
  const type=x.category==="excavation"?"Трасса и извлечённый кабель":"Намотка";
  if(await sendOnce([date,hour,x.userId,x.pid,x.category].join(":"),user.data.telegramId,"ПИД"+pid.data.code+" · "+date+"\n"+(hour===20?"Напоминание: ":"")+type,{inline_keyboard:[[{text:"Заполнить отчёт",web_app:{url:miniUrl(env,x.pid,x.category,date)}}]]}))sent++;
 }
 if(hour===21&&env.SUMMARY_CHAT_ID){
  // Long summaries split on lines, never truncate accounting information.
  const text=dailyText(docs,date),chunks:string[]=[];let chunk="";for(const line of text.split("\n")){if((chunk+"\n"+line).length>3500){chunks.push(chunk);chunk="";}chunk+=(chunk?"\n":"")+line;}if(chunk)chunks.push(chunk);
  for(let i=0;i<chunks.length;i++)if(await sendOnce(date+":summary:"+i,env.SUMMARY_CHAT_ID,chunks[i]))sent++;
 }
 return {enabled:true,date,hour,sent};
}
export async function handleUpdate(update:any){
 const env=runtime();must(env.APP_MODE==="production"&&env.BOT_ENABLED==="true","Бот не активирован",503);
 const m=update.message;if(!m||m.chat?.type!=="private"||!m.from?.id)return;
 if(typeof m.text!=="string"||!/^\/start(?:\s|$)/.test(m.text))return;
 const docs=await readDocs("production"),u=docs.find(d=>d.kind==="user"&&d.data.telegramId===String(m.from.id)&&d.data.active!==false);
 const body=u?"Открыть рабочее приложение":"Ваш Telegram ID: "+m.from.id+". Передайте его администратору для назначения доступа.";
 await sendOnce("update:"+update.update_id,String(m.chat.id),body,u?{inline_keyboard:[[{text:"Открыть приложение",web_app:{url:miniUrl(env)}}]]}:undefined);
}
