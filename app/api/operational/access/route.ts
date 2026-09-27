import {authenticate,limited} from '@/lib/production-auth';
import {validateTelegram} from '@/lib/telegram-auth';
import {runtime} from '@/lib/store';
import {pool,row,transaction,errorResponse} from '@/lib/production-store';
import {accessStatus,requestAccess,decideAccess,flushAccessMessages} from '@/lib/observer-access';
import {telegramAccess} from '@/lib/bot';
import {requireSameOrigin} from '@/lib/session';
const flush=()=>void flushAccessMessages().catch(()=>console.warn('Access notification delivery deferred'));
export async function GET(request:Request){try{
 if(new URL(request.url).searchParams.get('view')!=='admin'){
  const u=await validateTelegram(request.headers.get('x-telegram-init-data')||'',runtime().TELEGRAM_BOT_TOKEN||'');
  return Response.json(await accessStatus(String(u.id)),{headers:{'Cache-Control':'no-store'}});
 }
 const p=await authenticate(request);if(!p.admin)throw Object.assign(Error('Требуются права администратора.'),{status:403});
 const requests=(await pool().query("SELECT id,telegram_id,name,username,created_at FROM operational_access_requests WHERE status='pending' ORDER BY created_at")).rows;
 const administrator=(await pool().query('SELECT administrator FROM operational_access_settings WHERE id=1')).rows[0]?.administrator||'';
 return Response.json({requests,administrator},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 requireSameOrigin(request);const b=await request.json();
 if(b.action==='begin'){
  const init=request.headers.get('x-telegram-init-data')||'';
  const u=await validateTelegram(init,runtime().TELEGRAM_BOT_TOKEN||'');await limited(pool(),'access:'+u.id,10);
  const previous=await accessStatus(String(u.id));
  if(previous.status==='approved'||previous.status==='disabled'||previous.status==='pending')return Response.json(previous);
  const result=await requestAccess(u,'',false);
  let sent=false;const query=new URLSearchParams(init).get('query_id');
  if(query&&previous.status!=='draft')try{await telegramAccess('answerWebAppQuery',{web_app_query_id:query,result:{type:'article',id:result.id,title:'Запрос доступа',input_message_content:{message_text:'Запрашиваю доступ к учёту'}}});sent=true;}catch{/* Stored draft remains available in the bot. */}
  flush();return Response.json({...result,sent});
 }
 const p=await authenticate(request);if(!p.admin||p.observer)throw Object.assign(Error('Требуются права администратора.'),{status:403});
 if(b.action==='administrator'){
  await transaction(async c=>{const state=(await row(c)).payload;const member=(await c.query('SELECT employee FROM operational_identities WHERE employee=$1 AND is_admin=true AND is_observer=false',[b.employee])).rows[0];
   if(!member||!state.employees.some(e=>e.id===member.employee&&e.active))throw Error('Выберите действующего администратора.');
   await c.query('UPDATE operational_access_settings SET administrator=$1 WHERE id=1',[member.employee]);
  });return Response.json({ok:true});
 }
 if(!['approve','reject'].includes(b.action)||typeof b.id!=='string')throw Error('Проверьте действие и заявку.');
 const result=await decideAccess(b.id,b.action,p,{employee:b.employee,name:b.name,role:b.role});flush();return Response.json(result);
 }catch(e){return errorResponse(e);}}
