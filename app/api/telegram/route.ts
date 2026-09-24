import {runtime,safeError} from "@/lib/store";import {handleUpdate} from "@/lib/bot";import {must} from "@/lib/domain";
import {operationalEnabled,operationalStart} from '@/lib/operational-bot';
export async function POST(request:Request){try{const e=runtime();must(e.TELEGRAM_WEBHOOK_SECRET&&request.headers.get("x-telegram-bot-api-secret-token")===e.TELEGRAM_WEBHOOK_SECRET,"Неавторизованный запрос",401);const update=await request.json();if(await operationalEnabled())await operationalStart(update);else await handleUpdate(update);return Response.json({ok:true});}catch(e){return safeError(e);}}
