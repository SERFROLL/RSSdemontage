// Manual, explicitly authorized conversion of this app's disposable data to a test season.
// Run from the application root. No credentials are printed or transferred.
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {createPool}=await import(new URL('./server/postgres.mjs','file://'+process.cwd()+'/'));
const pack=fs.readFileSync('season-dataset.json.gz'),expected=JSON.parse(fs.readFileSync('season-result.json','utf8'));
assert.equal(createHash('sha256').update(pack).digest('hex'),expected.datasetSha256,'Dataset checksum');
const data=JSON.parse(gunzipSync(pack));assert.equal(data.format,'season-simulation/1');
assert.equal(process.env.ADMIN_TELEGRAM_ID,'459770971');assert.equal(process.env.APP_MODE,'production');assert.notEqual(process.env.BOT_ENABLED,'true');
const pool=createPool(),c=await pool.connect(),marker='maintenance:reset:season-2026-06-08-v1';
try{
 await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='15s'");await c.query('SELECT pg_advisory_xact_lock(724201)');
 if((await c.query('SELECT 1 FROM notifications WHERE key=$1',[marker])).rowCount){await c.query('ROLLBACK');console.log('SEASON_ALREADY_IMPORTED');}
 else{
 await c.query('LOCK TABLE documents IN ACCESS EXCLUSIVE MODE');
 const users=(await c.query("SELECT DISTINCT ON(document_id) document_id,payload FROM documents WHERE namespace='production' AND kind='user' ORDER BY document_id,version DESC")).rows;
 assert.ok(users.some(u=>{const p=JSON.parse(u.payload);return p.telegramId==='459770971'&&p.active!==false&&p.roles.includes('admin')}),'Owner account missing');
 for(const t of ['quantity_inputs','ledger_entries','coil_entries','quantity_values','opening_batches','document_lines','accounting_documents','stock_accounts']){
 const where=t==='quantity_inputs'?"result_value_id IN (SELECT q.id FROM quantity_values q JOIN document_lines l ON l.id=q.line_id JOIN accounting_documents a ON a.id=l.accounting_document_id WHERE a.namespace='production')":['ledger_entries','coil_entries','quantity_values'].includes(t)?"line_id IN (SELECT l.id FROM document_lines l JOIN accounting_documents a ON a.id=l.accounting_document_id WHERE a.namespace='production')":t==='document_lines'?"accounting_document_id IN (SELECT id FROM accounting_documents WHERE namespace='production')":"namespace='production'";
 await c.query(`DELETE FROM ${t} WHERE ${where}`);
 }
 await c.query("DELETE FROM documents WHERE namespace='production' AND kind<>'user'");
 assert.equal((await c.query("SELECT count(*)::integer n FROM documents WHERE namespace='production' AND document_id LIKE 'sim:%'")).rows[0].n,0,'Simulation identities already exist: do not overwrite');
 const seqMap=new Map();
 for(const d of data.tables.documents){assert.equal(d.namespace,'production');if(d.kind==='user')assert.equal(JSON.parse(d.payload).telegramId,'');const cols=Object.keys(d).filter(k=>k!=='seq');const r=await c.query(`INSERT INTO documents (${cols.join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING seq`,cols.map(k=>d[k]));seqMap.set(d.seq,r.rows[0].seq)}
 for(const table of ['accounting_documents','stock_accounts','document_lines','quantity_values','quantity_inputs','ledger_entries','coil_entries','opening_batches']){
 const rows=data.tables[table];if(table==='accounting_documents')for(const r of rows){assert.ok(seqMap.has(r.source_seq));r.source_seq=seqMap.get(r.source_seq)}
 for(let start=0;start<rows.length;start+=100){const chunk=rows.slice(start,start+100),cols=Object.keys(chunk[0]),args=chunk.flatMap(r=>cols.map(k=>r[k]));await c.query(`INSERT INTO ${table} (${cols.join(',')}) VALUES `+chunk.map((_,j)=>'('+cols.map((_,i)=>'$'+(j*cols.length+i+1)).join(',')+')').join(','),args)}
 }
 const physical=(await c.query("SELECT l.origin_pid,l.cable_id,a.kind,SUM(e.sign*q.value_base)::text amount FROM ledger_entries e JOIN quantity_values q ON q.id=e.value_id JOIN stock_accounts a ON a.id=e.account_id JOIN document_lines l ON l.id=e.line_id WHERE a.namespace='production' GROUP BY l.origin_pid,l.cable_id,a.kind")).rows;
 for(const e of expected.balances)for(const [kind,field]of [['pid','mm'],['warehouse','warehouseGrams'],['transit','transitGrams']])assert.equal(Number(physical.find(x=>x.origin_pid===e.pid&&x.cable_id===e.cableId&&x.kind===kind)?.amount||0),e[field]);
 const coils=(await c.query("SELECT l.origin_pid,l.cable_id,SUM(e.delta_count)::text amount FROM coil_entries e JOIN document_lines l ON l.id=e.line_id JOIN accounting_documents a ON a.id=l.accounting_document_id WHERE a.namespace='production' GROUP BY l.origin_pid,l.cable_id")).rows;
 for(const e of expected.balances)assert.equal(Number(coils.find(x=>x.origin_pid===e.pid&&x.cable_id===e.cableId)?.amount||0),e.coils);
 await c.query('INSERT INTO notifications(key,status,chat_id,created_at,error) VALUES($1,$2,$3,$4,$5)',[marker,'reset_done','',new Date().toISOString(),JSON.stringify({scenario:'June and August 2026',sha256:expected.datasetSha256})]);
 await c.query('COMMIT');console.log('SEASON_IMPORTED_AND_VERIFIED '+JSON.stringify({versions:data.tables.documents.length,pids:['101','202','303'],trips:12,received:11,retainedUsers:users.length}));
 }
}catch(e){await c.query('ROLLBACK').catch(()=>{});console.error('SEASON_IMPORT_FAILED '+(e.code||e.name));process.exitCode=1}finally{c.release();await pool.end()}
