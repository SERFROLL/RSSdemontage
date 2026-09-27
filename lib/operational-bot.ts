import {taskNotification} from './task-notifications';
import {summaryNotifications,notificationParts} from './company-notifications';
import {runtime} from './store';
import {ensureTasks,pool,localNow} from './production-store';
import {sendOnce,sendBatchOnce,sendAccessOnce,telegramAccess} from './bot';
import {accessMessages} from './access-workflow';
import {limited} from './production-auth';
import {accessMember,accessStatus,requestAccess,decideAccess,syncAccessMenu,openAccountMarkup,configureAccessBot,flushAccessMessages} from './observer-access';
export async function operationalEnabled(){const e=runtime();return !!e.pool&&e.OPERATIONAL_ROLLBACK!=='true'&&(await e.pool.query('SELECT id FROM operational_state WHERE id=1')).rows.length>0;}
export async function operationalSchedule(){
 const {payload:s}=await ensureTasks(),e=runtime(),clock=localNow();let sent=0;
 await configureAccessBot();await flushAccessMessages();
 if(e.BOT_ENABLED==='true'){
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
 const reply=(message:string,markup?:any)=>sendAccessOnce('update:'+update.update_id,chat,message,markup);
 try{
  if(action.startsWith('access:approve:')||action.startsWith('access:reject:')){
   if(!member?.is_admin||member.is_observer)throw Error('Требуются права администратора.');
   const [,decision,id]=action.split(':');
   if(decision==='approve'){await reply('Рассмотрите заявку и назначьте права.',{inline_keyboard:[[{text:'Рассмотреть',web_app:{url:new URL('/tg?accessRequest='+id,runtime().MINI_APP_URL).href}}]]});return;}
   await decideAccess(id,'reject',{employee:member.employee,admin:true});
   void flushAccessMessages().catch(()=>console.warn('Access notification delivery deferred'));
   await reply('Заявка отклонена.');return;
  }
  if(/^\/start(?:\s|$)/.test(text)&&text!=='/start access'){
   await reply('Нажмите «ОТКРЫТЬ УЧЁТ».',openAccountMarkup());return;
  }
  if(member){await reply('Откройте учёт: доступны разделы по вашим правам.',openAccountMarkup());return;}
  const status=await accessStatus(chat);
  if(status.status==='disabled'){await reply(accessMessages.disabled);return;}
  if(status.status==='pending'){await reply(accessMessages.pending);return;}
  if(action==='access:request'||text==='/access'||text==='/start access'){
   await limited(pool(),'access:'+chat,10);await requestAccess(user,'',false);
   if(status.status==='draft')await reply(accessMessages.introduce,{force_reply:true});
   void flushAccessMessages().catch(()=>console.warn('Access notification delivery deferred'));return;
  }
  if(status.status==='draft'&&text&&!text.startsWith('/')){
   await limited(pool(),'access:'+chat,10);await requestAccess(user,text);
   void flushAccessMessages().catch(()=>console.warn('Access notification delivery deferred'));return;
  }
  if(action==='access:confirm'){await reply('Представьтесь одним сообщением. ФИО будет комментарием для администратора.',{force_reply:true});return;}
  await reply('Нажмите «ОТКРЫТЬ УЧЁТ».',openAccountMarkup());
 }catch(error){await reply((error as Error).message);}
 finally{if(cb?.id)try{await telegramAccess('answerCallbackQuery',{callback_query_id:cb.id});}catch{}}
}
