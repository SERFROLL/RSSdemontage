import {session} from "@/lib/session";
import {database,safeError} from "@/lib/store";
import {allowed} from "@/lib/domain";

export async function GET(request:Request){try{
 const s=await session(request);allowed(s.actor,"admin");
 const queries:Record<string,string>={
  documents:"SELECT * FROM documents WHERE namespace=? ORDER BY seq",
  accounting_documents:"SELECT * FROM accounting_documents WHERE namespace=? ORDER BY source_seq",
  stock_accounts:"SELECT * FROM stock_accounts WHERE namespace=? ORDER BY id",
  document_lines:"SELECT l.* FROM document_lines l JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? ORDER BY l.id",
  quantity_values:"SELECT q.* FROM quantity_values q JOIN document_lines l ON l.id=q.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? ORDER BY q.id",
  quantity_inputs:"SELECT i.* FROM quantity_inputs i JOIN quantity_values q ON q.id=i.result_value_id JOIN document_lines l ON l.id=q.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? ORDER BY i.result_value_id,i.input_role",
  ledger_entries:"SELECT e.* FROM ledger_entries e JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? ORDER BY e.id",
  coil_entries:"SELECT e.* FROM coil_entries e JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents d ON d.id=l.accounting_document_id WHERE d.namespace=? ORDER BY e.id",
  opening_batches:"SELECT * FROM opening_batches WHERE namespace=? ORDER BY pid",
 };
 // The adapter serializes this batch with writes, so source versions and their
 // postings belong to the same consistent backup even during active reporting.
 const names=Object.keys(queries),results=await database().batch(names.map(name=>database().prepare(queries[name]).bind(s.namespace)));
 const tables=Object.fromEntries(names.map((name,i)=>[name,results[i].results]));
 return Response.json({format:"pid-ledger-backup/2",accountingVersion:2,generatedAt:new Date().toISOString(),documents:tables.documents,journal:Object.fromEntries(Object.entries(tables).filter(([name])=>name!=="documents"))},{headers:{"Content-Disposition":'attachment; filename="pid-ledger-backup.json"',"Cache-Control":"no-store"}});
 }catch(e){return safeError(e);}}
