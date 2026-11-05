/** Same-origin JSON commands. The session secret is always in the request body. */
export async function request(path,data){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),12000);
 try{
 const res=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),signal:controller.signal,credentials:'same-origin'});
 let value;try{value=await res.json();}catch{throw new Error('A szerver nem értelmezhető választ küldött.');}
 if(!res.ok)throw Object.assign(new Error(value.error||'Kapcsolati hiba.'),{status:res.status,code:value.code});
 return value;
 }catch(e){if(e.name==='AbortError')throw new Error('A szerver nem válaszolt időben. Próbáld újra.');throw e;}finally{clearTimeout(timeout);}
}
/** Authenticated SSE over fetch: retry transient failures, stop on invalid sessions. */
export function connectSession({code,token,onState,onStatus=()=>{},onFatal=()=>{}}){
 let stopped=false,controller,timer,attempt=0,connection=0;let lastRevision=-1;
 const status=value=>{if(!stopped)onStatus(value);};
 async function connect(){
 if(stopped)return;const current=++connection;const ac=new AbortController();controller=ac;status(attempt?'reconnecting':'connecting');
 let watchdog;
 try{
 watchdog=setTimeout(()=>ac.abort(),15000);
 const res=await fetch(`/api/${code}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token}),signal:ac.signal,credentials:'same-origin'});
 clearTimeout(watchdog);
 if(!res.ok){let b;try{b=await res.json();}catch{}if([400,401,403,404,409].includes(res.status)){stopped=true;globalThis.removeEventListener?.('online',online);onStatus('offline');onFatal(b?.error||'A munkamenet nem folytatható.',b?.code);return;}throw Error(b?.error||'Kapcsolati hiba.');}
 if(!res.body||!res.headers.get('content-type')?.includes('text/event-stream'))throw Error('Érvénytelen eseményfolyam.');
 status('connected');attempt=0;const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';
 function resetWatchdog(){clearTimeout(watchdog);watchdog=setTimeout(()=>ac.abort(),35000);}resetWatchdog();
 while(!stopped&&current===connection){const {done,value}=await reader.read();if(done)break;resetWatchdog();buffer+=decoder.decode(value,{stream:true}).replace(/\r\n/g,'\n');if(buffer.length>1024*1024)throw Error('Túl nagy állapotfrissítés.');let end;
 while((end=buffer.indexOf('\n\n'))>=0){const event=buffer.slice(0,end);buffer=buffer.slice(end+2);const data=event.split('\n').filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(!data)continue;const state=JSON.parse(data);if(event.split('\n').some(line=>line.trim()==='event: fatal')){stopped=true;globalThis.removeEventListener?.('online',online);onStatus('offline');onFatal(state.error||'A kapcsolat lezárult.',state.code);return;}if(typeof state.revision==='number'){if(state.revision<lastRevision)continue;lastRevision=state.revision;}onState(state);}
 }
 }catch(e){/* Retry transport failures; authentication failures above terminate. */}
 finally{clearTimeout(watchdog);ac.abort();}
 if(stopped||current!==connection)return;
 attempt++;status(attempt>=3?'offline':'reconnecting');const wait=Math.min(10000,500*2**Math.min(attempt-1,5))+Math.random()*250;timer=setTimeout(connect,wait);
 }
 function online(){if(stopped)return;clearTimeout(timer);controller?.abort();connect();}
 globalThis.addEventListener?.('online',online);connect();
 return {close(){stopped=true;connection++;clearTimeout(timer);controller?.abort();globalThis.removeEventListener?.('online',online);}};
}
