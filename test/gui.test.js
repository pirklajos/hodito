import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// A minimal DOM fixture exercises screen transitions and user commands without
// pretending to verify browser layout, touch input, or actual Canvas pixels.
function fixture(path='/') {
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 const elements=new Map(),listeners=new Map(),calls=[],storage=new Map();let session;
 class Element {
  constructor(id=''){this.id=id;this.hidden=false;this.disabled=false;this.value='';this.dataset={};this.style={setProperty(){}};this.children=[];this.attributes={};this._text='';this.classList={toggle(){},add(){},remove(){}};}
  set textContent(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(c=>c.textContent||'').join('');}
  append(...nodes){this.children.push(...nodes);}
  replaceChildren(...nodes){this.children=nodes;this._text='';}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(name,fn){this[name]=fn;}
  focus(){} select(){} setPointerCapture(){}
  click(){this.onclick?.();}
  getBoundingClientRect(){return {left:0,top:0,width:1000,height:640};}
 }
 for(const [,id]of html.matchAll(/id="([^"]+)"/g))elements.set(id,new Element(id));
 const actions=['attack','city','fort'].map(mode=>{const b=new Element();b.dataset.mode=mode;return b;});
 const $=id=>elements.get(id);$('ratio').value='20';$('bots').value='2';$('bots').options=Array.from({length:8},(_,i)=>({value:String(i)}));$('map').width=1000;$('map').height=640;
 $('map').getContext=()=>new Proxy({},{get:(_,name)=>['setTransform','fillRect','fillText','strokeText','strokeRect','clearRect'].includes(name)?()=>{}:undefined,set:()=>true});
 const doc={getElementById:$,querySelectorAll:()=>actions,querySelector:selector=>actions.find(b=>selector.includes(`"${b.dataset.mode}"`)),createElement:()=>new Element(),createTextNode:text=>({textContent:String(text)}),addEventListener:(n,fn)=>listeners.set(n,fn),documentElement:new Element(),activeElement:null};
 const context={document:doc,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},location:{pathname:path,href:'http://localhost:3000'+path},history:{replaceState(_,__,next){context.location.pathname=next;context.location.href='http://localhost:3000'+next;}},navigator:{clipboard:{writeText:async()=>{}}},window:{prompt(){}},setTimeout:()=>1,clearTimeout(){},console,request:async(p,b)=>{calls.push({path:p,body:b});return p==='/api/create'||p.endsWith('/join')?{code:'abcdef123456',token:'test-token'}:{ok:true};},connectSession:options=>{session=options;return {close(){}};}};
 vm.runInNewContext(readFileSync(new URL('../public/app.js',import.meta.url),'utf8').replace(/^import .*?;\n/,''),context);
 return {$,actions,calls,storage,session:()=>session};
}
function state(phase='lobby'){
 const tiles=Array(6400).fill(0);tiles[1010]=1;tiles[1011]=1;tiles[1012]=2;
 return {phase,code:'abcdef123456',host:1,you:1,ticks:40,tiles,buildings:[],attacks:[],players:[{id:1,name:'Lajos',color:'#51d7c5',land:2,troops:150,gold:100,capital:1010},{id:2,name:'Barát',color:'#ffb65b',land:1,troops:150,gold:100,capital:1012}]};
}
test('GUI létrehozás, lobby, csata, építési parancs és kapcsolatvesztés',async()=>{
 const f=fixture();f.$('name').value='Lajos';await f.$('entry').onsubmit({preventDefault(){}});
 assert.equal(f.calls[0].path,'/api/create');assert.equal(f.storage.get('hodito:abcdef123456'),'test-token');
 const session=f.session();session.onStatus('connected');session.onState(state());
 assert.equal(f.$('lobby').hidden,false);assert.equal(f.$('start').hidden,false);assert.equal(f.$('players').children.length,2);
 f.$('bots').value='0';await f.$('start').onclick();assert.equal(f.calls.at(-1).body.bots,0);
 session.onState(state('playing'));assert.equal(f.$('battle').hidden,false);assert.match(f.$('stats').textContent,/KATONA/);assert.equal(f.$('match-time').textContent,'00:10');
 f.actions[1].onclick();const e={button:0,pointerId:1,clientX:105,clientY:105};f.$('map').onpointerdown(e);await f.$('map').onpointerup(e);
 assert.equal(f.calls.at(-1).path,'/api/abcdef123456/build');assert.equal(f.calls.at(-1).body.at,1010);assert.equal(f.calls.at(-1).body.type,'city');
 f.$('zoom-in').onclick();assert.equal(f.$('zoom-value').textContent,'130%');f.$('zoom-reset').onclick();assert.equal(f.$('zoom-value').textContent,'100%');
 session.onStatus('reconnecting');assert.equal(f.actions[0].disabled,true);assert.equal(f.$('connection-notice').hidden,false);
 const count=f.calls.length;f.$('map').onpointerdown(e);await f.$('map').onpointerup(e);assert.equal(f.calls.length,count);
});
test('GUI vendégként nem indít, hibás munkamenetből visszatér a belépéshez',async()=>{
 const f=fixture('/s/abcdef123456');f.$('name').value='Barát';await f.$('entry').onsubmit({preventDefault(){}});assert.equal(f.calls[0].path,'/api/abcdef123456/join');
 const session=f.session();session.onStatus('connected');session.onState({...state(),you:2});assert.equal(f.$('start').hidden,true);assert.equal(f.$('waiting').hidden,false);
 session.onFatal('A szoba lejárt.');assert.equal(f.$('welcome').hidden,false);assert.equal(f.$('entry-error').textContent,'A szoba lejárt.');assert.equal(f.$('lobby').hidden,true);
});

test('GUI másik lap általi kapcsolatátadásnál megőrzi az új lap tokenjét',async()=>{
 const f=fixture('/s/abcdef123456');f.$('name').value='Lajos';await f.$('entry').onsubmit({preventDefault(){}});
 const session=f.session();session.onStatus('connected');session.onState(state());session.onFatal('Másik lapon nyitottad meg.','SESSION_REPLACED');
 assert.equal(f.storage.get('hodito:abcdef123456'),'test-token');assert.equal(f.$('entry').hidden,true);assert.equal(f.$('welcome').hidden,false);assert.match(f.$('entry-error').textContent,/újratölt/i);
});
