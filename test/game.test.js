import test from 'node:test';
import assert from 'node:assert/strict';
import {attack,tick,neighbors,W,H} from '../game.js';
import {server} from '../server.js';
test('a támadó csak érvényes közös határon költhet katonát',()=>{
 const room={tiles:Array(W*H).fill(-1),players:[{id:1,troops:100,gold:0},{id:2,troops:100,gold:0}],buildings:[],attacks:[],ticks:0,phase:'playing'};
 room.tiles[101]=1;room.tiles[102]=0;room.tiles[103]=0;room.tiles[500]=2;
 assert.throws(()=>attack(room,room.players[0],500,.2));assert.equal(room.players[0].troops,100);
 assert.throws(()=>attack(room,room.players[0],102,NaN));
 attack(room,room.players[0],102,.2);assert.equal(room.players[0].troops,80);tick(room);assert.equal(room.tiles[102],1);
 assert.ok(!neighbors(W).includes(W-1));
});
test('két játékos szobája, jogosultságok, visszacsatlakozás és építési ellenőrzés',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const post=async(path,b)=>{const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});return {status:res.status,body:await res.json()};};
 try{
 const a=(await post('/api/create',{name:'Gazda'})).body;const b=(await post(`/api/${a.code}/join`,{name:'Barát'})).body;
 assert.equal((await post(`/api/${a.code}/start`,{token:b.token})).status,403);
 assert.equal((await post(`/api/${a.code}/start`,{token:a.token,bots:0})).status,200);
 assert.equal((await post(`/api/${a.code}/join`,{name:'Késő'})).status,409);
 const ac=new AbortController();const res=await fetch(`${base}/api/${a.code}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:a.token}),signal:ac.signal});const reader=res.body.getReader();const chunk=new TextDecoder().decode((await reader.read()).value);ac.abort();
 const state=JSON.parse(chunk.split('data: ')[1].split('\n')[0]);assert.equal(state.you,1);assert.equal(state.players.length,2);assert.ok(!chunk.includes(a.token));assert.ok(!chunk.includes(b.token));
 const own=state.tiles.indexOf(1);assert.equal((await post(`/api/${a.code}/build`,{token:a.token,type:'city',at:own})).status,200);
 assert.equal((await post(`/api/${a.code}/build`,{token:a.token,type:'city',at:own})).status,400);
 assert.equal((await post(`/api/${a.code}/attack`,{token:'hamis',target:0,ratio:.2})).status,401);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});
