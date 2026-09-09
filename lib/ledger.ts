import type {Doc} from "./domain";

// One pure projection is used both for the persistent journal and the screen balances.
// A source version is never overwritten: its successor reverses it and posts a replacement.
export type Unit="mm"|"g";
export type Quantity={role:string;unit:Unit;amount:number;kind:string;formula?:string;inputs?:string[];reference?:string};
export type Posting={account:string;value:string;sign:1|-1};
export type AccountingLine={key:string;pid:string;cableId:string;date:string;role:string;sourceLine?:string;values:Quantity[];postings:Posting[];coils:number};
export const accountingKinds=["opening","initialization","report","trip","adjustment"];
export function projectDocument(d:Doc):AccountingLine[]{
 const result:AccountingLine[]=[];
 if(!d.pid)return result;
 const add=(key:string,cableId:string,date:string,role:string,values:Quantity[],postings:Posting[],coils=0,sourceLine?:string)=>{
  for(const q of values)if(!Number.isSafeInteger(q.amount)||q.amount<0)throw new Error("Invalid immutable quantity");
  if(!Number.isSafeInteger(coils))throw new Error("Invalid coil count");
  for(const unit of ["mm","g"]){const total=postings.reduce((n,p)=>{const q=values.find(v=>v.role===p.value);if(!q)throw new Error("Missing posting quantity");return n+(q.unit===unit?p.sign*q.amount:0);},0);if(total!==0)throw new Error("Unbalanced accounting line");}
  result.push({key,pid:d.pid!,cableId,date,role,values,postings,coils,sourceLine});
 };
 const pair=(key:string,cableId:string,amount:number,unit:Unit,from:string,to:string,role:string,kind:string,coils=0)=>add(key,cableId,d.date,role,[{role:"quantity",unit,amount:Math.abs(amount),kind}],[{account:from,value:"quantity",sign:amount<0?1:-1},{account:to,value:"quantity",sign:amount<0?-1:1}],coils);
 if(d.kind==="initialization"&&d.data.schemaVersion===2)for(const [i,l] of d.data.lines.entries()){
  const unit=l.location==="warehouse"?"g":"mm";
  pair("opening:"+(l.id||i),l.cableId,unit==="g"?l.grams:l.mm,unit,"opening",l.location,"opening",unit==="g"?"opening_document":"opening_estimate");
 }
 if(d.kind==="opening")pair("legacy-opening",d.data.cableId,d.data.mm||0,"mm","opening","pid","legacy_opening","legacy_document",d.data.coils||0);
 if(d.kind==="report"&&d.data.status==="work"){
  if(d.data.category==="excavation")pair("extraction",d.data.cableId,d.data.cableMm,"mm","extraction","pid","extraction","estimate");
  if(d.data.category==="winding")for(const [i,l] of d.data.lines.entries())add("winding:"+i,l.cableId,d.date,"winding",[],[],l.count);
 }
 if(d.kind==="adjustment"){
  const warehouse=d.data.location==="warehouse";
  pair("adjustment",d.data.cableId,warehouse?(d.data.deltaGrams||0):(d.data.deltaMm||0),warehouse?"g":"mm","adjustment",warehouse?"warehouse":"pid","adjustment","verified_adjustment",warehouse?0:(d.data.deltaCoils||0));
 }
 if(d.kind==="trip")for(const c of d.data.coils){
  const dispatchKey="dispatch:"+c.id,k=c.coefficient;
  const values:Quantity[]=[{role:"mass",unit:"g",amount:c.grams,kind:"measured_net"},{role:"length",unit:"mm",amount:c.sentMm,kind:"calculated",formula:"round(mass*sample_length/sample_mass)",inputs:["mass",...(k?["sample_length","sample_mass"]:[])]}];
  if(k)values.push({role:"sample_length",unit:"mm",amount:k.sampleMm,kind:"control_sample",reference:k.id?JSON.stringify([k.id,k.version]):"legacy_snapshot"},{role:"sample_mass",unit:"g",amount:k.sampleGrams,kind:"control_sample",reference:k.id?JSON.stringify([k.id,k.version]):"legacy_snapshot"});
  add(dispatchKey,c.cableId,d.date,"dispatch",values,[{account:"pid",value:"length",sign:-1},{account:"conversion",value:"length",sign:1},{account:"conversion",value:"mass",sign:-1},{account:"transit",value:"mass",sign:1}],-1);
  if(d.data.receipt){
   const received=d.data.receipt.weights[c.id];
   const difference=c.grams-received;
   add("receipt:"+c.id,c.cableId,d.data.receipt.date,"receipt",[{role:"sent",unit:"g",amount:c.grams,kind:"dispatch_snapshot"},{role:"received",unit:"g",amount:received,kind:"measured_net"},{role:"difference",unit:"g",amount:Math.abs(difference),kind:"calculated",formula:"abs(sent-received)",inputs:["sent","received"]}],[{account:"transit",value:"sent",sign:-1},{account:"warehouse",value:"received",sign:1},{account:"discrepancy",value:"difference",sign:difference<0?-1:1}],0,dispatchKey);
  }
 }
 return result;
}

