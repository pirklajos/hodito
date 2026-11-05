import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameServer} from '../server.js';

async function harness(run){const server=createGameServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;const post=async(path,body,headers={})=>{const res=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:res.status,body:await res.json()};};try{await run({server,base,post});}finally{server.closeSessions();server.closeAllConnections();await new Promise(r=>server.close(r));}}
async function state(reader){const decoder=new TextDecoder();let buffer='';while(true){const {done,value}=await reader.read();if(done)throw Error('Stream ended');buffer+=decoder.decode(value);const data=buffer.split('\n').find(x=>x.startsWith('data: '));if(data)return JSON.parse(data.slice(6));}}

test('stream uses body authentication, hides secrets and sends personalized live state',()=>harness(async({base,post})=>{
 const a=(await post('/api/create',{name:'Alpha'})).body;
 const ac=new AbortController();const response=await fetch(`${base}/api/${a.code}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:a.token}),signal:ac.signal});
 assert.match(response.headers.get('content-type'),/text\/event-stream/);const reader=response.body.getReader();const initial=await state(reader);assert.equal(initial.you,a.playerId);assert.equal(initial.players.length,1);assert.ok(!JSON.stringify(initial).includes(a.token));
 const b=(await post(`/api/${a.code}/join`,{name:'Beta'})).body;const update=await state(reader);assert.equal(update.you,a.playerId);assert.equal(update.players.length,2);assert.ok(update.revision>initial.revision);assert.ok(!JSON.stringify(update).includes(b.token));ac.abort();
 assert.equal((await post(`/api/${a.code}/events`,{token:'invalid'})).status,401);
 const old=await fetch(`${base}/api/${a.code}/events?token=${a.token}`);assert.equal(old.status,405);
}));

test('origins, unknown routes, malformed inputs and absent rooms have stable error codes',()=>harness(async({base,post})=>{
 const cross=await post('/api/create',{name:'Alpha'},{Origin:'https://evil.example'});assert.equal(cross.status,403);assert.equal(cross.body.code,'CROSS_ORIGIN');
 assert.equal((await post('/api/create',{name:'Alpha'},{Origin:base})).status,200);
 assert.equal((await post('/api/aaaaaaaaaaaa/join',{name:'Beta'})).body.code,'ROOM_NOT_FOUND');
 assert.equal((await post('/api/not-a-route',{})).status,404);
 const bad=await fetch(base+'/api/create',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});assert.equal(bad.status,400);assert.equal((await bad.json()).code,'INVALID_JSON');
 const large=await post('/api/create',{name:'x'.repeat(5000)});assert.equal(large.status,413);
 const a=(await post('/api/create',{name:'Alpha'})).body;
 assert.equal((await post(`/api/${a.code}/start`,{token:a.token,bots:-1})).body.code,'INVALID_BOTS');
 assert.equal((await post(`/api/${a.code}/start`,{token:a.token,bots:0})).body.code,'NOT_ENOUGH_PLAYERS');
 assert.equal((await post(`/api/${a.code}/start`,{token:a.token,bots:1})).status,200);
 assert.equal((await post(`/api/${a.code}/start`,{token:a.token,bots:1})).status,409);
}));

test('replacement stream closes the old connection and resumes current player',()=>harness(async({base,post})=>{
 const a=(await post('/api/create',{name:'Alpha'})).body;const controllers=[];
 const open=async()=>{const ac=new AbortController();controllers.push(ac);const res=await fetch(`${base}/api/${a.code}/events`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:a.token}),signal:ac.signal});const reader=res.body.getReader();return {reader,state:await state(reader)};};
 const first=await open(),second=await open();assert.equal(second.state.you,first.state.you);const replaced=await state(first.reader);assert.equal(replaced.code,'SESSION_REPLACED');assert.equal((await first.reader.read()).done,true);controllers.forEach(ac=>ac.abort());
}));

test('browser transport sends commands, receives state, closes and stops on invalid token',()=>harness(async({base})=>{
 const {request,connectSession}=await import('../public/transport.js');const originalFetch=globalThis.fetch;globalThis.fetch=(url,options)=>originalFetch(new URL(url,base),options);
 try{
 const a=await request('/api/create',{name:'Transport'});assert.ok(a.token);
 await assert.rejects(request(`/api/${a.code}/start`,{token:'invalid',bots:1}),e=>e.status===401&&e.code==='INVALID_SESSION');
 const statuses=[];let session;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('No state received')),2000);session=connectSession({code:a.code,token:a.token,onStatus:s=>statuses.push(s),onState:state=>{assert.equal(state.you,a.playerId);clearTimeout(timeout);resolve();},onFatal:reject});});session.close();assert.ok(statuses.includes('connected'));
 let fatalSession;await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('No auth failure received')),2000);fatalSession=connectSession({code:a.code,token:'invalid',onState:()=>reject(Error('Invalid token admitted')),onFatal:message=>{assert.match(message,/érvénytelen/);clearTimeout(timeout);resolve();}});});fatalSession.close();
 }finally{globalThis.fetch=originalFetch;}
}));

test('transport replacement is fatal for the old tab and leaves the new tab connected',()=>harness(async({base})=>{
 const {request,connectSession}=await import('../public/transport.js');const originalFetch=globalThis.fetch;globalThis.fetch=(url,options)=>originalFetch(new URL(url,base),options);
 let first,second;
 try{
 const a=await request('/api/create',{name:'Two tabs'});let replacedResolve;const replaced=new Promise(resolve=>replacedResolve=resolve);
 await new Promise((resolve,reject)=>{first=connectSession({code:a.code,token:a.token,onState:resolve,onFatal:(message,code)=>code==='SESSION_REPLACED'?replacedResolve():reject(Error(message))});});
 const states=[];await new Promise((resolve,reject)=>{second=connectSession({code:a.code,token:a.token,onState:s=>{states.push(s);resolve();},onFatal:message=>reject(Error(message))});});
 await Promise.race([replaced,new Promise((_,reject)=>setTimeout(()=>reject(Error('Old tab did not stop')),1000))]);
 await request(`/api/${a.code}/join`,{name:'Still connected'});
 await new Promise(resolve=>setTimeout(resolve,50));assert.equal(states.at(-1).players.length,2);
 }finally{first?.close();second?.close();globalThis.fetch=originalFetch;}
}));

test('transport reconnects after a transient stream interruption without a new player',()=>harness(async({server,base})=>{
 const {request,connectSession}=await import('../public/transport.js');const originalFetch=globalThis.fetch;globalThis.fetch=(url,options)=>originalFetch(new URL(url,base),options);let session;
 try{
 const a=await request('/api/create',{name:'Reconnect'});const statuses=[];let states=0,firstResolve,secondResolve;
 const first=new Promise(resolve=>firstResolve=resolve),second=new Promise(resolve=>secondResolve=resolve);
 session=connectSession({code:a.code,token:a.token,onStatus:s=>statuses.push(s),onState:s=>{assert.equal(s.you,a.playerId);assert.equal(s.players.length,1);if(++states===1)firstResolve();else secondResolve();},onFatal:message=>assert.fail(message)});
 await first;server.closeSessions();
 let timeout;try{await Promise.race([second,new Promise((_,reject)=>timeout=setTimeout(()=>reject(Error('Reconnect timed out')),3000))]);}finally{clearTimeout(timeout);}
 assert.ok(statuses.includes('reconnecting'));assert.equal(statuses.filter(s=>s==='connected').length,2);
 }finally{session?.close();globalThis.fetch=originalFetch;}
}));
