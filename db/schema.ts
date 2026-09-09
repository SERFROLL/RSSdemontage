import {sqliteTable,text,integer,uniqueIndex,index,primaryKey,foreignKey,check,AnySQLiteColumn} from "drizzle-orm/sqlite-core";
import {sql} from "drizzle-orm";
export const documents=sqliteTable("documents",{
 seq:integer("seq").primaryKey({autoIncrement:true}),namespace:text("namespace").notNull(),documentId:text("document_id").notNull(),version:integer("version").notNull(),
 kind:text("kind").notNull(),pid:text("pid"),date:text("date").notNull(),author:text("author").notNull(),editor:text("editor").notNull(),createdAt:text("created_at").notNull(),
 requestKey:text("request_key").notNull(),requestHash:text("request_hash").notNull(),payload:text("payload").notNull()
},t=>[uniqueIndex("documents_version").on(t.namespace,t.documentId,t.version),uniqueIndex("documents_request").on(t.namespace,t.requestKey),index("documents_kind").on(t.namespace,t.kind),index("documents_pid_date").on(t.namespace,t.pid,t.date)]);
export const notifications=sqliteTable("notifications",{key:text("key").primaryKey(),status:text("status").notNull(),chatId:text("chat_id").notNull(),createdAt:text("created_at").notNull(),messageId:text("message_id"),error:text("error")});
export const accountingDocuments=sqliteTable("accounting_documents",{
 id:text("id").primaryKey(),namespace:text("namespace").notNull(),documentId:text("document_id").notNull(),sourceVersion:integer("source_version").notNull(),sourceSeq:integer("source_seq").notNull().references(()=>documents.seq,{onDelete:"cascade"}),kind:text("kind").notNull(),operationDate:text("operation_date").notNull(),createdAt:text("created_at").notNull(),reversesVersion:integer("reverses_version")
},t=>[uniqueIndex("accounting_documents_source").on(t.namespace,t.documentId,t.sourceVersion)]);
export const stockAccounts=sqliteTable("stock_accounts",{
 id:text("id").primaryKey(),namespace:text("namespace").notNull(),kind:text("kind").notNull(),unit:text("unit").notNull(),ownerPid:text("owner_pid")
},t=>[uniqueIndex("stock_accounts_id_unit").on(t.id,t.unit),check("stock_accounts_unit",sql`${t.unit} in ('mm','g')`),check("stock_accounts_owner",sql`(${t.kind}='pid' and ${t.ownerPid} is not null and ${t.unit}='mm') or (${t.kind}<>'pid' and ${t.ownerPid} is null)`)]);
export const documentLines=sqliteTable("document_lines",{
 id:text("id").primaryKey(),accountingDocumentId:text("accounting_document_id").notNull().references(()=>accountingDocuments.id,{onDelete:"cascade"}),originPid:text("origin_pid").notNull(),cableId:text("cable_id").notNull(),operationDate:text("operation_date").notNull(),lineRole:text("line_role").notNull(),sourceLineId:text("source_line_id").references(():AnySQLiteColumn=>documentLines.id)
},t=>[index("document_lines_origin").on(t.originPid,t.cableId,t.operationDate),index("document_lines_document").on(t.accountingDocumentId)]);
export const quantityValues=sqliteTable("quantity_values",{
 id:text("id").primaryKey(),lineId:text("line_id").notNull().references(()=>documentLines.id,{onDelete:"cascade"}),role:text("role").notNull(),valueKind:text("value_kind").notNull(),unit:text("unit").notNull(),valueBase:integer("value_base").notNull(),formulaCode:text("formula_code"),formulaVersion:integer("formula_version"),sourceReference:text("source_reference")
},t=>[uniqueIndex("quantity_values_role").on(t.lineId,t.role),uniqueIndex("quantity_values_id_unit").on(t.id,t.unit),uniqueIndex("quantity_values_id_line").on(t.id,t.lineId),check("quantity_values_unit",sql`${t.unit} in ('mm','g')`),check("quantity_values_exact",sql`${t.valueBase} between 0 and 9007199254740991`)]);
export const quantityInputs=sqliteTable("quantity_inputs",{
 resultValueId:text("result_value_id").notNull().references(()=>quantityValues.id,{onDelete:"cascade"}),inputValueId:text("input_value_id").notNull().references(()=>quantityValues.id),inputRole:text("input_role").notNull()
},t=>[primaryKey({columns:[t.resultValueId,t.inputRole]})]);
export const ledgerEntries=sqliteTable("ledger_entries",{
 id:text("id").primaryKey(),lineId:text("line_id").notNull().references(()=>documentLines.id,{onDelete:"cascade"}),accountId:text("account_id").notNull(),valueId:text("value_id").notNull(),unit:text("unit").notNull(),sign:integer("sign").notNull(),reversesEntryId:text("reverses_entry_id").references(():AnySQLiteColumn=>ledgerEntries.id)
},t=>[index("ledger_entries_line").on(t.lineId),index("ledger_entries_account").on(t.accountId),check("ledger_entries_sign",sql`${t.sign} in (-1,1)`),foreignKey({columns:[t.accountId,t.unit],foreignColumns:[stockAccounts.id,stockAccounts.unit]}),foreignKey({columns:[t.valueId,t.unit],foreignColumns:[quantityValues.id,quantityValues.unit]}),foreignKey({columns:[t.valueId,t.lineId],foreignColumns:[quantityValues.id,quantityValues.lineId]})]);
export const coilEntries=sqliteTable("coil_entries",{
 id:text("id").primaryKey(),lineId:text("line_id").notNull().references(()=>documentLines.id,{onDelete:"cascade"}),deltaCount:integer("delta_count").notNull(),reversesEntryId:text("reverses_entry_id").references(():AnySQLiteColumn=>coilEntries.id)
});
export const openingBatches=sqliteTable("opening_batches",{
 namespace:text("namespace").notNull(),pid:text("pid").notNull(),accountingDocumentId:text("accounting_document_id").notNull().references(()=>accountingDocuments.id,{onDelete:"cascade"}),pidStockChecked:integer("pid_stock_checked").notNull(),mainStockChecked:integer("main_stock_checked").notNull(),confirmedAt:text("confirmed_at").notNull(),confirmedBy:text("confirmed_by").notNull()
},t=>[primaryKey({columns:[t.namespace,t.pid]}),check("opening_batches_pid_checked",sql`${t.pidStockChecked}=1`),check("opening_batches_main_checked",sql`${t.mainStockChecked}=1`)]);
export const accountingWriteChecks=sqliteTable("accounting_write_checks",{token:text("token").primaryKey(),valid:integer("valid").notNull()},t=>[check("accounting_write_valid",sql`${t.valid}=1`)]);
