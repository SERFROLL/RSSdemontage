import {runtime} from './store';
import * as M from './concise-model';
import {applyChanges,postings,validateReferences,type Principal} from './production-domain';
import {createHash} from 'node:crypto';
export const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
export function pool(){const p=runtime().pool;if(!p)throw Object.assign(Error('Рабочая база PostgreSQL не подключена.'),{status:503});return p;}
export function localNow(now=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);const get=(name:string)=>parts.find(p=>p.type===name)!.value;return {today:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};}
export async function transaction<T>(run:(client:any)=>Promise<T>):Promise<T>{const c=await pool().connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(724203)');const result=await run(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function row(client=pool()){const r=await client.query('SELECT revision,payload FROM operational_state WHERE id=1');if(!r.rows[0])throw Object.assign(Error('Новая рабочая база ещё не загружена.'),{status:503});return r.rows[0] as {revision:number;payload:M.State};}
export async function record(client:any,old:M.State|undefined,next:M.State,revision:number,key:string,hash:string,actor:string,event:unknown){
 validateReferences(next);
 await client.query('INSERT INTO operational_events(revision,request_key,request_hash,actor,payload) VALUES($1,$2,$3,$4,$5)',[revision,key,hash,actor,JSON.stringify(event)]);
 const changed=next.documents.filter(d=>JSON.stringify(d)!==JSON.stringify(old?.documents.find(x=>x.id===d.id)));
 for(const d of changed){
  await client.query('INSERT INTO operational_document_versions(document_id,revision,payload) VALUES($1,$2,$3)',[d.id,revision,JSON.stringify(d)]);
  const previous=await client.query(`SELECT p.* FROM operational_postings p WHERE document_id=$1 AND reverses IS NULL AND NOT EXISTS(SELECT 1 FROM operational_postings r WHERE r.reverses=p.id)`,[d.id]);
  for(const p of previous.rows)await client.query('INSERT INTO operational_postings(revision,document_id,effective_date,warehouse,material,unit,quantity,reverses) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[revision,d.id,p.effective_date,p.warehouse,p.material,p.unit,-Number(p.quantity),p.id]);
 }
 const ids=new Set(changed.map(d=>d.id)),legs=postings(next).filter(p=>ids.has(p.document));
 // Explicit source/conversion accounts balance each material and unit independently.
 const totals=new Map<string,{document:string;date:string;material:string;unit:string;quantity:number}>();
 for(const p of legs){const k=p.document+'|'+p.date+'|'+p.material+'|'+p.unit;const old=totals.get(k);totals.set(k,{...p,quantity:p.quantity+(old?.quantity||0)});}
 const balanced=[...legs,...[...totals.values()].filter(t=>t.quantity).map(t=>({...t,warehouse:'system:source-or-conversion',quantity:-t.quantity}))];
 for(const p of balanced)await client.query('INSERT INTO operational_postings(revision,document_id,effective_date,warehouse,material,unit,quantity) VALUES($1,$2,$3,$4,$5,$6,$7)',[revision,p.document,p.date,p.warehouse,p.material,p.unit,p.quantity]);
 await client.query(`INSERT INTO operational_state(id,revision,payload) VALUES(1,$1,$2) ON CONFLICT(id) DO UPDATE SET revision=EXCLUDED.revision,payload=EXCLUDED.payload,updated_at=now()`,[revision,JSON.stringify(next)]);
}
export async function ensureTasks(){return transaction(async c=>{
 const current=await row(c),clock=localNow();let s={...current.payload,...clock};
 const last=current.payload.generated.filter(x=>x>=current.payload.today).sort().at(-1)||current.payload.today;
 for(const date of M.dateRange(last,clock.today))s=M.generate(s,date,date===clock.today?clock.hour:23);
 if(s.tasks.length!==current.payload.tasks.length){await record(c,current.payload,s,current.revision+1,'schedule:'+clock.today+':'+current.revision,digest(JSON.stringify(s.tasks)),'system',{kind:'scheduled_tasks',dates:s.generated.filter(d=>!current.payload.generated.includes(d))});return {revision:current.revision+1,payload:s};}
 return {...current,payload:s};
});}
export async function mutate(input:{revision:number;requestId:string;patches:unknown},p:Principal){
 if(!Number.isInteger(input.revision)||!/^[-a-zA-Z0-9:]{10,160}$/.test(input.requestId))throw Error('Некорректный запрос.');
 const hash=digest(JSON.stringify({patches:input.patches,actor:p.employee}));
 return transaction(async c=>{
  const old=await c.query('SELECT request_hash,actor FROM operational_events WHERE request_key=$1',[input.requestId]);
  if(old.rows.length){if(old.rows[0].request_hash!==hash||old.rows[0].actor!==p.employee)throw Object.assign(Error('Повторный запрос отличается от сохранённого.'),{status:409});return row(c);}
  const current=await row(c);if(current.revision!==input.revision)throw Object.assign(Error('Данные изменились у другого сотрудника. Обновите экран и проверьте ввод.'),{status:409});
  const next=applyChanges({...current.payload,...localNow()},input.patches,p);
  await record(c,current.payload,next,current.revision+1,input.requestId,hash,p.employee,input.patches);
  return {revision:current.revision+1,payload:next};
 });
}
export function errorResponse(error:unknown){const e=error as {status?:number;message?:string;issues?:unknown;code?:string};if(e.issues)return Response.json({error:'Проверьте значения полей.'},{status:400});if(e.code==='23505')return Response.json({error:'Такая запись или Telegram ID уже используется.'},{status:409});const status=e.status||400;return Response.json({error:status>=500?'Сервис временно недоступен. Данные не потеряны.':e.message||'Не удалось выполнить операцию.'},{status,headers:{'Cache-Control':'no-store'}});}
