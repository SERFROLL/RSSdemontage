import {runtime,safeError} from "@/lib/store";import {runSchedule} from "@/lib/bot";import {must} from "@/lib/domain";
export async function POST(request:Request){try{const e=runtime();must(e.SCHEDULER_SECRET&&request.headers.get("authorization")==="Bearer "+e.SCHEDULER_SECRET,"Неавторизованный запрос",401);return Response.json(await runSchedule());}catch(e){return safeError(e);}}
