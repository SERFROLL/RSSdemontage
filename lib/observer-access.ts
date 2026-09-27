import {randomUUID} from 'node:crypto';
import {pool,row,transaction,record,digest} from './production-store';
import {telegramAccess,telegramDiagnostic} from './bot';
import {runtime} from './store';
import {applicantComment,accessAssignment,accessMessages} from './access-workflow';
import type {Principal} from './production-domain';
export const accessName=applicantComment;
export async function accessMember(telegramId:string){
 const member=(await pool().query('SELECT employee,is_admin,is_observer FROM operational_identities WHERE telegram_id=$1',[telegramId])).rows[0];
 return member&&(await row()).payload.employees.some(e=>e.id===member.employee&&e.active)?member:null;
}
export async function accessStatus(telegramId:string){
 if(await accessMember(telegramId))return {status:'approved'};
 if((await pool().query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[telegramId])).rows.length)return {status:'disabled'};
 return (await pool().query('SELECT id,name,status FROM operational_access_requests WHERE telegram_id=$1',[telegramId])).rows[0]||{status:'new'};
}
async function history(c:any,r:any,event:string,actor:string,details:unknown={}){
 await c.query('INSERT INTO operational_access_history(request_id,telegram_id,event,actor,details) VALUES($1,$2,$3,$4,$5)',[r.id,r.telegram_id,event,actor,JSON.stringify(details)]);
}
async function queue(c:any,key:string,chat:string,text:string,markup?:unknown){
 await c.query('INSERT INTO operational_access_outbox(key,chat_id,body) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[key,chat,JSON.stringify({text,reply_markup:markup})]);
}
export async function flushAccessMessages(){
 if(runtime().APP_MODE!=='production')return;
 // Lease exceeds the maximum duration of this bounded delivery batch.
 const jobs=(await pool().query(`UPDATE operational_access_outbox SET next_attempt=now()+interval '5 minutes',attempts=attempts+1 WHERE key IN (SELECT key FROM operational_access_outbox WHERE delivered_at IS NULL AND next_attempt<=now() ORDER BY next_attempt LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING *`)).rows;
 for(const job of jobs){try{
  await telegramAccess('sendMessage',{chat_id:job.chat_id,...job.body});
  await pool().query('UPDATE operational_access_outbox SET delivered_at=now() WHERE key=$1',[job.key]);
 }catch{await pool().query("UPDATE operational_access_outbox SET next_attempt=now()+interval '5 minutes' WHERE key=$1",[job.key]);}}
}
export async function requestAccess(user:{id:number;username?:string},name:string,pending=true){
 const telegramId=String(user.id),comment=pending?applicantComment(name):'';
 const result=await transaction(async c=>{
  if((await c.query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[telegramId])).rows.length)throw Error('Для этой учётной записи доступ уже назначен. Обратитесь к администратору.');
  const old=(await c.query('SELECT * FROM operational_access_requests WHERE telegram_id=$1',[telegramId])).rows[0];
  if(old?.status==='pending'||(!pending&&old?.status==='draft'))return old;
  if(old?.status==='approved')throw Error('Доступ уже рассмотрен администратором.');
  const id=old?.status==='draft'?old.id:randomUUID().replaceAll('-','');
  const r=(await c.query(`INSERT INTO operational_access_requests(id,telegram_id,name,username,status) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(telegram_id) DO UPDATE SET id=EXCLUDED.id,name=EXCLUDED.name,username=EXCLUDED.username,status=EXCLUDED.status,employee=NULL,decided_by=NULL,created_at=CASE WHEN operational_access_requests.id=EXCLUDED.id THEN operational_access_requests.created_at ELSE now() END,updated_at=now() RETURNING *`,[id,telegramId,comment,user.username||'',pending?'pending':'draft'])).rows[0];
  await history(c,r,pending?'submitted':'started',telegramId,{comment});
  if(pending){
   const state=(await row(c)).payload;
   const setting=(await c.query('SELECT administrator FROM operational_access_settings WHERE id=1')).rows[0];
   const admins=(await c.query('SELECT employee,telegram_id FROM operational_identities WHERE is_admin=true AND is_observer=false')).rows.filter((a:any)=>state.employees.some(e=>e.id===a.employee&&e.active));
   const recipient=admins.find((a:any)=>a.employee===setting?.administrator)||admins.sort((a:any,b:any)=>a.employee.localeCompare(b.employee))[0];
   if(!recipient)throw Error('Администратор доступа не назначен. Обратитесь к ответственному за учёт.');
   if(recipient.employee!==setting?.administrator)await c.query('UPDATE operational_access_settings SET administrator=$1 WHERE id=1',[recipient.employee]);
   await queue(c,'request:'+id,recipient.telegram_id,`Запрос доступа к учёту.\nПредставился: ${comment}\nTelegram ID: ${telegramId}`,{inline_keyboard:[[{text:'Рассмотреть',web_app:{url:new URL('/tg?accessRequest='+id,runtime().MINI_APP_URL).href}},{text:'Отказать',callback_data:'access:reject:'+id}]]});
   await queue(c,'pending:'+id,telegramId,accessMessages.pending);
  }else await queue(c,'introduce:'+id,telegramId,accessMessages.introduce,{force_reply:true,input_field_placeholder:'Как вас представить?'});
  return r;
 });
 return {status:result.status,id:result.id,name:result.name};
}
export async function decideAccess(id:string,decision:'approve'|'reject',principal:Principal,assignment?:{employee?:string;name?:string;role?:string}){
 if(!principal.admin||principal.observer)throw Object.assign(Error('Требуются права администратора.'),{status:403});
 const selected=decision==='approve'?accessAssignment(assignment||{}):null;
 const result=await transaction(async c=>{
  const r=(await c.query('SELECT * FROM operational_access_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!r)throw Error('Заявка не найдена.');
  if(r.status===(decision==='approve'?'approved':'rejected'))return r;
  if(r.status!=='pending')throw Error('Заявка уже рассмотрена или ещё не отправлена.');
  const current=await row(c);let linked:string|null=null;
  if(selected){
   if((await c.query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[r.telegram_id])).rows.length)throw Error('Telegram уже привязан. Обновите список.');
   linked=selected.employee||'employee-'+randomUUID();
   if(selected.employee){
    if(!current.payload.employees.some(e=>e.id===linked&&e.active))throw Error('Выберите действующего сотрудника.');
    if((await c.query('SELECT employee FROM operational_identities WHERE employee=$1',[linked])).rows.length)throw Error('Сотрудник уже имеет Telegram. Привязку здесь заменить нельзя.');
   }
   const next=selected.employee?current.payload:{...current.payload,employees:[...current.payload.employees,{id:linked,name:selected.name,active:true}]};
   await c.query('INSERT INTO operational_identities(employee,telegram_id,is_admin,is_observer) VALUES($1,$2,$3,$4)',[linked,r.telegram_id,selected.role==='admin',selected.role==='observer']);
   await record(c,current.payload,next,current.revision+1,'access:'+id,digest(id+decision),principal.employee,{kind:'access_approved',request:id,employee:linked,role:selected.role});
  }
  const status=selected?'approved':'rejected';
  await c.query('UPDATE operational_access_requests SET status=$2,employee=$3,decided_by=$4,updated_at=now() WHERE id=$1',[id,status,linked,principal.employee]);
  await history(c,r,status,principal.employee,{employee:linked,role:selected?.role});
  await queue(c,'result:'+id,r.telegram_id,selected?accessMessages.approved:accessMessages.rejected,selected?openAccountMarkup():undefined);
  return {...r,status,employee:linked};
 });
 return {ok:true,status:result.status};
}
export const openAccountMarkup=()=>({inline_keyboard:[[{text:'Открыть учёт',web_app:{url:new URL('/tg',runtime().MINI_APP_URL).href}}]]});
export async function syncAccessMenu(chatId:string,allowed:boolean){
 try{await telegramAccess('setChatMenuButton',{chat_id:chatId,menu_button:{type:'web_app',text:'Открыть учёт',web_app:{url:new URL('/tg',runtime().MINI_APP_URL).href}}});if(!allowed)await telegramAccess('setMyCommands',{scope:{type:'chat',chat_id:chatId},commands:[{command:'access',description:'Запросить доступ'}]});return true;}catch(error){console.warn('Telegram per-chat menu failed',JSON.stringify(telegramDiagnostic(error)));return false;}
}

let menuReady=false,menuAttempt=0;
export async function configureAccessBot(){
 if(menuReady||Date.now()-menuAttempt<600000)return;
 menuAttempt=Date.now();
 let stage='getWebhookInfo';
 try{
  const e=runtime(),info=await telegramAccess('getWebhookInfo',{});
  const expected=new URL('/api/telegram',e.MINI_APP_URL).href;
  // Migrate only this application's known former endpoint; leave unrelated
  // webhook destinations untouched while updating the account menu.
  const former='https://serfroll-rssdemontage-3c31.twc1.net/api/telegram';
  if((!info.url||info.url===expected||info.url===former)&&e.TELEGRAM_WEBHOOK_SECRET){
   stage='setWebhook';await telegramAccess('setWebhook',{url:expected,secret_token:e.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query'],drop_pending_updates:false});}
  stage='setMyCommands';await telegramAccess('setMyCommands',{commands:[{command:'start',description:'Открыть учёт'},{command:'access',description:'Запросить доступ'}]});
  stage='setChatMenuButton';await telegramAccess('setChatMenuButton',{menu_button:{type:'web_app',text:'Открыть учёт',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}});
  stage='readIdentities';const s=(await row()).payload;
  stage='perChatMenu';for(const i of (await pool().query('SELECT employee,telegram_id FROM operational_identities')).rows){if(!await syncAccessMenu(i.telegram_id,s.employees.some(e=>e.id===i.employee&&e.active)))throw Error('Menu update incomplete');}
  menuReady=true;
  console.info('Telegram access menu configured');
 }catch(error){console.warn('Telegram access configuration incomplete; retry scheduled',JSON.stringify({stage,detail:telegramDiagnostic(error)}));}
}
