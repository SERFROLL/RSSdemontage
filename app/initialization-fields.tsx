"use client";
import {type Doc,type Command,type Actor} from "@/lib/domain";
import {initializationStatus,prepareInitialization} from "@/lib/initialization";
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from "@/components/ui/select";
import {Checkbox} from "@/components/ui/checkbox";
import {Plus,Trash2} from "lucide-react";

type InitialLine={location:"pid"|"warehouse";cableId:string;metres?:string;kg?:string};
export type InitialData={pid:string;lines:InitialLine[];pidEmpty:boolean;warehouseEmpty:boolean;pidStockChecked:boolean;mainStockChecked:boolean};
const fmt=(n:number)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:3}).format(n/1000);
export const emptyInitialData=(pid:string):InitialData=>({pid,lines:[],pidEmpty:false,warehouseEmpty:false,pidStockChecked:false,mainStockChecked:false});

export function InitializationFields({docs,data,onChange}:{docs:Doc[];data:InitialData;onChange:(data:InitialData)=>void}){
 const pids=docs.filter(d=>d.kind==="pid"&&initializationStatus(docs,d.id)==="pending"),cables=docs.filter(d=>d.kind==="cable"),pid=docs.find(d=>d.id===data.pid),lines=data.lines||[];
 const resetCheck=(location:InitialLine["location"])=>location==="pid"?{pidStockChecked:false}:{mainStockChecked:false};
 const update=(i:number,patch:Partial<InitialLine>)=>onChange({...data,...resetCheck(lines[i].location),lines:lines.map((line,j)=>j===i?{...line,...patch}:line)});
 return <>
  <div className="initial-context"><label className="field">ПИД происхождения кабеля<Select value={data.pid||undefined} onValueChange={value=>onChange(emptyInitialData(value))}><SelectTrigger aria-label="ПИД для начальных остатков"><SelectValue placeholder="Выберите ПИД"/></SelectTrigger><SelectContent>{pids.map(p=><SelectItem value={p.id} key={p.id}>ПИД {p.data.code}</SelectItem>)}</SelectContent></Select></label><div className="initial-date"><span>Остатки на начало дня</span><strong>{pid?.data.cutoff||"Сначала выберите ПИД"}</strong><small>Дата задана в настройках ПИД</small></div></div>
  <div className="notice">Внесите кабель, который уже извлечён к этой дате, отдельно по двум местам хранения. Каждая строка относится к выбранному ПИД.</div>
  <div className="initial-locations">{(["pid","warehouse"] as const).map(location=>{
   const isPid=location==="pid",emptyKey=isPid?"pidEmpty":"warehouseEmpty",checkKey=isPid?"pidStockChecked":"mainStockChecked",empty=!!data[emptyKey],rows=lines.map((line,index)=>({line,index})).filter(({line})=>line.location===location);
   return <section className="group-box initial-location" key={location} aria-label={isPid?"Начальные остатки на ПИД":"Начальные остатки на основном складе"}>
    <div className="row spread"><div><p className="eyebrow">{isPid?"ПОЛЕ И ВРЕМЕННАЯ ПЛОЩАДКА":"СКЛАД КОМПАНИИ"}</p><h3>{isPid?"На ПИД":"На основном складе"}</h3></div><span className="badge">{isPid?"метры":"килограммы"}</span></div>
    <p className="muted initial-description">{isPid?"Извлечённый кабель, который ещё находится в поле или на временной площадке этого ПИД и не отправлен на основной склад.":"Кабель с этого ПИД, который уже поступил на основной склад. Укажите фактическую массу кабеля без тары."}</p>
    {isPid&&<p className="draft-note">Длина — оценка извлечённого остатка. Пройденная трасса сама по себе не означает, что весь кабель извлечён.</p>}
    <label className="initial-check"><Checkbox checked={empty} onCheckedChange={checked=>onChange({...data,...resetCheck(location),[emptyKey]:!!checked,lines:checked?lines.filter(line=>line.location!==location):lines})}/><span>{isPid?"На ПИД остатков нет":"На основном складе остатков с этого ПИД нет"}</span></label>
    {empty?<p className="initial-zero">Начальный остаток: 0 {isPid?"м":"кг"}</p>:<>
     {rows.map(({line,index},number)=><div className="initial-line" key={index}>
      <div className="row spread"><span className="muted">Строка {number+1}</span><button className="action quiet" type="button" aria-label={`Удалить строку ${number+1} ${isPid?"на ПИД":"на основном складе"}`} onClick={()=>onChange({...data,...resetCheck(location),lines:lines.filter((_,i)=>i!==index)})}><Trash2/>Удалить</button></div>
      <label className="field">Тип кабеля<Select value={line.cableId||undefined} onValueChange={cableId=>update(index,{cableId})}><SelectTrigger aria-label={`Тип кабеля, ${isPid?"ПИД":"основной склад"}, строка ${number+1}`}><SelectValue placeholder="Выберите тип"/></SelectTrigger><SelectContent>{cables.map(c=><SelectItem value={c.id} key={c.id}>{c.data.name}</SelectItem>)}</SelectContent></Select></label>
      <label className="field">{isPid?"Оценка длины остатка, м":"Масса кабеля без тары, кг"}<input inputMode="decimal" autoComplete="off" aria-label={`${isPid?"Оценка длины остатка, м":"Масса кабеля без тары, кг"}, строка ${number+1}`} value={(isPid?line.metres:line.kg)||""} onChange={e=>update(index,isPid?{metres:e.target.value}:{kg:e.target.value})}/></label>
     </div>)}
     {!rows.length&&<p className="draft-note" id={`initial-add-${location}`}>{cables.length?"Добавьте строку или отметьте, что остатков нет.":"Типы кабеля ещё не добавлены. Добавьте их в «Управлении», затем вернитесь к остаткам. Если кабеля нет — отметьте отсутствие остатков."}</p>}
     <button className="action secondary" type="button" disabled={!cables.length} aria-describedby={!rows.length?`initial-add-${location}`:undefined} onClick={()=>onChange({...data,...resetCheck(location),lines:[...lines,{location,cableId:"",...(isPid?{metres:""}:{kg:""})}]})}><Plus/>{isPid?"Добавить кабель на ПИД":"Добавить кабель на складе"}</button>
    </>}
    <label className="initial-check initial-verified"><Checkbox checked={!!data[checkKey]} onCheckedChange={checked=>onChange({...data,[checkKey]:!!checked})}/><span>{isPid?"Остатки на ПИД проверены":"Остатки на основном складе проверены"}</span></label>
   </section>;
  })}</div>
  <p className="draft-note">Количество катушек здесь не вводится. Все катушки, намотанные до начала учёта, уже доставлены на основной склад. Учёт новых катушек на ПИД начинается с нуля и не меняет метры или массу кабеля.</p>
  <div className="notice">Начальные остатки по этому ПИД подтверждаются один раз. После подтверждения исправления оформляются отдельной корректировкой с указанием причины.</div>
 </>;
}

