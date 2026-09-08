import {sqliteTable,text,integer,uniqueIndex,index} from "drizzle-orm/sqlite-core";
export const documents=sqliteTable("documents",{
 seq:integer("seq").primaryKey({autoIncrement:true}),namespace:text("namespace").notNull(),documentId:text("document_id").notNull(),version:integer("version").notNull(),
 kind:text("kind").notNull(),pid:text("pid"),date:text("date").notNull(),author:text("author").notNull(),editor:text("editor").notNull(),createdAt:text("created_at").notNull(),
 requestKey:text("request_key").notNull(),requestHash:text("request_hash").notNull(),payload:text("payload").notNull()
},t=>[uniqueIndex("documents_version").on(t.namespace,t.documentId,t.version),uniqueIndex("documents_request").on(t.namespace,t.requestKey),index("documents_kind").on(t.namespace,t.kind),index("documents_pid_date").on(t.namespace,t.pid,t.date)]);
export const notifications=sqliteTable("notifications",{key:text("key").primaryKey(),status:text("status").notNull(),chatId:text("chat_id").notNull(),createdAt:text("created_at").notNull(),messageId:text("message_id"),error:text("error")});
