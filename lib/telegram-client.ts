// Official SDK snapshot from https://telegram.org/js/telegram-web-app.js,
// served by our own host so startup does not depend on a second connection.
export function revealTelegramFrame(){
 const bridge=window as unknown as {TelegramWebviewProxy?:{postEvent:(event:string,data:string)=>void};external?:{notify?:(data:string)=>void}};
 try{
  if(window.Telegram?.WebApp)window.Telegram.WebApp.ready();
  else if(bridge.TelegramWebviewProxy)bridge.TelegramWebviewProxy.postEvent('web_app_ready','""');
  else if(bridge.external?.notify)bridge.external.notify(JSON.stringify({eventType:'web_app_ready',eventData:''}));
  else if(window.parent!==window)window.parent.postMessage(JSON.stringify({eventType:'web_app_ready',eventData:''}),'https://web.telegram.org');
 }catch{/* Ordinary browsers do not expose the native Telegram bridge. */}
}
export function loadTelegram():Promise<void>{
 if(window.Telegram?.WebApp)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  const timer=setTimeout(()=>finish(Error('Telegram не загрузился. Закройте мини-приложение и откройте его снова.')),12000);
  function finish(error?:Error){clearTimeout(timer);script.onload=null;script.onerror=null;if(error){script.remove();reject(error)}else resolve();}
  script.src='/telegram-web-app.js';script.async=true;
  script.onload=()=>finish(window.Telegram?.WebApp?undefined:Error('Не удалось запустить Telegram. Откройте приложение повторно.'));
  script.onerror=()=>finish(Error('Нет соединения с приложением. Проверьте интернет и повторите загрузку.'));
  document.head.appendChild(script);
 });
}
