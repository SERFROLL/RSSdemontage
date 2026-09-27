'use client';
import {useEffect} from 'react';

export default function Home(){
 useEffect(()=>{
  const hash=new URLSearchParams(window.location.hash.slice(1));
  const query=new URLSearchParams(window.location.search);
  const telegram=['tgWebAppData','tgWebAppPlatform','tgWebAppVersion'].some(key=>hash.has(key)||query.has(key));
  window.location.replace((telegram?'/tg':'/web')+window.location.search+window.location.hash);
 },[]);
 return <main><p>Открываем учёт кабеля…</p></main>;
}
