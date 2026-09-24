import {timingSafeEqual} from 'node:crypto';
import {digest,transaction,row,record,errorResponse} from '@/lib/production-store';
import {applyPidMetadata} from '@/lib/pid-metadata';
import {requireSameOrigin} from '@/lib/session';
import policy from '@/server/pid-metadata-policy.json';
// One sealed owner-supplied metadata patch. No arbitrary data, credentials,
// assignments or stock can be changed. Replays return the original receipt.
export async function POST(request:Request){try{
 requireSameOrigin(request);
 const actual=Buffer.from(digest(request.headers.get('authorization')?.replace(/^Bearer /,'')||'')),expected=Buffer.from(policy.capabilitySha256);
 if(Date.now()>Date.parse(policy.expiresAt)||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Object.assign(Error('Доступ закрыт.'),{status:403});
 const raw=await request.text();if(raw.length>100_000||digest(raw)!==policy.payloadSha256)throw Error('Файл не соответствует согласованным данным ПИД.');
 const input=JSON.parse(raw);
 const result=await transaction(async c=>{
  const old=await c.query('SELECT payload FROM operational_events WHERE request_key=$1',[policy.batchId]);
  if(old.rows.length)return {...old.rows[0].payload.receipt,applied:false};
  const current=await row(c),next=applyPidMetadata(current.payload,input.pids);
  const withoutPids=({pids,...rest}:typeof next)=>rest;
  const unchanged=digest(JSON.stringify(withoutPids(current.payload)))===digest(JSON.stringify(withoutPids(next)));
  if(!unchanged)throw Error('Изменены данные вне справочника ПИД.');
  const receipt={applied:true,count:input.pids.length,revision:current.revision+1,accountingUnchanged:true,documents:next.documents.length,tasks:next.tasks.length,pids:next.pids,previousPids:current.payload.pids};
  await c.query('INSERT INTO operational_backups(reason,payload) VALUES($1,$2)',['Перед загрузкой населённых пунктов и статусов ПИД',JSON.stringify({revision:current.revision,payload:current.payload})]);
  await record(c,current.payload,next,current.revision+1,policy.batchId,policy.payloadSha256,'system:owner-pid-metadata',{receipt});
  return receipt;
 });return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
