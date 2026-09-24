import {runtime} from './store';
import {ensureTasks,pool,localNow} from './production-store';
import * as M from './concise-model';
import {sendOnce} from './bot';
export async function operationalEnabled(){const e=runtime();return !!e.pool&&e.OPERATIONAL_ROLLBACK!=='true'&&(await e.pool.query('SELECT id FROM operational_state WHERE id=1')).rows.length>0;}
export async function operationalSchedule(){
 const {payload:s}=await ensureTasks(),e=runtime(),clock=localNow();let sent=0;
 if(e.BOT_ENABLED==='true'&&[19,20].includes(clock.hour)){
  const identities=(await pool().query('SELECT employee,telegram_id FROM operational_identities')).rows;
  for(const i of identities){const pending=s.tasks.filter(t=>t.date===clock.today&&M.canReport(s,t.assignment,i.employee)&&!M.taskDoc(s,t.id));if(!pending.length)continue;
   if(await sendOnce(`operational:${clock.today}:${clock.hour}:${i.employee}`,i.telegram_id,`Напоминание за ${clock.today}: осталось заполнить ${pending.length} показателей. Откройте «Мою работу».`,{inline_keyboard:[[{text:'Моя работа',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}]]}))sent++;
  }
 }
 return {enabled:true,model:'operational',date:clock.today,sent};
}
export async function operationalStart(update:any){const m=update.message,e=runtime();if(!m||m.chat?.type!=='private'||!m.from?.id||typeof m.text!=='string'||!/^\/(start|id)(?:\s|$)/.test(m.text))return;
 const member=(await pool().query('SELECT employee FROM operational_identities WHERE telegram_id=$1',[String(m.from.id)])).rows[0];
 await sendOnce('update:'+update.update_id,String(m.chat.id),`Ваш Telegram ID: ${m.from.id}.\n`+(member?'Рабочие задания, перемещения и показатели доступны по кнопке «Открыть учёт». Для входа с компьютера подтвердите код в разделе «Вход в WEB» внутри приложения.':'Передайте ID администратору для назначения доступа.'),member?{inline_keyboard:[[{text:'Открыть учёт',web_app:{url:new URL('/tg',e.MINI_APP_URL).href}}]]}:undefined);
}
