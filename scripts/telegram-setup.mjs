// Run only on the selected production host. All secrets come from the environment.
const required=["TELEGRAM_BOT_TOKEN","TELEGRAM_WEBHOOK_SECRET","MINI_APP_URL"];
for(const k of required)if(!process.env[k])throw new Error("Missing "+k);
const origin=new URL(process.env.MINI_APP_URL);if(origin.protocol!=="https:")throw new Error("HTTPS is required");
async function call(method,body){try{const r=await fetch("https://api.telegram.org/bot"+process.env.TELEGRAM_BOT_TOKEN+"/"+method,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const d=await r.json();if(!d.ok)throw new Error();return d.result;}catch{throw new Error("Telegram setup failed at "+method+"; no credentials logged");}}
const info=await call("getWebhookInfo",{});
if(info.url&&info.url!==new URL("/api/telegram",origin).href)throw new Error("Another webhook exists. Inspect before changing it.");
await call("setWebhook",{url:new URL("/api/telegram",origin).href,secret_token:process.env.TELEGRAM_WEBHOOK_SECRET,allowed_updates:["message"],drop_pending_updates:false});
await call("setChatMenuButton",{menu_button:{type:"web_app",text:"Открыть учёт",web_app:{url:origin.href}}});
console.log("Webhook and Mini App menu configured. No messages sent.");
