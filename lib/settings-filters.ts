import * as M from './concise-model';
import {notificationSettings,notificationSummary} from './task-notifications';
import {summarySubscriptions,summaryNames,periodNames} from './company-notifications';
export type Section='pid'|'trust'|'functions'|'staff'|'crew'|'warehouses'|'materials'|'mass'|'norms'|'opening'|'access'|'notifications'|'summaries';
export type Filter={query:string;values:Record<string,string>;page:number};
export type Row={id:string;values:Record<string,string>;search:string};
export type Identity={employee:string;telegram_id:string;is_admin:boolean};
export const sections:{id:Section;name:string;fields:[string,string][];primary?:number}[]=[
 {id:'pid',name:'ПИД и длина трассы',primary:3,fields:[['pid','ПИД'],['pidStatus','Статус ПИД'],['locality','Населённый пункт'],['length','Длина']]},
 {id:'trust',name:'Доверенные лица',fields:[['deputy','Доверенное лицо'],['warehouse','Склад / ПИД'],['owner','МОЛ'],['pid','ПИД'],['pidStatus','Статус ПИД'],['locality','Населённый пункт'],['status','Доступ']]},
 {id:'functions',name:'Функции сотрудников',fields:[['owner','Сотрудник'],['pid','ПИД'],['status','Назначение'],['pidStatus','Статус ПИД'],['locality','Населённый пункт']]},
 {id:'staff',name:'Сотрудники',fields:[['status','Работает']]},
 {id:'crew',name:'Состав бригад',fields:[['employee','Сотрудник'],['crew','Бригада'],['warehouse','Склад мастера'],['status','Шаблон']]},
 {id:'warehouses',name:'Склады',fields:[['owner','МОЛ'],['pid','ПИД'],['pidStatus','Статус ПИД'],['locality','Населённый пункт']]},
 {id:'materials',name:'Кабели и металлы',fields:[['kind','Группа']]},
 {id:'mass',name:'Удельная масса',fields:[['pid','ПИД'],['material','Кабель'],['author','Кто подтвердил'],['date','Дата'],['pidStatus','Статус ПИД'],['locality','Населённый пункт']]},
 {id:'norms',name:'Нормативы и тарифы',fields:[['material','Кабель'],['date','Действует с']]},
 {id:'opening',name:'Начальные остатки',fields:[['warehouse','Склад'],['material','Материал'],['owner','МОЛ'],['pid','ПИД'],['pidStatus','Статус ПИД'],['locality','Населённый пункт']]},
 {id:'access',name:'Доступ TG / WEB',fields:[['rights','Права WEB'],['status','Работает']]},
 {id:'notifications',name:'Уведомления Telegram',fields:[['employee','Сотрудник'],['status','Уведомления']]},
 {id:'summaries',name:'Сводки Telegram',fields:[['recipient','Получатель'],['status','Отправка']]},
];
export const emptyFilter=():Filter=>({query:'',values:{},page:0});
export const matches=(row:Row,f:Filter)=>Object.entries(f.values).every(([k,v])=>!v||row.values[k]===v)&&f.query.toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean).every(w=>row.search.toLocaleLowerCase('ru').includes(w));
export function settingsRows(s:M.State,section:Section,identities:Identity[]=[]):Row[]{
 const pid=(id:string)=>{const p=s.pids.find(p=>p.id===id);return {pid:id||'Без ПИД',locality:id?p?.locality||'Не указано':'Без ПИД',pidStatus:id?M.pidStatusLabel(p):'Без ПИД'}};
 const wh=(id:string)=>{const w=s.warehouses.find(w=>w.id===id);return {...pid(w?.pid||''),warehouse:M.warehouse(s,id),owner:M.person(s,w?.owner||'')}};
 const row=(id:string,values:Record<string,string>,extra=''):Row=>({id,values,search:[id,...Object.values(values),extra].join(' ')});
 switch(section){
 case 'pid':return M.pidCatalog(s).map(p=>row(p.id,{...pid(p.id),length:p.lengthM===null?'Не задана':'Задана'},String(p.lengthM??'')));
 case 'trust':return s.replacements.map(r=>row(r.warehouse+'|'+r.deputy,{...wh(r.warehouse),deputy:M.person(s,r.deputy),status:r.active?'Действует':'Выключен'}));
 case 'functions':if(s.dailyVersion)return (s.duties||[]).map(d=>row(d.id,{...pid(d.pid),owner:M.person(s,d.employee),status:d.active?'Действует':'Выключено'},d.functions.map(w=>M.works[w].name).join(' ')));return s.assignments.map(a=>row(a.id,{...wh(a.warehouse),work:M.works[a.work].name,material:a.material?M.material(s,a.material):'Без кабеля',status:a.active?'Действует':'Выключено'}));
 case 'staff':return s.employees.map(e=>row(e.id,{employee:e.name,status:e.active?'Да':'Нет'}));
 case 'notifications':return s.employees.map(e=>{const n=notificationSettings(e);return row(e.id,{employee:e.name,status:!e.active?'Сотрудник не работает':n.newTasks||n.current||n.overdue?'Включены':'Выключены'},notificationSummary(n))});
 case 'summaries':return summarySubscriptions(s).map(n=>row(n.id,{recipient:n.recipient?M.person(s,n.recipient):'Не выбран',status:n.enabled?'Включена':'Выключена'},summaryNames[n.id]+' '+n.periods.map(p=>periodNames[p]).join(' ')));
 case 'crew':return s.templates.flatMap(t=>(t.members.length?t.members:['']).map(e=>row(t.id+'|'+e,{...wh(t.warehouse||''),employee:e?M.person(s,e):'Нет участников',crew:t.name,status:t.active===false?'Выключен':'Действует'})));
 case 'warehouses':return s.warehouses.map(w=>row(w.id,wh(w.id)));
 case 'materials':return s.materials.map(m=>row(m.id,{material:m.name,kind:m.kind==='cable'?'Кабель':'Металл'}));
 case 'mass':return s.measurements.map(m=>row(m.id,{...pid(m.pid),material:M.material(s,m.material||''),author:M.person(s,m.author),date:m.date},String(M.measurementGrams(m))));
 case 'norms':return s.standards.map(m=>row(m.material+'|'+m.date,{material:M.material(s,m.material||''),date:m.date},String(m.rate)));
 case 'opening':return s.documents.filter((d):d is M.Opening=>d.kind==='opening').map(d=>row(d.id,{...wh(d.warehouse),material:M.material(s,d.material),date:d.date},String(d.qty)));
 case 'access':return identities.map(i=>row(i.employee,{employee:M.person(s,i.employee),rights:i.is_admin?'Администратор':'По назначениям',status:s.employees.find(e=>e.id===i.employee)?.active?'Да':'Нет'},i.telegram_id));
 }
}
