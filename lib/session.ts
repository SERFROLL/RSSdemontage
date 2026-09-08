import {readDocs,runtime,seed} from "./store";
import {DomainError,type Actor} from "./domain";
import {demoDocs} from "./seed";
import {validateTelegram} from "./telegram-auth";
export async function session(request:Request){
 const env=runtime();
 if(env.APP_MODE==="demo"){
  const owner=request.headers.get("oai-authenticated-user-id");if(!owner)throw new DomainError("Для проверочного стенда войдите через ChatGPT",401);
  const namespace="demo:"+owner;await seed(namespace,demoDocs());const docs=await readDocs(namespace);
  const id=request.headers.get("x-demo-user")||"demo-admin";
  const user=docs.find(d=>d.kind==="user"&&d.id===id&&d.data.active!==false);if(!user)throw new DomainError("Пользователь отключён",403);
  return {namespace,docs,actor:{id:user.id,name:user.data.name,roles:user.data.roles} as Actor,demo:true};
 }
 if(env.APP_MODE!=="production")throw new DomainError("Рабочий режим ещё не настроен",503);
 const user=await validateTelegram(request.headers.get("x-telegram-init-data")||"",env.TELEGRAM_BOT_TOKEN||"");
 const docs=await readDocs("production");const member=docs.find(d=>d.kind==="user"&&d.data.telegramId===String(user.id)&&d.data.active!==false);
 if(!member)throw new DomainError("Доступ ещё не назначен. Ваш Telegram ID: "+user.id,403);
 return {namespace:"production",docs,actor:{id:member.id,name:member.data.name,roles:member.data.roles} as Actor,demo:false};
}
export function requireSameOrigin(request:Request){const origin=request.headers.get("origin");if(origin&&origin!==new URL(request.url).origin)throw new DomainError("Недопустимый источник запроса",403);if(request.headers.get("sec-fetch-site")==="cross-site")throw new DomainError("Недопустимый источник запроса",403);}
