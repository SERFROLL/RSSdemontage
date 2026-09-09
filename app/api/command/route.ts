import {session,requireSameOrigin} from "@/lib/session";
import {saveDoc,saveInitialization,replay,hash,safeError} from "@/lib/store";
import {prepareCommand,must} from "@/lib/domain";
import {prepareInitialization} from "@/lib/initialization";
export async function POST(request:Request){try{requireSameOrigin(request);const text=await request.text();must(text.length<200000,"Слишком большой запрос");const cmd=JSON.parse(text);const s=await session(request);const key=s.actor.id+":"+cmd.requestId;const digest=await hash(text);const prior=await replay(s.namespace,key,digest);if(prior)return Response.json({doc:prior,replayed:true});
 if(cmd.data?.audioId)must(s.docs.some(d=>d.id===cmd.data.audioId&&d.kind==="audio"&&d.author===s.actor.id),"Аудиозапись недоступна",403);
 if(cmd.action==="initialize"){const prepared=prepareInitialization(s.docs,s.actor,cmd);return Response.json({doc:await saveInitialization(s.namespace,prepared.marker,prepared.documents,key,digest,s.actor.id)});}
 const doc=prepareCommand(s.docs,s.actor,cmd);return Response.json({doc:await saveDoc(s.namespace,doc,key,digest,s.actor.id)});
 }catch(e){return safeError(e);}}
