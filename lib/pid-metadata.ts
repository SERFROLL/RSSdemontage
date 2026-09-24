import {z} from 'zod';
import * as M from './concise-model';
export function applyPidMetadata(s:M.State,input:unknown){
 const rows=z.array(z.object({id:z.string().min(1).max(180),locality:z.string().trim().min(1).max(200),status:z.enum(['active','planned','inactive'])}).strict()).min(1).max(200).parse(input);
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('ПИД повторяется в файле.');
 let next=s;
 for(const r of rows){const old=s.pids.find(p=>p.id===r.id);if(!old)throw Error('ПИД не найден: '+r.id);next=M.savePid(next,{...old,...r});}
 return next;
}
