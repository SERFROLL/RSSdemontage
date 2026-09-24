"""Convert the owner-approved historical batch and reference workbook extraction.
Output is private: never commit the resulting JSON or Telegram identifiers.
"""
import argparse, json, hashlib
from pathlib import Path
from datetime import datetime, timezone

def prepare(source, history, today, active_pids=None):
    dirs=json.loads((source/'directories-v3.json').read_text(encoding='utf-8'))
    batch=json.loads((history/'history-batch.json').read_text(encoding='utf-8'))
    shipments=json.loads((source/'validation-fokin-corrected-0919.json').read_text(encoding='utf-8'))['shipments']
    rows=lambda key:[r['values'] for r in dirs['sheets'][key]['rows']]
    code=lambda value:str(value or '').split(' — ')[0].strip()
    metal={'M001':'copper','M002':'lead','M003':'aluminium'}
    employees=[dict(id=v[0],name=v[1].strip(),active=v[2]=='Да') for v in rows('Сотрудники')]
    identities=[dict(employee=v[0],telegram_id=str(v[3]).strip(),is_admin=v[5]=='Администратор') for v in rows('Сотрудники') if v[3]]
    kinds={'Склад прораба по ПИД':'field','Основной склад':'main','Склад мастера разделки':'master','Склад реализации':'sales'}
    wh=[]
    for v in rows('Склады'):
        owner=code(v[2]);pid=code(v[3]);kind=kinds[v[1]]
        name=next(e['name'] for e in employees if e['id']==owner)
        wh.append(dict(id=v[0],name=name+(' · ПИД'+pid if pid else ' · '+v[1]),pid=pid,owner=owner,kind=kind))
    works={'Копка (м)':'dig','Извлечение (м)':'extract','Намотка (шт.)':'wind','Разделка (т)':'strip'}
    assignments=[dict(id=v[0],warehouse=code(v[1]),work=works[v[2]],material=code(v[3]) if works[v[2]]!='dig' else '',active=v[4]=='Да') for v in rows('Назначения')]
    if active_pids:
        for a in assignments:
            w=next(w for w in wh if w['id']==a['warehouse'])
            if w['kind']=='field' and w['pid'] not in active_pids:a['active']=False
    replacements=[dict(warehouse=code(v[0]),deputy=code(v[1]),active=v[2]=='Да') for v in rows('Доверенные лица')]
    state=dict(version=7,today=today,hour=0,generated=[],employees=employees,pids=[dict(id=code(v[0]),lengthM=v[2]) for v in rows('ПИД')],warehouses=wh,
      materials=[dict(id=v[0],name=v[1],kind='cable') for v in rows('Материалы')]+[dict(id=metal[v[0]],name=v[1],kind='metal') for v in rows('Металлы')],
      assignments=assignments,replacements=replacements,tasks=[],documents=[],
      measurements=[dict(id=v[0],pid=code(v[1]),material=code(v[2]),date=v[3][:10],gPerM=v[4],author=code(v[5]),confirmed=True) for v in rows('Удельная масса')],
      standards=[dict(material=code(v[1]),date=v[2][:10],norm=v[3:6],rate=v[6]) for v in rows('Нормативы разделки')],
      templates=[dict(id=v[0],name=v[1],warehouse=code(v[2]),active=v[3]=='Да',members=[code(m[1]) for m in rows('Состав бригад') if code(m[0])==v[0]]) for v in rows('Бригады')])
    now=datetime.now(timezone.utc).isoformat()
    for report in batch['reports']:
        for work,field in [('dig','trench_m'),('extract','cable_m'),('wind','coils')]:
            if work=='wind' and report[field]==0:continue
            assignment=next(a for a in assignments if a['warehouse']==report['warehouse'] and a['work']==work and (work=='dig' or a['material']==report['material']))
            snap={**assignment,'responsible':report['owner'],'editors':sorted(set([report['owner']]+[r['deputy'] for r in replacements if r['warehouse']==report['warehouse'] and r['active']]))}
            taskid='history:'+assignment['id']+'@'+report['date']
            assert not any(t['id']==taskid for t in state['tasks'])
            state['tasks'].append(dict(id=taskid,date=report['date'],assignment=snap,source='restored'))
            revision=dict(version=1,qty=float(report[field]),actor='system:historical-import',at=now,reason='Восстановлено по согласованной модели суточной выработки; фактические даты отдельных работ неизвестны.',mode='work',crew=[],rate=0,norm=[0,0,0])
            if work=='extract':
                c=report['coefficient'];revision['measure']=dict(id=c['id'],date=c['confirmed_on'][:10],kgPerM=c['g_per_m']/1000,confirmedBy=c['confirmed_by'],reason='Коэффициент применён ретроспективно по согласованию владельца; сохранена настоящая дата подтверждения.')
            state['documents'].append(dict(id='Д-'+taskid,kind='work',taskId=taskid,date=report['date'],assignment=snap,versions=[revision],source='restored'))
    groups={}
    for shipment in shipments:
        group={'S002':'S001','S009':'S008'}.get(shipment['shipment_id'],shipment['shipment_id'])
        groups.setdefault(group,[]).append(shipment)
    for group,shipments in groups.items():
        first=shipments[0];items={}
        for ship in shipments:
            for line in ship['lines']:
                item=items.setdefault(line['material'],dict(material=line['material'],sent=0,received=0,weights=[]))
                item['weights'] += [float(x) for x in line['masses_kg']]
        for item in items.values():item['sent']=item['received']=round(sum(item['weights'])/1000,6)
        reason='Ввод истории по сведениям Фокина. Приёмка подтверждена по массе отправки; отдельное взвешивание не заявлено.'
        if group=='S001':reason+=' Сводная отправка за период; дата отражает конец периода.'
        if group in ['S001','S008']:reason+=' Навал учтён условной крупной катушкой по решению владельца.'
        state['documents'].append(dict(id='П-история-'+group,kind='transfer',date=first['sent_on'],from_=first['sender_warehouse'],to=first['destination_warehouse'],actor='system:historical-import',receiver=first['receiver'],receivedAt=first['received_on'],items=list(items.values()),weights=[n for i in items.values() for n in i['weights']],reason=reason))
        state['documents'][-1]['from']=state['documents'][-1].pop('from_')
    controls={}
    for report in batch['reports']:
        key=report['warehouse']+'|'+report['material'];controls[key]=controls.get(key,0)+report['mass_g']
    manifest={**batch['manifest'],'startup_active_pids':active_pids or 'all_from_workbook','startup_rule':'Only the two currently operating PIDs described by the owner; stripping assignments retained.' if active_pids else 'Workbook assignments'}
    return dict(batchId=batch['manifest']['batch_id'],state=state,identities=identities,manifest=manifest,expectedExtractionGrams=controls)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--history',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--today',required=True);p.add_argument('--active-pids',nargs='*');a=p.parse_args()
    data=prepare(a.source,a.history,a.today,a.active_pids);a.output.parent.mkdir(parents=True,exist_ok=True)
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode('utf-8');a.output.write_bytes(raw)
    print(json.dumps(dict(sha256=hashlib.sha256(raw).hexdigest(),employees=len(data['state']['employees']),tasks=len(data['state']['tasks']),documents=len(data['state']['documents']),warehouses=len(data['state']['warehouses'])),ensure_ascii=False))
