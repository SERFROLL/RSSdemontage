'use client';
import * as M from '@/lib/concise-model';
import {balanceCell,balanceFormat,balanceTitle,balanceUnit, type BalanceQuery} from '@/lib/concise-balance';
import type {DocFilter} from './concise-stats';
export function BalanceValue({s,query,onDocs,decimals}:{s:M.State;query:BalanceQuery;decimals?:number;onDocs:(f:DocFilter)=>void}){
 const result=balanceCell(s,query);
 return <button className="c-number-link" aria-label={balanceTitle(s,query)+': '+balanceFormat(result.value,query)+' '+balanceUnit(query)} onClick={()=>onDocs({balance:query,title:balanceTitle(s,query)})}>{decimals===undefined?balanceFormat(result.value,query):M.fmt(result.value,decimals)}</button>;
}
