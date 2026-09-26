import {randomUUID} from 'node:crypto';
import {pool,row,transaction,record,digest} from './production-store';
import {telegramAccess,sendAccessOnce} from './bot';
import {runtime} from './store';
import type {Principal} from './production-domain';

export const accessName=(value:unknown)=>{
 const name=typeof value==='string'?value.trim().replace(/\s+/g,' '):'';
 if(name.length<3||name.length>120||name.split(' ').length<2||name.toLocaleLowerCase('ru')==='имя фамилия')throw Error('Укажите имя и фамилию.');
 return name;
};
export async function accessMember(telegramId:string){
 const member=(await pool().query('SELECT employee,is_admin,is_observer FROM operational_identities WHERE telegram_id=$1',[telegramId])).rows[0];
 if(!member)return null;
 return (await row()).payload.employees.some(e=>e.id===member.employee&&e.active)?member:null;
}
export async function accessStatus(telegramId:string){
 if(await accessMember(telegramId))return {status:'approved'};
 // A disabled existing account must not regain access through self-registration.
 if((await pool().query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[telegramId])).rows.length)return {status:'disabled'};
 const request=(await pool().query('SELECT id,name,status FROM operational_access_requests WHERE telegram_id=$1',[telegramId])).rows[0];
 return request||{status:'new'};
}
export async function requestAccess(user:{id:number;first_name?:string;last_name?:string;username?:string},name:string,pending=true){
 const telegramId=String(user.id);name=accessName(name);
 const result=await transaction(async c=>{
  if((await c.query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[telegramId])).rows.length)throw Error('Для этой учётной записи доступ уже назначен. Обратитесь к администратору.');
  const old=(await c.query('SELECT * FROM operational_access_requests WHERE telegram_id=$1',[telegramId])).rows[0];
  if(old?.status==='pending')return old;
  if(old?.status==='approved')throw Error('Доступ уже рассмотрен администратором.');
  const id=old?.status==='draft'?old.id:randomUUID().replaceAll('-','');
  return (await c.query(`INSERT INTO operational_access_requests(id,telegram_id,name,username,status) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(telegram_id) DO UPDATE SET id=EXCLUDED.id,name=EXCLUDED.name,username=EXCLUDED.username,status=EXCLUDED.status,employee=NULL,decided_by=NULL,updated_at=now() RETURNING *`,[id,telegramId,name,user.username||'',pending?'pending':'draft'])).rows[0];
 });
 if(result.status==='pending')await notifyAccessAdmins(result);
 return {status:result.status,id:result.id,name:result.name};
}
async function notifyAccessAdmins(request:any){
 if(runtime().APP_MODE!=='production')return;
 const s=(await row()).payload,admins=(await pool().query('SELECT employee,telegram_id FROM operational_identities WHERE is_admin=true')).rows.filter((i:any)=>s.employees.some(e=>e.id===i.employee&&e.active));
 for(const a of admins)await sendAccessOnce('access-request:'+request.id+':'+a.employee,a.telegram_id,`Запрос доступа\n${request.name}${request.username?' · @'+request.username:''}\nТолько просмотр статистики компании в TG и на сайте.`,{inline_keyboard:[[{text:'Разрешить просмотр',callback_data:'access:approve:'+request.id},{text:'Отклонить',callback_data:'access:reject:'+request.id}]]});
}
export async function decideAccess(id:string,decision:'approve'|'reject',principal:Principal,employee?:string){
 if(!principal.admin||principal.observer)throw Object.assign(Error('Требуются права администратора.'),{status:403});
 const result=await transaction(async c=>{
  const r=(await c.query('SELECT * FROM operational_access_requests WHERE id=$1 FOR UPDATE',[id])).rows[0];
  if(!r||r.status!=='pending')throw Error('Заявка уже рассмотрена или не найдена.');
  const current=await row(c);let linked:string|null=null;
  if(decision==='approve'){
   if((await c.query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[r.telegram_id])).rows.length)throw Error('Telegram уже привязан. Обновите список.');
   if(employee){
    if(!current.payload.employees.some(e=>e.id===employee&&e.active))throw Error('Выберите действующего сотрудника.');
    if((await c.query('SELECT employee FROM operational_identities WHERE employee=$1',[employee])).rows.length)throw Error('Сотрудник уже имеет Telegram. Привязку здесь заменить нельзя.');
    linked=employee;
   }else{
    if(current.payload.employees.some(e=>e.name.trim().toLocaleLowerCase('ru')===r.name.toLocaleLowerCase('ru')))throw Error('Такое имя уже есть. Сопоставьте заявку с сотрудником в Настройки → Доступ TG / WEB.');
    linked='viewer-'+randomUUID();
   }
   const next=employee?current.payload:{...current.payload,employees:[...current.payload.employees,{id:linked!,name:r.name,active:true}]};
   await c.query('INSERT INTO operational_identities(employee,telegram_id,is_admin,is_observer) VALUES($1,$2,false,true)',[linked,r.telegram_id]);
   await record(c,current.payload,next,current.revision+1,'access:'+id,digest(id+decision),principal.employee,{kind:'observer_access_approved',request:id,employee:linked});
  }
  await c.query('UPDATE operational_access_requests SET status=$2,employee=$3,decided_by=$4,updated_at=now() WHERE id=$1',[id,decision==='approve'?'approved':'rejected',linked,principal.employee]);
  return {...r,status:decision==='approve'?'approved':'rejected',employee:linked};
 });
 await syncAccessMenu(result.telegram_id,result.status==='approved');
 if(runtime().APP_MODE==='production')await sendAccessOnce('access-result:'+id,result.telegram_id,result.status==='approved'?'Вам предоставлен доступ к просмотру статистики компании.':'Запрос доступа отклонён администратором.',result.status==='approved'?openAccountMarkup():undefined);
 return {ok:true};
}
export const openAccountMarkup=()=>({inline_keyboard:[[{text:'Открыть учёт',web_app:{url:new URL('/tg',runtime().MINI_APP_URL).href}}]]});
export async function syncAccessMenu(chatId:string,allowed:boolean){
 try{await telegramAccess('setChatMenuButton',{chat_id:chatId,menu_button:allowed?{type:'web_app',text:'Открыть учёт',web_app:{url:new URL('/tg',runtime().MINI_APP_URL).href}}:{type:'commands'}});if(!allowed)await telegramAccess('setMyCommands',{scope:{type:'chat',chat_id:chatId},commands:[{command:'access',description:'Запросить доступ'}]});}catch{/* Access persists even when Telegram is unavailable. */}
}

let menuReady=false,menuAttempt=0;
export async function configureAccessBot(){
 if(menuReady||Date.now()-menuAttempt<600000)return;
 menuAttempt=Date.now();
 try{
  const e=runtime(),info=await telegramAccess('getWebhookInfo',{});
  const expected=new URL('/api/telegram',e.MINI_APP_URL).href;
  if((info.url&&info.url!==expected)||!e.TELEGRAM_WEBHOOK_SECRET)return;
  await telegramAccess('setWebhook',{url:expected,secret_token:e.TELEGRAM_WEBHOOK_SECRET,allowed_updates:['message','callback_query'],drop_pending_updates:false});
  await telegramAccess('setMyCommands',{commands:[{command:'access',description:'Запросить доступ'}]});
  await telegramAccess('setChatMenuButton',{menu_button:{type:'commands'}});
  const s=(await row()).payload;
  for(const i of (await pool().query('SELECT employee,telegram_id FROM operational_identities')).rows)await syncAccessMenu(i.telegram_id,s.employees.some(e=>e.id===i.employee&&e.active));
  menuReady=true;
 }catch{/* Retry configuration later without sending test messages. */}
}
