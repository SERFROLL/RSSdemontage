import {env} from "cloudflare:workers";
import type {Doc} from "./domain";
import {DomainError} from "./domain";
export function runtime():any{return env;}
export function database():any{if(!runtime().DB)throw new DomainError("Хранилище временно недоступно",503);return runtime().DB;}
export function fromRow(r:any):Doc{return {id:r.document_id,kind:r.kind,version:r.version,pid:r.pid,date:r.date,author:r.author,createdAt:r.created_at,seq:r.seq,data:JSON.parse(r.payload)};}
export async function readDocs(namespace:string):Promise<Doc[]>{
 const r=await database().prepare("SELECT d.* FROM documents d WHERE d.namespace=? AND d.version=(SELECT MAX(v.version) FROM documents v WHERE v.namespace=d.namespace AND v.document_id=d.document_id) ORDER BY d.seq").bind(namespace).all();return r.results.map(fromRow);
}
export async function history(namespace:string,id?:string):Promise<any[]>{
 const sql=id?"SELECT * FROM documents WHERE namespace=? AND document_id=? ORDER BY version DESC LIMIT 100":"SELECT * FROM documents WHERE namespace=? AND kind NOT IN ('draft','export') ORDER BY seq DESC LIMIT 150";
 const r=await database().prepare(sql).bind(...(id?[namespace,id]:[namespace])).all();return r.results.map((x:any)=>({...fromRow(x),editor:x.editor}));
}
export async function hash(value:string){return [...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,"0")).join("");}
export async function replay(namespace:string,key:string,digest:string){const old=await database().prepare("SELECT * FROM documents WHERE namespace=? AND request_key=?").bind(namespace,key).first();if(old){if(old.request_hash!==digest)throw new DomainError("Повторный запрос содержит другие данные",409);return fromRow(old);}return null;}
export async function saveDoc(namespace:string,doc:Doc,key:string,digest:string,editor:string):Promise<Doc>{
 // The guarded insert and unique index make optimistic writes atomic. All history is append-only.
 const stmt=database().prepare("INSERT INTO documents (namespace,document_id,version,kind,pid,date,author,editor,created_at,request_key,request_hash,payload) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE COALESCE((SELECT MAX(version) FROM documents WHERE namespace=? AND document_id=?),0)=? AND NOT EXISTS (SELECT 1 FROM documents WHERE namespace=? AND pid=? AND seq>? AND kind IN ('report','trip','opening','adjustment')) RETURNING *");
 try{const r=await stmt.bind(namespace,doc.id,doc.version,doc.kind,doc.pid,doc.date,doc.author,editor,doc.createdAt,key,digest,JSON.stringify(doc.data),namespace,doc.id,doc.version-1,namespace,doc.kind==="adjustment"?doc.pid:null,doc.data.checkedSeq||0).first();if(!r)throw new DomainError("Запись изменилась в другом окне. Обновите данные.",409);return fromRow(r);}
 catch(e){const retry=await replay(namespace,key,digest);if(retry)return retry;if(e instanceof DomainError)throw e;throw new DomainError("Не удалось сохранить запись. Обновите данные и повторите.",409);}
}
export async function seed(namespace:string,docs:Doc[]){
 const any=await database().prepare("SELECT seq FROM documents WHERE namespace=? LIMIT 1").bind(namespace).first();if(any)return;
 const commands=docs.map(d=>database().prepare("INSERT OR IGNORE INTO documents (namespace,document_id,version,kind,pid,date,author,editor,created_at,request_key,request_hash,payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(namespace,d.id,1,d.kind,d.pid,d.date,d.author,d.author,d.createdAt,"seed:"+d.id,"seed",JSON.stringify(d.data)));
 await database().batch(commands);
}
export function safeError(e:unknown){const known=e instanceof DomainError;if(!known)console.error("Application request failed",e instanceof Error?e.name:"UnknownError");return Response.json({error:known?e.message:"Не удалось выполнить действие. Введённые данные сохранены в форме."},{status:known?e.status:500,headers:{"Cache-Control":"no-store"}});}
