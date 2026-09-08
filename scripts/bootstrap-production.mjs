// Produce an administrator seed for explicit import on the production host.
import {writeFileSync,mkdirSync} from "node:fs";
const id=process.env.ADMIN_TELEGRAM_ID;
if(!/^\d{5,20}$/.test(id||""))throw new Error("Set ADMIN_TELEGRAM_ID to the verified owner's numeric Telegram ID");
const now=new Date().toISOString(),payload=JSON.stringify({name:process.env.ADMIN_NAME||"Администратор",roles:["admin","observer"],telegramId:id,active:true});
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const values=["production","admin:owner",1,"user",null,now.slice(0,10),"admin:owner","admin:owner",now,"bootstrap-owner","bootstrap",payload];
const sql="INSERT INTO documents(namespace,document_id,version,kind,pid,date,author,editor,created_at,request_key,request_hash,payload) VALUES ("+values.map(x=>x===null?"NULL":typeof x==="number"?x:quote(x)).join(",")+");\n";
mkdirSync("outputs",{recursive:true});
writeFileSync("outputs/bootstrap-admin.sql",sql,{mode:0o600});
console.log("Administrator seed written to outputs/bootstrap-admin.sql. Review and import once into the production database.");