export function journalId(namespace:string,doc:Doc,...parts:(string|number)[]){return JSON.stringify([namespace,doc.id,doc.version,...parts]);}

// Statements must be committed in the same transaction as the source document.
// Every child is selected through the immutable source key. Missing/stale writes are
// rejected by store.ts before any journal row can be committed.
export function journalStatements(db:any,namespace:string,doc:Doc,previous?:Doc):any[]{
 if(!accountingKinds.includes(doc.kind))return [];
 const pending:{sql:string;args:any[]}[]=[],jid=journalId(namespace,doc),lines=projectDocument(doc),oldLines=previous?projectDocument(previous):[];
 const insert=(sql:string,...args:any[])=>pending.push({sql,args});
 // source_seq comes from the guarded source insert, never a later mutable UPDATE.
 insert("INSERT OR IGNORE INTO accounting_documents (id,namespace,document_id,source_version,source_seq,kind,operation_date,created_at,reverses_version) SELECT ?,?,?,?,seq,?,?,?,? FROM documents WHERE namespace=? AND document_id=? AND version=?",jid,namespace,doc.id,doc.version,doc.kind,doc.date,doc.createdAt,previous?.version??null,namespace,doc.id,doc.version);
 const emit=(line:AccountingLine,reversal:boolean)=>{
  const lid=journalId(namespace,doc,reversal?"reversal":"line",line.key);
  insert("INSERT OR IGNORE INTO document_lines (id,accounting_document_id,origin_pid,cable_id,operation_date,line_role,source_line_id) VALUES (?,?,?,?,?,?,?)",lid,jid,line.pid,line.cableId,line.date,reversal?"reversal:"+line.role:line.role,line.sourceLine?journalId(namespace,doc,reversal?"reversal":"line",line.sourceLine):null);
  for(const q of line.values)insert("INSERT OR IGNORE INTO quantity_values (id,line_id,role,value_kind,unit,value_base,formula_code,formula_version,source_reference) VALUES (?,?,?,?,?,?,?,?,?)",lid+":"+q.role,lid,q.role,q.kind,q.unit,q.amount,q.formula??null,q.formula?1:null,q.reference??null);
  for(const q of line.values)for(const input of q.inputs||[])insert("INSERT OR IGNORE INTO quantity_inputs (result_value_id,input_value_id,input_role) VALUES (?,?,?)",lid+":"+q.role,lid+":"+input,input);
  line.postings.forEach((p,i)=>{
   const quantity=line.values.find(q=>q.role===p.value)!;
   const accountId=JSON.stringify([namespace,p.account,quantity.unit,p.account==="pid"?line.pid:""]);
   insert("INSERT OR IGNORE INTO stock_accounts (id,namespace,kind,unit,owner_pid) VALUES (?,?,?,?,?)",accountId,namespace,p.account,quantity.unit,p.account==="pid"?line.pid:null);
   insert("INSERT OR IGNORE INTO ledger_entries (id,line_id,account_id,value_id,unit,sign,reverses_entry_id) VALUES (?,?,?,?,?,?,?)",lid+":"+i,lid,accountId,lid+":"+p.value,quantity.unit,reversal?-p.sign:p.sign,reversal?journalId(namespace,previous!,"line",line.key)+":"+i:null);
  });
  if(line.coils)insert("INSERT OR IGNORE INTO coil_entries (id,line_id,delta_count,reverses_entry_id) VALUES (?,?,?,?)",lid+":coils",lid,reversal?-line.coils:line.coils,reversal?journalId(namespace,previous!,"line",line.key)+":coils":null);
 };
 oldLines.forEach(l=>emit(l,true));lines.forEach(l=>emit(l,false));
 if(doc.kind==="initialization"&&doc.data.schemaVersion===2)insert("INSERT OR IGNORE INTO opening_batches (namespace,pid,accounting_document_id,pid_stock_checked,main_stock_checked,confirmed_at,confirmed_by) VALUES (?,?,?,?,?,?,?)",namespace,doc.pid,jid,1,1,doc.createdAt,doc.author);
 // Keep dependency order, but combine rows of the same table. Ninety bind values
 // fit the D1 limit and also avoid thousands of PostgreSQL network round trips.
 const groups=new Map<string,any[][]>();
 for(const p of pending){if(!groups.has(p.sql))groups.set(p.sql,[]);groups.get(p.sql)!.push(p.args);}
 const statements:any[]=[];
 for(const [sql,allRows] of groups){
  const match=/^(INSERT OR IGNORE INTO \w+ \([^)]+\) VALUES )(\([?,]+\))$/.exec(sql);
  if(!match){for(const args of allRows)statements.push(db.prepare(sql).bind(...args));continue;}
  const seen=new Set<string>(),rows=allRows.filter(args=>{const key=JSON.stringify(args);if(seen.has(key))return false;seen.add(key);return true;});
  const size=Math.max(1,Math.floor(90/rows[0].length));
  for(let i=0;i<rows.length;i+=size){const chunk=rows.slice(i,i+size);statements.push(db.prepare(match[1]+chunk.map(()=>match[2]).join(",")).bind(...chunk.flat()));}
 }
 return statements;
}
