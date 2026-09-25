import {taskNotification} from './task-notifications';
import {summaryNotifications,notificationParts} from './company-notifications';
import {runtime} from './store';
import {ensureTasks,pool,localNow} from './production-store';
import {sendOnce,sendBatchOnce} from './bot';
export async function operationalEnabled(){const e=runtime();return !!e.pool&&e.OPERATIONAL_ROLLBACK!=='true'&&(await e.pool.query('SELECT id FROM operational_state WHERE id=1')).rows.length>0;}
export async function operationalSchedule(){
 const {payload:s}=await ensureTasks(),e=runtime(),clock=localNow();let sent=0;
 if(e.BOT_ENABLED==='true'){
  const identities=(await pool().query('SELECT employee,telegram_id,is_admin FROM operational_identities')).rows;
  for(const i of identities){const notice=taskNotification(s,i.employee,clock);if(!notice)continue;
   if(await sendOnce(notice.key,i.telegram_id,notice.text,{inline_keyboard:[[{text:'Мои задания',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}]]}))sent++;
  }
  for(const notice of summaryNotifications(s,identities,clock)){
   sent+=await sendBatchOnce(notice.key,notice.chatId,notificationParts(notice.text),{inline_keyboard:[[{text:'Открыть учёт',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}]]});
  }
 }
 return {enabled:true,model:'operational',date:clock.today,sent};
}
export async function operationalStart(update:any){const m=update.message,e=runtime();if(!m||m.chat?.type!=='private'||!m.from?.id||typeof m.text!=='string'||!/^\/(start|id)(?:\s|$)/.test(m.text))return;
 const member=(await pool().query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[String(m.from.id)])).rows[0];
 await sendOnce('update:'+update.update_id,String(m.chat.id),`Ваш Telegram ID: ${m.from.id}.\n`+(member?'Рабочие задания, перемещения и показатели доступны по кнопке «Открыть учёт». Для входа с компьютера подтвердите код в разделе «Вход в WEB» внутри приложения.':'Передайте ID администратору для назначения доступа.'),member?{inline_keyboard:[[{text:'Открыть учёт',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}]]}:undefined);
}
