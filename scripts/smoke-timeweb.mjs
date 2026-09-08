import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
const url=process.env.SMOKE_URL || "http://127.0.0.1:8080";
if(!["localhost","127.0.0.1"].includes(new URL(url).hostname))throw new Error("Smoke checks are restricted to the local test container");
let ready=false;
for(let attempt=0;attempt<60;attempt++){
 try{if((await fetch(url+"/api/health")).ok){ready=true;break;}}catch{}
 await new Promise(resolve=>setTimeout(resolve,1000));
}
assert.ok(ready,"Container did not become healthy");
assert.equal((await fetch(url)).status,200);
assert.equal((await fetch(url+"/api/state",{headers:{"oai-authenticated-user-id":"forged-owner","x-demo-user":"demo-admin"}})).status,401);
const params=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)),user:JSON.stringify({id:123456789,first_name:"Test owner"})});
const check=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`).join("\n");
const key=createHmac("sha256","WebAppData").update(process.env.TELEGRAM_BOT_TOKEN).digest();
params.set("hash",createHmac("sha256",key).update(check).digest("hex"));
const auth={"x-telegram-init-data":params.toString()};
const response=await fetch(url+"/api/state",{headers:auth});assert.equal(response.status,200);
const state=await response.json();assert.ok(state.docs.some(d=>d.kind==="user"&&d.data.telegramId==="123456789"));
if(process.env.SMOKE_EXPECT_SAVED==="true"){
 assert.ok(state.docs.some(d=>d.id==="pid:SMOKE-1"),"Saved production record did not survive restart");
}else{
 const saved=await fetch(url+"/api/command",{method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify({action:"pid",requestId:"smoke-persistence",data:{code:"SMOKE-1",cutoff:"2026-01-01"}})});
 assert.equal(saved.status,200,await saved.text());
}
assert.equal((await fetch(url+"/api/command",{method:"POST",headers:{...auth,origin:"https://attacker.invalid"},body:"{}"})).status,403);
assert.equal((await fetch(url+"/api/scheduler",{method:"POST"})).status,401);
assert.equal((await fetch(url+"/api/telegram",{method:"POST",body:"{}"})).status,401);
console.log("Timeweb container: health, page, Telegram authentication and access boundaries passed.");
