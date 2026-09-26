import {authenticate} from '@/lib/production-auth';
import {pool,row,transaction,errorResponse} from '@/lib/production-store';
import {requireSameOrigin} from '@/lib/session';
import {syncAccessMenu} from '@/lib/observer-access';
export async function GET(request:Request){try{const p=await authenticate(request);if(!p.admin)throw Error('Требуются права администратора.');return Response.json((await pool().query('SELECT employee,telegram_id,is_admin,is_observer FROM operational_identities ORDER BY employee')).rows,{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 requireSameOrigin(request);const p=await authenticate(request);if(!p.admin)throw Error('Требуются права администратора.');const b=await request.json();
 if(typeof b.employee!=='string'||!/^\d{5,20}$/.test(b.telegram_id)||typeof b.is_admin!=='boolean'||(b.is_observer!==undefined&&typeof b.is_observer!=='boolean')||b.is_admin&&b.is_observer)throw Error('Проверьте сотрудника, права и числовой Telegram ID.');
 const previousTelegramId=await transaction(async c=>{
  const s=(await row(c)).payload;if(!s.employees.some(e=>e.id===b.employee&&e.active))throw Error('Сотрудник не найден.');if(b.employee===p.employee)throw Error('Нельзя менять собственный способ входа или права.');
  const previous=(await c.query('SELECT telegram_id,is_observer FROM operational_identities WHERE employee=$1',[b.employee])).rows[0];
  const observer=b.is_observer===undefined?!!previous?.is_observer:b.is_observer;
  if(b.is_admin&&observer)throw Error('Администратор не может быть наблюдателем. Укажите роль явно.');
  await c.query('INSERT INTO operational_backups(reason,payload) VALUES($1,$2)',['Изменение доступа: '+p.employee,JSON.stringify((await c.query('SELECT employee,telegram_id,is_admin,is_observer FROM operational_identities')).rows)]);
  await c.query('INSERT INTO operational_identities(employee,telegram_id,is_admin,is_observer) VALUES($1,$2,$3,$4) ON CONFLICT(employee) DO UPDATE SET telegram_id=EXCLUDED.telegram_id,is_admin=EXCLUDED.is_admin,is_observer=EXCLUDED.is_observer',[b.employee,b.telegram_id,b.is_admin,observer]);
  await c.query('DELETE FROM operational_sessions WHERE employee=$1',[b.employee]);
  return previous?.telegram_id!==b.telegram_id?previous?.telegram_id:null;
 });
 if(previousTelegramId)await syncAccessMenu(previousTelegramId,false);
 await syncAccessMenu(b.telegram_id,true);return Response.json({ok:true});
 }catch(e){return errorResponse(e);}}
