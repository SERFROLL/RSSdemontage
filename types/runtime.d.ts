declare module "cloudflare:workers" {export const env: Record<string,any>;}
interface Fetcher {fetch(request:Request):Promise<Response>;}
interface D1Database {prepare(sql:string):any;batch(statements:any[]):Promise<any[]>;}
