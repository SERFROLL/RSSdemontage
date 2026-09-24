import {randomBytes,randomInt} from 'node:crypto';
import {validateTelegram} from './telegram-auth';
import {runtime} from './store';
import {digest,pool,row,transaction} from './production-store';
export const cookieName='rss_session';
const cookie=(request:Request,name:string)=>request.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
const unauthorized=()=>Object.assign(Error('Войдите через Telegram.'),{status:401});
export async function authenticate(request:Request,tgOnly=false){
 if(runtime().OPERATIONAL_ROLLBACK==='true')throw Object.assign(Error('Новый учёт временно закрыт для отката.'),{status:503});
 const init=request.headers.get('x-telegram-init-data');let member;
 if(init){const user=await validateTelegram(init,runtime().TELEGRAM_BOT_TOKEN||'');const r=await pool().query('SELECT employee,is_admin FROM operational_identities WHERE telegram_id=$1',[String(user.id)]);member=r.rows[0];if(!member)throw Object.assign(Error('Доступ не назначен. Ваш Telegram ID: '+user.id),{status:403});}
 else if(!tgOnly){const token=cookie(request,cookieName);if(!token)throw unauthorized();const r=await pool().query('SELECT i.employee,i.is_admin FROM operational_sessions s JOIN operational_identities i ON i.employee=s.employee WHERE s.token_hash=$1 AND s.expires_at>now()',[digest(token)]);member=r.rows[0];}
 if(!member)throw unauthorized();const current=await row();const employee=current.payload.employees.find(e=>e.id===member.employee&&e.active);if(!employee)throw Object.assign(Error('Сотрудник отключён.'),{status:403});
 return {employee:employee.id,name:employee.name,admin:!!member.is_admin};
}
export async function limited(client:any,bucket:string,limit:number){const r=await client.query(`INSERT INTO operational_rate_limits(bucket,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(bucket) DO UPDATE SET attempts=CASE WHEN operational_rate_limits.expires_at<now() THEN 1 ELSE operational_rate_limits.attempts+1 END, expires_at=CASE WHEN operational_rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE operational_rate_limits.expires_at END RETURNING attempts`,[bucket]);if(r.rows[0].attempts>limit)throw Object.assign(Error('Слишком много попыток. Повторите через 15 минут.'),{status:429});}
export async function beginLogin(request:Request){
 const token=randomBytes(32).toString('hex'),hash=digest(token),ip=request.headers.get('x-real-ip')||request.headers.get('x-forwarded-for')?.split(',')[0]||'unknown';
 await limited(pool(),'start:'+digest(ip),30);
 const code=String(randomInt(10_000_000,100_000_000));
 await pool().query('DELETE FROM operational_login_requests WHERE expires_at<now()');
 await pool().query(`INSERT INTO operational_login_requests(token_hash,code,expires_at) VALUES($1,$2,now()+interval '5 minutes')`,[hash,code]);
 return Response.json({code,expiresIn:300},{headers:{'Cache-Control':'no-store','Set-Cookie':`rss_login=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/operational/auth; Max-Age=300`}});
}
export async function approveLogin(request:Request,code:string){const p=await authenticate(request,true);await limited(pool(),'approve:'+p.employee,10);if(!/^\d{8}$/.test(code))throw Error('Введите восемь цифр с экрана своего компьютера.');const r=await pool().query('UPDATE operational_login_requests SET employee=$1 WHERE code=$2 AND expires_at>now() AND employee IS NULL AND consumed=false RETURNING code',[p.employee,code]);if(!r.rows.length)throw Error('Код истёк или уже использован. Запросите новый в WEB.');return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});}
export async function finishLogin(request:Request){return transaction(async c=>{
 const token=cookie(request,'rss_login');if(!token)throw unauthorized();
 const r=await c.query('SELECT * FROM operational_login_requests WHERE token_hash=$1 AND expires_at>now() AND consumed=false FOR UPDATE',[digest(token)]);if(!r.rows.length)throw unauthorized();
 if(!r.rows[0].employee)return Response.json({pending:true},{headers:{'Cache-Control':'no-store'}});
 const session=randomBytes(32).toString('hex');await c.query('UPDATE operational_login_requests SET consumed=true WHERE token_hash=$1',[digest(token)]);
 await c.query(`INSERT INTO operational_sessions(token_hash,employee,expires_at) VALUES($1,$2,now()+interval '7 days')`,[digest(session),r.rows[0].employee]);
 return Response.json({ok:true},{headers:{'Cache-Control':'no-store','Set-Cookie':`${cookieName}=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`}});
});}
export async function logout(request:Request){await pool().query('DELETE FROM operational_sessions WHERE token_hash=$1',[digest(cookie(request,cookieName))]);return Response.json({ok:true},{headers:{'Set-Cookie':`${cookieName}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`,'Cache-Control':'no-store'}});}
