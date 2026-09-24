import {beginLogin,approveLogin,finishLogin,logout} from '@/lib/production-auth';
import {requireSameOrigin} from '@/lib/session';
import {errorResponse} from '@/lib/production-store';
export async function POST(request:Request){try{requireSameOrigin(request);const b=await request.json();if(b.action==='start')return await beginLogin(request);if(b.action==='approve')return await approveLogin(request,String(b.code||''));if(b.action==='finish')return await finishLogin(request);if(b.action==='logout')return await logout(request);throw Error('Неизвестное действие.');}catch(e){return errorResponse(e);}}
