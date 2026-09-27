export async function accessApi(body?:unknown,admin=false){
 const response=await fetch('/api/operational/access'+(admin?'?view=admin':''),{cache:'no-store',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json','x-telegram-init-data':window.Telegram?.WebApp.initData||''},...(body?{method:'POST',body:JSON.stringify(body)}:{})});
 let result;try{result=await response.json()}catch{throw Error('Сервис временно недоступен. Повторите попытку.');}
 if(!response.ok)throw Error(result.error||'Не удалось выполнить запрос.');return result;
}
