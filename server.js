import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createMap,spawn,attack,tick,W,H,colors} from './game.js';
const rooms=new Map(),clients=new Map(),rates=new Map();
const token=()=>randomBytes(18).toString('hex');
function snapshot(r){return {...r,players:r.players.map(({secret,...p})=>({...p,color:colors[p.id-1]}))};}
function broadcast(r){for(const res of clients.get(r.code)||[])res.write(`data: ${JSON.stringify({...snapshot(r),you:res.playerId})}\n\n`);}
function player(r,secret){const p=r.players.find(p=>p.secret===secret&&!p.bot);if(!p)throw Error('Érvénytelen játékos.');return p;}
async function body(req){let data='';for await(const c of req){data+=c;if(data.length>4096)throw Error('Túl nagy kérés.');}return JSON.parse(data||'{}');}
export const server=http.createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 try{
 if(url.pathname==='/health'){res.end('ok');return;}
 if(url.pathname.startsWith('/api/')){
 const ip=req.socket.remoteAddress;const now=Date.now();let rate=rates.get(ip);if(!rate||now-rate.time>10000){rate={time:now,n:0};rates.set(ip,rate);}if(++rate.n>150){res.writeHead(429);res.end('Túl sok kérés.');return;}
 const code=url.pathname.split('/')[2];let r=rooms.get(code);
 if(req.method==='GET'&&url.pathname.endsWith('/events')){
 if(!r)throw Error('A szoba nem található.');const identity=player(r,url.searchParams.get('token'));res.playerId=identity.id;
 if((clients.get(code)?.size||0)>=32)throw Error('Túl sok kapcsolat.');
 res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(`data: ${JSON.stringify({...snapshot(r),you:res.playerId})}\n\n`);
 const set=clients.get(code)||new Set();set.add(res);clients.set(code,set);req.on('close',()=>set.delete(res));return;
 }
 if(req.method!=='POST'){res.writeHead(405);res.end();return;}
 const b=await body(req);let result={ok:true};
 if(url.pathname==='/api/create'){
 if(rooms.size>=200)throw Error('A szerver megtelt.');const code=randomBytes(6).toString('hex');r={code,phase:'lobby',players:[],tiles:createMap(),buildings:[],attacks:[],ticks:0,created:Date.now(),host:1};rooms.set(code,r);
 }else if(!r)throw Error('A szoba nem található.');
 if(url.pathname==='/api/create'||url.pathname.endsWith('/join')){
 if(r.phase!=='lobby'||r.players.length>=8)throw Error('A szoba megtelt vagy már elindult.');
 const name=String(b.name||'Játékos').trim().slice(0,24)||'Játékos';const p={id:r.players.length+1,name,secret:token(),bot:false};r.players.push(p);result={code:r.code,token:p.secret};
 }else{
 const p=player(r,b.token);
 if(url.pathname.endsWith('/start')){if(p.id!==r.host||r.phase!=='lobby')throw Error('Csak a szobagazda indíthat.');const bots=Math.max(0,Math.min(8-r.players.length,Math.floor(Number(b.bots)||0)));for(let i=0;i<bots;i++)r.players.push({id:r.players.length+1,name:`Gép ${i+1}`,bot:true});if(r.players.length<2)throw Error('Legalább két résztvevő kell.');spawn(r);r.phase='playing';}
 else if(url.pathname.endsWith('/attack')){if(r.phase!=='playing')throw Error('Nincs folyamatban meccs.');attack(r,p,b.target,b.ratio);}
 else if(url.pathname.endsWith('/build')){if(r.phase!=='playing')throw Error('Nincs folyamatban meccs.');if(!['city','fort'].includes(b.type)||!Number.isInteger(b.at)||r.tiles[b.at]!==p.id||r.buildings.some(x=>x.at===b.at))throw Error('Ide nem építhetsz.');if(p.gold<100)throw Error('100 arany szükséges.');p.gold-=100;r.buildings.push({at:b.at,type:b.type,owner:p.id});}
 else throw Error('Ismeretlen művelet.');
 }
 broadcast(r);res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify(result));return;
 }
 const paths={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};const file=url.pathname.startsWith('/s/')?'index.html':paths[url.pathname];if(!file){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.setHeader('X-Content-Type-Options','nosniff');res.end(await readFile(new URL(`./public/${file}`,import.meta.url)));
 }catch(e){if(!res.headersSent)res.writeHead(400,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.message}));}
});
const timer=setInterval(()=>{for(const r of rooms.values()){
 if(Date.now()-r.created>6*60*60*1000){for(const c of clients.get(r.code)||[])c.end();clients.delete(r.code);rooms.delete(r.code);continue;}
 if(r.phase==='playing'){tick(r);if(r.ticks%8===0)for(const p of r.players.filter(p=>p.bot&&p.land>0)){const possible=[];r.tiles.forEach((v,i)=>{if(v>=0&&v!==p.id)possible.push(i);});for(let n=0;n<30;n++){try{attack(r,p,possible[Math.floor(Math.random()*possible.length)],.2);break;}catch{}}}broadcast(r);}else for(const c of clients.get(r.code)||[])c.write(': heartbeat\n\n');
 }for(const [ip,v]of rates)if(Date.now()-v.time>60000)rates.delete(ip);
},250);timer.unref();
server.on('close',()=>clearInterval(timer));
if(process.argv[1]===fileURLToPath(import.meta.url))server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Hódító: http://localhost:'+(process.env.PORT||3000)));
