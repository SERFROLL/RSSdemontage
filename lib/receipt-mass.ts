import type {Transfer, TransferItem} from './concise-model';

export type ReceiptMass = {kg:number; sourceIndex?:number};
export function sentWeights(t:Transfer, item:TransferItem):number[]{
 return item.weights?.length ? item.weights : t.items.length===1 ? t.weights : [];
}
export function parseReceiptMass(text:string, unit:'kg'|'t'):number{
 const value=text.trim();
 if(!/^\d+(?:[.,]\d{1,3})?$/.test(value))throw Error('Введите одно число: например 801,5 кг или 37,035 т. Точка и запятая допустимы.');
 const kg=Number(value.replace(',','.'))*(unit==='t'?1000:1);
 if(!Number.isFinite(kg)||kg<=0||kg>1e9)throw Error('Масса должна быть больше нуля и не превышать 1 000 000 000 кг.');
 return Math.round(kg*1000)/1000;
}
export function receiptTonnes(entries:ReceiptMass[]):number{
 return Math.round(entries.reduce((sum,e)=>sum+e.kg,0)*1000)/1e6;
}
export function validateReceipt(entries:ReceiptMass[], weights:number[], tonnes:number){
 if(!entries.length||entries.length>10000)throw Error('Добавьте подтверждённую массу.');
 const seen=new Set<number>();
 for(const e of entries){
  if(!Number.isFinite(e.kg)||e.kg<=0||e.kg>1e9)throw Error('Проверьте массу взвешивания.');
  if(e.sourceIndex!==undefined){
   if(!Number.isInteger(e.sourceIndex)||e.sourceIndex<0||seen.has(e.sourceIndex)||weights[e.sourceIndex]!==e.kg)throw Error('Выбранная катушка не соответствует отправке или выбрана повторно.');
   seen.add(e.sourceIndex);
  }
 }
 if(Math.abs(receiptTonnes(entries)-tonnes)>.0000001)throw Error('Принятая масса должна совпадать с суммой подтверждённых значений.');
}
