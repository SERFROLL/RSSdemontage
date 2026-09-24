import {runtime} from '@/lib/store';
export async function GET(){let operational=false;try{const e=runtime();operational=!!e.pool&&e.OPERATIONAL_ROLLBACK!=='true'&&(await e.pool.query('SELECT id FROM operational_state WHERE id=1')).rows.length>0;}catch{}return Response.json({operational},{headers:{'Cache-Control':'no-store'}});}
