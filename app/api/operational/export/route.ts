import {authenticate} from '@/lib/production-auth';
import {row,errorResponse} from '@/lib/production-store';
import {movements,warehouse,material} from '@/lib/concise-model';
import {inBalanceQuery} from '@/lib/concise-balance';
import {z} from 'zod';
export async function GET(request:Request){try{
 const user=await authenticate(request),s=(await row()).payload,p=new URL(request.url).searchParams,from=p.get('from')||'0000-01-01',to=p.get('to')||s.today,scope=p.get('scope')||'all',selected=p.get('material')||'all';
 const list=(key:string)=>p.has(key)?z.array(z.string().max(180)).max(500).parse(JSON.parse(p.get(key)!)):undefined;
 if(user.observer)throw Object.assign(Error('Доступен только просмотр статистики.'),{status:403});
 const materials=list('materials'),q={scope,actor:user.employee,owners:list('owners'),pids:list('pids')};
 const quote=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const rows=[['Дата','Документ','Склад','Материал','Изменение, т','Основание'],...movements(s).filter(m=>m.date>=from&&m.date<=to&&inBalanceQuery(s,q,m.warehouse)&&(materials?materials.includes(m.material):selected==='all'||m.material===selected)).map(m=>[m.date,m.docId,warehouse(s,m.warehouse),material(s,m.material),m.qty.toFixed(6).replace('.',','),m.basis])];
 return new Response('\ufeff'+rows.map(r=>r.map(quote).join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="material-movements.csv"','Cache-Control':'no-store'}});
 }catch(e){return errorResponse(e);}}