export function OpeningSummary({marker,docs}:{marker:Doc;docs:Doc[]}){
 const rows=new Map<string,{mm:number;grams:number}>();
 for(const line of marker.data.lines||[]){const row=rows.get(line.cableId)||{mm:0,grams:0};if(line.location==="pid")row.mm+=line.mm||0;else if(line.location==="warehouse")row.grams+=line.grams||0;rows.set(line.cableId,row);}
 return <div className="stack"><div className="initial-review-table"><table><thead><tr><th>Тип кабеля</th><th>На ПИД<small>метры · оценка</small></th><th>На основном складе<small>кг без тары</small></th></tr></thead><tbody>{[...rows].map(([id,row])=><tr key={id}><td>{docs.find(d=>d.id===id)?.data.name||id}</td><td>{fmt(row.mm)}</td><td>{fmt(row.grams)}</td></tr>)}{!rows.size&&<tr><td colSpan={3}>На ПИД и на основном складе остатков нет.</td></tr>}</tbody></table></div><p className="draft-note">Одинаковые типы кабеля объединены отдельно по каждому месту хранения. Метры на ПИД и килограммы на складе не складываются между собой.</p></div>;
}

export function InitializationReview({docs,actor,form}:{docs:Doc[];actor:Actor;form:Command}){
 const prepared=prepareInitialization(docs,actor,form);
 return <div className="stack"><div className="notice"><strong>Начальные остатки на начало {prepared.marker.date}</strong><p>Проверьте оба места хранения. После подтверждения повторный ввод по этому ПИД будет закрыт.</p></div><OpeningSummary marker={prepared.marker} docs={docs}/><p className="draft-note">Начальные остатки не добавляются к производительности сотрудников. Катушки до начала учёта в эту форму не входят.</p></div>;
}
