import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createMap,spawn,attack,tick,colors,neighbors} from './game.js';

const fail=(status,code,message)=>Object.assign(new Error(message),{status,code});
const makeToken=()=>randomBytes(24).toString('hex');
const json=(res,status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
async function readBody(req){
 const contentType=req.headers['content-type'];
 if(contentType&&!contentType.startsWith('application/json'))throw fail(415,'JSON_REQUIRED','JSON kérés szükséges.');
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>4096)throw fail(413,'BODY_TOO_LARGE','Túl nagy kérés.');chunks.push(chunk);}
 try{const b=JSON.parse(Buffer.concat(chunks).toString()||'{}');if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{throw fail(400,'INVALID_JSON','Érvénytelen JSON kérés.');}
}
function checkOrigin(req){
 const origin=req.headers.origin;
 if(req.headers['sec-fetch-site']==='cross-site')throw fail(403,'CROSS_ORIGIN','Idegen oldalról nem indítható művelet.');
 if(origin){let host;try{host=new URL(origin).host;}catch{throw fail(403,'CROSS_ORIGIN','Érvénytelen kérésforrás.');}if(host!==req.headers.host)throw fail(403,'CROSS_ORIGIN','Idegen oldalról nem indítható művelet.');}
}
export function createGameServer(){
 const rooms=new Map(),clients=new Map(),rates=new Map();let timer,lastHeartbeat=0;
 const publicState=(r,you)=>({code:r.code,phase:r.phase,host:r.host,tiles:r.tiles,buildings:r.buildings,attacks:r.attacks,ticks:r.ticks,revision:r.revision,winner:r.winner,created:r.created,you,players:r.players.map(({secret,commandTimes,...p})=>({...p,color:colors[p.id-1]}))});
 function send(res,data){if(res.destroyed||res.writableEnded)return;if(res.writableLength>262144){res.destroy();return;}res.write(data);}
 function publish(r){r.revision++;const state=publicState(r);for(const res of clients.get(r.code)||[])send(res,`id: ${r.revision}\ndata: ${JSON.stringify({...state,you:res.playerId})}\n\n`);}
 function identity(r,token){if(typeof token!=='string'||token.length!==48)throw fail(401,'INVALID_SESSION','A játékosazonosító érvénytelen.');const p=r.players.find(p=>p.secret===token&&!p.bot);if(!p)throw fail(401,'INVALID_SESSION','A játékosazonosító érvénytelen.');return p;}
 function limit(key,max,window){const now=Date.now();let a=rates.get(key);if(!a||now-a.start>=window){a={start:now,n:0};rates.set(key,a);}if(++a.n>max)throw fail(429,'RATE_LIMIT','Túl sok kérés. Próbáld újra néhány másodperc múlva.');}
 const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
 try{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/health'){res.end('ok');return;}
 if(url.pathname.startsWith('/api/')){
 checkOrigin(req);if(req.method!=='POST')throw fail(405,'METHOD_NOT_ALLOWED','Ehhez POST kérés szükséges.');
 limit('ip:'+req.socket.remoteAddress,250,10000);
 const b=await readBody(req);const route=url.pathname.match(/^\/api\/([a-f0-9]{12})\/(join|events|start|attack|build)$/);
 let r,p,result={ok:true};
 if(url.pathname==='/api/create'){
 limit('create:'+req.socket.remoteAddress,10,60000);if(rooms.size>=200)throw fail(503,'SERVER_FULL','A szerver megtelt.');
 const code=randomBytes(6).toString('hex');r={code,phase:'lobby',players:[],tiles:createMap(),buildings:[],attacks:[],ticks:0,revision:0,created:Date.now(),host:1};rooms.set(code,r);
 }else{
 if(!route)throw fail(404,'UNKNOWN_ROUTE','Ismeretlen művelet.');r=rooms.get(route[1]);if(!r)throw fail(404,'ROOM_NOT_FOUND','A szoba nem található vagy lejárt.');
 }
 const action=route?.[2];
 if(url.pathname==='/api/create'||action==='join'){
 if(r.phase!=='lobby')throw fail(409,'GAME_STARTED','A meccs már elindult.');if(r.players.length>=8)throw fail(409,'ROOM_FULL','A szoba megtelt.');
 const name=typeof b.name==='string'?b.name.trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,24):'';
 if(!name){if(!r.players.length)rooms.delete(r.code);throw fail(400,'NAME_REQUIRED','Adj meg egy becenevet.');}
 p={id:r.players.length+1,name,secret:makeToken(),bot:false};r.players.push(p);result={code:r.code,token:p.secret,playerId:p.id};
 }else{
 p=identity(r,b.token);
 if(action==='events'){
 const set=clients.get(r.code)||new Set();
 // One current stream per player: refreshing or reconnecting replaces the old one.
 for(const old of set)if(old.playerId===p.id){send(old,`event: fatal\ndata: ${JSON.stringify({error:'Ezt a játékost egy másik lapon nyitottad meg.',code:'SESSION_REPLACED'})}\n\n`);old.end();set.delete(old);}
 if(set.size>=8)throw fail(429,'CONNECTION_LIMIT','Túl sok kapcsolat.');
 res.playerId=p.id;res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
 res.flushHeaders();set.add(res);clients.set(r.code,set);send(res,`id: ${r.revision}\ndata: ${JSON.stringify(publicState(r,p.id))}\n\n`);
 res.on('close',()=>{set.delete(res);if(!set.size)clients.delete(r.code);});return;
 }
 limit('player:'+r.code+':'+p.id,30,1000);
 if(action==='start'){
 if(p.id!==r.host)throw fail(403,'HOST_ONLY','Csak a szobagazda indíthat.');if(r.phase!=='lobby')throw fail(409,'GAME_STARTED','A meccs már elindult.');
 if(!Number.isInteger(b.bots)||b.bots<0||b.bots>8-r.players.length)throw fail(400,'INVALID_BOTS','Érvénytelen botszám.');
 if(r.players.length+b.bots<2)throw fail(400,'NOT_ENOUGH_PLAYERS','Legalább két résztvevő kell.');
 for(let i=0;i<b.bots;i++)r.players.push({id:r.players.length+1,name:`Gép ${i+1}`,bot:true});spawn(r);r.phase='playing';
 }else{
 if(r.phase!=='playing')throw fail(409,'NOT_PLAYING','Nincs folyamatban meccs.');
 if(action==='attack')attack(r,p,b.target,b.ratio);
 if(action==='build'){
 if(!['city','fort'].includes(b.type)||!Number.isInteger(b.at)||r.tiles[b.at]!==p.id||r.buildings.some(x=>x.at===b.at))throw fail(400,'INVALID_BUILD','Ide nem építhetsz.');
 if(p.gold<100)throw fail(400,'INSUFFICIENT_GOLD','100 arany szükséges.');p.gold-=100;r.buildings.push({at:b.at,type:b.type,owner:p.id});
 }
 }
 }
 publish(r);json(res,200,result);return;
 }
 const paths={'/':'index.html','/app.js':'app.js','/transport.js':'transport.js','/style.css':'style.css'};
 if(req.method!=='GET'&&req.method!=='HEAD')throw fail(405,'METHOD_NOT_ALLOWED','Csak GET vagy HEAD kérés engedélyezett.');
 const file=/^\/s\/[a-f0-9]{12}$/.test(url.pathname)?'index.html':paths[url.pathname];if(!file)throw fail(404,'NOT_FOUND','Az oldal nem található.');
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8');
 const content=await readFile(new URL(`./public/${file}`,import.meta.url));res.end(req.method==='HEAD'?undefined:content);
 }catch(e){if(res.headersSent){res.destroy();return;}if(e.status===429)res.setHeader('Retry-After','10');json(res,e.status||400,{error:e.message,code:e.code||'INVALID_ACTION'});}
 });
 server.requestTimeout=10000;server.headersTimeout=10000;
 function step(){for(const r of rooms.values()){
 if(Date.now()-r.created>6*60*60*1000){for(const c of clients.get(r.code)||[])c.end();clients.delete(r.code);rooms.delete(r.code);continue;}
 if(r.phase==='playing'){
 tick(r);
 if(r.phase==='playing'&&r.ticks%8===0)for(const p of r.players.filter(p=>p.bot&&p.land>0)){
 const targets=new Map();r.tiles.forEach((v,i)=>{if(v===p.id)for(const j of neighbors(i)){const owner=r.tiles[j];if(owner>=0&&owner!==p.id&&!targets.has(owner))targets.set(owner,j);}});
 // Prefer neutral land, then the weakest neighboring army.
 const sorted=[...targets].sort(([a],[b])=>a===0?-1:b===0?1:(r.players.find(p=>p.id===a)?.troops||0)-(r.players.find(p=>p.id===b)?.troops||0));
 if(sorted.length)try{attack(r,p,sorted[0][1],.2);}catch{}
 }
 publish(r);
 }
 }if(Date.now()-lastHeartbeat>=15000){lastHeartbeat=Date.now();for(const set of clients.values())for(const c of set)send(c,': heartbeat\n\n');}for(const [key,v]of rates)if(Date.now()-v.start>60000)rates.delete(key);}
 server.on('listening',()=>{timer=setInterval(step,250);timer.unref();});
 server.on('close',()=>clearInterval(timer));
 server.closeSessions=()=>{for(const set of clients.values())for(const res of set)res.end();clients.clear();};
 return server;
}
export const server=createGameServer();
if(process.argv[1]===fileURLToPath(import.meta.url)){
 server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Hódító: http://localhost:'+(process.env.PORT||3000)));
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{server.closeSessions();server.close();});
}
