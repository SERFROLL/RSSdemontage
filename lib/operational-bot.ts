import {taskNotification} from './task-notifications';
import {summaryNotifications,notificationParts} from './company-notifications';
import {runtime} from './store';
import {ensureTasks,pool,localNow} from './production-store';
import {sendOnce,sendBatchOnce,telegram} from './bot';
import {limited} from './production-auth';
import {accessMember,accessStatus,requestAccess,decideAccess,syncAccessMenu,openAccountMarkup,configureAccessBot} from './observer-access';
export async function operationalEnabled(){const e=runtime();return !!e.pool&&e.OPERATIONAL_ROLLBACK!=='true'&&(await e.pool.query('SELECT id FROM operational_state WHERE id=1')).rows.length>0;}
export async function operationalSchedule(){
 const {payload:s}=await ensureTasks(),e=runtime(),clock=localNow();let sent=0;
 if(e.BOT_ENABLED==='true'){
  await configureAccessBot();
  const identities=(await pool().query('SELECT employee,telegram_id,is_admin FROM operational_identities WHERE is_observer=false')).rows;
  for(const i of identities){const notice=taskNotification(s,i.employee,clock);if(!notice)continue;
   if(await sendOnce(notice.key,i.telegram_id,notice.text,{inline_keyboard:[[{text:'Мои задания',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}]]}))sent++;
  }
  for(const notice of summaryNotifications(s,identities,clock)){
   sent+=await sendBatchOnce(notice.key,notice.chatId,notificationParts(notice.text),{inline_keyboard:[[{text:'Открыть учёт',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}]]});
  }
 }
 return {enabled:true,model:'operational',date:clock.today,sent};
}
export async function operationalStart(update:any){
 const cb=update.callback_query,m=cb?.message||update.message,user=cb?.from||m?.from;
 if(!user?.id||m?.chat?.type!=='private'||String(m.chat.id)!==String(user.id))return;
 const chat=String(user.id),member=await accessMember(chat),text=update.message?.text||'',action=cb?.data||'';
 const reply=(message:string,markup?:any)=>sendOnce('update:'+update.update_id,chat,message,markup);
 try{
  if(action.startsWith('access:approve:')||action.startsWith('access:reject:')){
   if(!member?.is_admin||member.is_observer)throw Error('Требуются права администратора.');
   const [,decision,id]=action.split(':');await decideAccess(id,decision as 'approve'|'reject',{employee:member.employee,admin:true});
   await reply('Заявка рассмотрена.');return;
  }
  if(member){
   if(!/^\/(start|id|access)(?:\s|$)/.test(text)&&!action.startsWith('access:'))return;
   await syncAccessMenu(chat,true);
   await reply((/^\/id(?:\s|$)/.test(text)?`Ваш Telegram ID: ${user.id}.\n`:'')+(member.is_observer?'Доступен просмотр статистики компании.':'Откройте учёт: доступны разделы по вашим правам.'),openAccountMarkup());return;
  }
  const status=await accessStatus(chat);await syncAccessMenu(chat,false);
  if(status.status==='disabled'){await reply('Доступ отключён. Обратитесь к администратору.');return;}
  if(status.status==='pending'){await reply('Запрос отправлен. Ожидайте решения администратора.');return;}
  if(action==='access:confirm'){
   if(status.status!=='draft')throw Error('Нажмите «Запросить доступ».');
   if(status.name==='Имя Фамилия')throw Error('Сначала напишите ваше имя и фамилию одним сообщением.');
   await limited(pool(),'access:'+chat,10);await requestAccess(user,status.name);await reply('Запрос отправлен. Ожидайте решения администратора.');return;
  }
  if(action==='access:request'||text==='/access'){
   await limited(pool(),'access:'+chat,10);
   const suggested=[user.first_name,user.last_name].filter(Boolean).join(' ');
   if(suggested.split(' ').length<2){await requestAccess(user,'Имя Фамилия',false);await reply('Напишите ваше имя и фамилию одним сообщением.');return;}
   await requestAccess(user,suggested,false);await reply(`Проверьте имя и фамилию: ${suggested}\nЕсли нужно исправить — напишите их одним сообщением.`,{inline_keyboard:[[{text:'Подтвердить и запросить доступ',callback_data:'access:confirm'}]]});return;
  }
  if(status.status==='draft'&&text&&!text.startsWith('/')){
   await limited(pool(),'access:'+chat,10);await requestAccess(user,text,false);await reply(`Имя и фамилия: ${text.trim()}\nДоступ предоставляется только к просмотру статистики.`,{inline_keyboard:[[{text:'Подтвердить и запросить доступ',callback_data:'access:confirm'}]]});return;
  }
  if(/^\/(start|id)(?:\s|$)/.test(text))await reply('Для просмотра статистики запросите доступ у администратора.',{inline_keyboard:[[{text:'Запросить доступ',callback_data:'access:request'}]]});
 }catch(error){await reply((error as Error).message);}
 finally{if(cb?.id)try{await telegram('answerCallbackQuery',{callback_query_id:cb.id});}catch{}}
}
