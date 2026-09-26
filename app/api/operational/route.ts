import {runtime} from '@/lib/store';
import {authenticate} from '@/lib/production-auth';
import {ensureTasks,mutate,errorResponse} from '@/lib/production-store';
import {requireSameOrigin} from '@/lib/session';
import {observerState} from '@/lib/observer-state';
export async function GET(request:Request){try{const user=await authenticate(request);const result=await ensureTasks();return Response.json({...result,payload:user.observer?observerState(result.payload):result.payload,user,shortDomainReady:runtime().SHORT_DOMAIN_READY==='true'},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{requireSameOrigin(request);const user=await authenticate(request);const body=await request.text();if(body.length>2_000_000)throw Error('Слишком большой запрос.');const result=await mutate(JSON.parse(body),user);return Response.json({...result,user},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
