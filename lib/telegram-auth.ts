import {DomainError} from "./domain";
async function hmac(key:Uint8Array,value:string){const k=await crypto.subtle.importKey("raw",key as BufferSource,{name:"HMAC",hash:"SHA-256"},false,["sign"]);return new Uint8Array(await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(value)));}
export async function validateTelegram(initData:string,token:string,nowSeconds=Math.floor(Date.now()/1000)){
 if(!initData||!token)throw new DomainError("Откройте приложение из Telegram",401);
 const p=new URLSearchParams(initData);if([...p.keys()].some((k,i,a)=>a.indexOf(k)!==i))throw new DomainError("Некорректные данные входа",401);
 const hash=p.get("hash")||"";p.delete("hash");
 const check=[...p.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>k+"="+v).join("\n");
 const secret=await hmac(new TextEncoder().encode("WebAppData"),token);
 const digest=await hmac(secret,check);const actual=[...digest].map(x=>x.toString(16).padStart(2,"0")).join("");
 let mismatch=actual.length^hash.length;for(let i=0;i<actual.length;i++)mismatch|=actual.charCodeAt(i)^(hash.charCodeAt(i)||0);
 const authDate=Number(p.get("auth_date"));if(mismatch||!Number.isFinite(authDate)||nowSeconds-authDate>3600||authDate>nowSeconds+30)throw new DomainError("Сеанс истёк. Откройте приложение снова.",401);
 try{const user=JSON.parse(p.get("user")||"{}");if(!Number.isSafeInteger(user.id))throw new Error();return user;}catch{throw new DomainError("Не удалось определить Telegram-пользователя",401);}
}
