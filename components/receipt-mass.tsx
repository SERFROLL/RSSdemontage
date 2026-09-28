'use client';
import {useState} from 'react';
import {Button} from './ui/button';
import {Input} from './ui/input';
import {fmt,round} from '@/lib/concise-model';
import {parseReceiptMass,receiptTonnes,type ReceiptMass} from '@/lib/receipt-mass';

export function ReceiptMassInput({weights,sent,entries,onChange,onDraftChange}:{weights:number[];sent:number;entries:ReceiptMass[];onChange:(entries:ReceiptMass[])=>void;onDraftChange:(pending:boolean)=>void}){
 const [open,setOpen]=useState(false),[text,setText]=useState(''),[unit,setUnit]=useState<'kg'|'t'>('kg'),[error,setError]=useState('');
 const total=receiptTonnes(entries),delta=round(total-sent);
 const sortedWeights=weights.map((kg,index)=>({kg,index})).sort((a,b)=>a.kg-b.kg||a.index-b.index);
 const toggle=(index:number)=>onChange(entries.some(e=>e.sourceIndex===index)?entries.filter(e=>e.sourceIndex!==index):[...entries,{kg:weights[index],sourceIndex:index}]);
 const add=()=>{try{const kg=parseReceiptMass(text,unit);onChange([...entries,{kg}]);setText('');setError('');onDraftChange(false);}catch(e){setError((e as Error).message)}};
 return <div className="c-receipt">
  <h3>Массы катушек, кг</h3>
  {weights.length?<><p className="c-help">Нажмите массу фактически принятой катушки. Повторное нажатие уберёт её из подтверждения. Все массы на кнопках — в кг.</p><div className="c-receipt-coils">{sortedWeights.map(({kg,index})=><button type="button" key={index} aria-label={fmt(kg,3)+' кг, катушка '+(index+1)} aria-pressed={entries.some(e=>e.sourceIndex===index)} onClick={()=>toggle(index)}><b>{fmt(kg,3)}</b></button>)}</div></>:<p className="c-help">В документе нет масс отдельных катушек. Добавьте результаты своего взвешивания ниже.</p>}
  <section className="c-receipt-confirmed" aria-label="Подтверждённое значение массы">
   <h3>Подтверждённое значение массы</h3>
   {entries.length?<div className="c-receipt-sum">{entries.map((entry,index)=><span key={entry.sourceIndex===undefined?'manual-'+index:'coil-'+entry.sourceIndex}>{index>0&&<b aria-hidden="true"> + </b>}<button type="button" aria-label={'Убрать '+fmt(entry.kg,3)+' кг, '+(entry.sourceIndex===undefined?'ручное взвешивание '+(index+1):'катушка '+(entry.sourceIndex+1))} onClick={()=>onChange(entries.filter((_,i)=>i!==index))}>{fmt(entry.kg,3)} кг <small>{entry.sourceIndex===undefined?'вручную':'№ '+(entry.sourceIndex+1)}</small> ×</button></span>)}</div>:<p className="c-help">Пока ничего не добавлено.</p>}
   <Button type="button" variant="outline" onClick={()=>setOpen(true)}>Добавить материал +</Button>
   {open&&<div className="c-form"><p className="c-help">Введите массу одной катушки или взвешенной партии. Выберите кг или т. Добавленная масса прибавится к уже выбранным значениям — не учитывайте одну катушку дважды.</p><div className="c-receipt-manual"><label>Масса<Input aria-label="Масса ручного взвешивания" type="text" inputMode="decimal" placeholder={unit==='kg'?'Например, 801,5':'Например, 37,035'} value={text} onChange={e=>{setText(e.target.value);setError('');onDraftChange(!!e.target.value.trim())}}/></label><label>Единица<select aria-label="Единица ручного взвешивания" value={unit} onChange={e=>setUnit(e.target.value as 'kg'|'t')}><option value="kg">кг</option><option value="t">т</option></select></label></div><Button type="button" onClick={add}>Добавить массу в подтверждение</Button><Button type="button" variant="ghost" onClick={()=>{setText('');setError('');setOpen(false);onDraftChange(false)}}>Отменить ручной ввод</Button>{error&&<p role="alert" className="c-error">{error}</p>}</div>}
   <div aria-live="polite"><p><strong>Итого принято: {entries.length?fmt(total,6)+' т':'—'}</strong></p><p>Расхождение (принято − отправлено): {entries.length?(delta>0?'+':'')+fmt(delta,6)+' т':'—'}</p></div>
  </section>
 </div>;
}
