import {timingSafeEqual} from 'node:crypto';
import {digest,pool,transaction,record,localNow,errorResponse} from '@/lib/production-store';
import {validateReferences,postings} from '@/lib/production-domain';
import {requireSameOrigin} from '@/lib/session';
import * as M from '@/lib/concise-model';
import policy from '@/server/operational-bootstrap.json';

// Temporary, least-authority cutover capability: one exact approved payload,
// before a fixed deadline, only into an empty new ledger. No arbitrary SQL or resets.
function authorize(request:Request){
 const actual=Buffer.from(digest(request.headers.get('authorization')?.replace(/^Bearer /,'')||''));
 const expected=Buffer.from(policy.capabilitySha256);
 if(Date.now()>Date.parse(policy.expiresAt)||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Object.assign(Error('Доступ закрыт.'),{status:403});
}
const legacyTables=['documents','notifications','accounting_documents','stock_accounts','document_lines','quantity_values','quantity_inputs','ledger_entries','coil_entries','opening_batches'];
export async function GET(request:Request){try{authorize(request);const backup:Record<string,unknown>={};for(const table of legacyTables){const exists=await pool().query('SELECT to_regclass($1) AS name',[table]);if(exists.rows[0].name)backup[table]=(await pool().query('SELECT * FROM '+table)).rows;}return Response.json({createdAt:new Date().toISOString(),tables:backup},{headers:{'Cache-Control':'no-store','Content-Disposition':'attachment; filename="pre-cutover-backup.json"'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{
 requireSameOrigin(request);authorize(request);const raw=await request.text();
 if(raw.length>5_000_000||digest(raw)!==policy.payloadSha256)throw Error('Этот файл не соответствует проверенному пакету импорта.');
 const input=JSON.parse(raw),s=input.state as M.State;validateReferences(s);
 const actual:Record<string,number>={};for(const p of postings(s).filter(p=>p.unit==='g'&&p.basis==='calculated')){const key=p.warehouse+'|'+p.material;actual[key]=(actual[key]||0)+p.quantity;}
 for(const [key,value] of Object.entries(input.expectedExtractionGrams))if(actual[key]!==value)throw Error('Не сошёлся контроль массы: '+key);
 const result=await transaction(async c=>{
  const previous=await c.query('SELECT request_hash FROM operational_events WHERE request_key=$1',[input.batchId]);
  if(previous.rows.length){if(previous.rows[0].request_hash!==policy.payloadSha256)throw Error('Другой пакет уже импортирован.');return {created:false};}
  if((await c.query('SELECT id FROM operational_state')).rows.length)throw Error('Рабочий учёт уже создан. Повторный начальный ввод запрещён.');
  const tables:Record<string,unknown>={};for(const table of legacyTables){const exists=await c.query('SELECT to_regclass($1) AS name',[table]);if(exists.rows[0].name)tables[table]=(await c.query('SELECT * FROM '+table)).rows;}
  await c.query('INSERT INTO operational_backups(reason,payload) VALUES($1,$2)',['Перед переходом на учёт по МОЛ и ПИД',JSON.stringify(tables)]);
  for(const identity of input.identities)await c.query('INSERT INTO operational_identities(employee,telegram_id,is_admin) VALUES($1,$2,$3)',[identity.employee,identity.telegram_id,identity.is_admin]);
  const next={...s,...localNow()};await record(c,undefined,next,1,input.batchId,policy.payloadSha256,'system:approved-history-import',{manifest:input.manifest,controls:actual});
  const balance=await c.query('SELECT material,unit,SUM(quantity) AS qty FROM operational_postings GROUP BY material,unit HAVING SUM(quantity)<>0');if(balance.rows.length)throw Error('Журнал не сбалансирован.');
  return {created:true,documents:next.documents.length,tasks:next.tasks.length,warehouses:next.warehouses.length};
 });return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
