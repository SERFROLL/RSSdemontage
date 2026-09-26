import {authenticate,limited} from '@/lib/production-auth';
import {validateTelegram} from '@/lib/telegram-auth';
import {runtime} from '@/lib/store';
import {pool,errorResponse} from '@/lib/production-store';
import {accessStatus,requestAccess,decideAccess} from '@/lib/observer-access';
import {requireSameOrigin} from '@/lib/session';
export async function GET(request:Request){try{
 if(request.headers.get('x-telegram-init-data')){const u=await validateTelegram(request.headers.get('x-telegram-init-data')!,runtime().TELEGRAM_BOT_TOKEN||'');return Response.json({...await accessStatus(String(u.id)),suggestedName:[u.first_name,u.last_name].filter(Boolean).join(' ')},{headers:{'Cache-Control':'no-store'}});}
 const p=await authenticate(request);if(!p.admin)throw Object.assign(Error('Требуются права администратора.'),{status:403});
 return Response.json((await pool().query("SELECT id,name,username,created_at FROM operational_access_requests WHERE status='pending' ORDER BY created_at")).rows,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 requireSameOrigin(request);const b=await request.json();
 if(b.action==='request'){
  const u=await validateTelegram(request.headers.get('x-telegram-init-data')||'',runtime().TELEGRAM_BOT_TOKEN||'');await limited(pool(),'access:'+u.id,10);
  return Response.json(await requestAccess(u,b.name));
 }
 const p=await authenticate(request);if(!['approve','reject'].includes(b.action)||typeof b.id!=='string'||(b.employee!==undefined&&typeof b.employee!=='string'))throw Error('Проверьте действие и сотрудника.');
 return Response.json(await decideAccess(b.id,b.action,p,b.employee||undefined));
 }catch(e){return errorResponse(e);}}
