import {session} from "@/lib/session";
import {safeError,database,hash} from "@/lib/store";
import {assignments,balances,summary,expectedReports,adjustmentReviews,today,isAdmin} from "@/lib/domain";
export async function GET(request:Request){try{
 const s=await session(request);const date=new URL(request.url).searchParams.get("date")||today();
 const global=isAdmin(s.actor)||s.actor.roles.some(x=>["observer","warehouse"].includes(x));
 const pids=new Set(assignments(s.docs,s.actor.id,undefined,date).map(x=>x.data.pid));
 // Old own reports remain accessible after reassignment.
 for(const d of s.docs)if(d.author===s.actor.id&&d.pid)pids.add(d.pid);
 const docs=s.docs.filter(d=>d.kind==="draft"?d.author===s.actor.id:d.kind==="export"?isAdmin(s.actor):(!d.pid||global||pids.has(d.pid)));
 const visible=docs.map(d=>d.kind==="user"&&!isAdmin(s.actor)?{...d,data:{name:d.data.name,roles:d.data.roles,active:d.data.active}}:d);
 // Reset markers are operational metadata. Return only an epoch, never their payload or errors.
 const reset=s.demo?null:await database().prepare("SELECT created_at FROM notifications WHERE key LIKE ? AND status IN ('reset_done','reset_pending_audio') ORDER BY created_at DESC LIMIT 1").bind("maintenance:reset:%").first();
 const dataEpoch=reset?.created_at||"initial",draftScope=await hash(s.namespace);
 return Response.json({accountingVersion:2,dataEpoch,draftScope,demo:s.demo,actor:s.actor,date,docs:visible,balances:balances(docs,date),summary:summary(docs,date),expected:expectedReports(docs,date),reviewIds:adjustmentReviews(docs).map(x=>x.id)}, {headers:{"Cache-Control":"no-store"}});
 }catch(e){return safeError(e);}}
