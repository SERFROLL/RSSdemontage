'use client';
import {createContext,useContext} from 'react';
import * as M from '@/lib/concise-model';
import {balanceCell,balanceFormat,balanceTitle,balanceUnit, type BalanceQuery} from '@/lib/concise-balance';
import type {DocFilter} from './concise-stats';
export const StatsReadOnly=createContext(false);
export function BalanceValue({s,query,onDocs,decimals}:{s:M.State;query:BalanceQuery;decimals?:number;onDocs:(f:DocFilter)=>void}){
 const readOnly=useContext(StatsReadOnly);
 const result=balanceCell(s,query);
 const label=decimals===undefined?balanceFormat(result.value,query):M.fmt(result.value,decimals);
 return <button disabled={readOnly} className="c-number-link" style={label.length>7?{fontSize:'0.8em'}:undefined} aria-label={balanceTitle(s,query)+': '+balanceFormat(result.value,query)+' '+balanceUnit(query)} onClick={()=>onDocs({balance:query,title:balanceTitle(s,query)})}>{label}</button>;
}
