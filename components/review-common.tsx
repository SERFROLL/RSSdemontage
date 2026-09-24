'use client';
import type {ReactNode} from 'react';
import {NativeSelect} from '@/components/ui/native-select';
import {Input} from '@/components/ui/input';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from '@/components/ui/table';
export function Choice({label,value,onChange,options,disabled=false}:{label:string;value:string;onChange:(v:string)=>void;options:[string,string][];disabled?:boolean}){return <label className="form-field"><span>{label}</span><NativeSelect aria-label={label} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>{options.map(([v,t])=><option key={v} value={v}>{t}</option>)}</NativeSelect></label>}
export function Field({label,value,onChange,type='text',disabled=false}:{label:string;value:string;onChange:(v:string)=>void;type?:string;disabled?:boolean}){return <label className="form-field"><span>{label}</span><Input aria-label={label} value={value} onChange={e=>onChange(e.target.value)} type={type} disabled={disabled}/></label>}
export function GridTable({heads,rows}:{heads:string[];rows:ReactNode[][]}){return <div className="data-table"><Table><TableHeader><TableRow>{heads.map(h=><TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader><TableBody>{rows.length?rows.map((r,i)=><TableRow key={i}>{r.map((c,j)=><TableCell key={j}>{c}</TableCell>)}</TableRow>):<TableRow><TableCell colSpan={heads.length}>Нет данных по выбранным условиям.</TableCell></TableRow>}</TableBody></Table></div>}
