export const W=100,H=64;
export const colors=['#51d7c5','#ffb65b','#b49aff','#fb7185','#60a5fa','#d7e56e','#e8a2d3','#f4eee0'];
export function createMap(seed=Math.random()*999){
 const tiles=[];
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){
 const edge=Math.min(x,y,W-1-x,H-1-y);
 const noise=Math.sin(x*.13+seed)+Math.cos(y*.18-seed)+Math.sin((x+y)*.09+seed);
 tiles.push(edge<3||noise < -.95 ? -1:0);
 }
 return tiles;
}
export function spawn(room){
 const available=room.tiles.map((v,i)=>v===0?i:-1).filter(i=>i>=0);
 const chosen=[];
 for(const p of room.players){
 let best=available[0],score=-1;
 for(const i of available){const x=i%W,y=Math.floor(i/W);const d=chosen.length?Math.min(...chosen.map(j=>(x-j%W)**2+(y-Math.floor(j/W))**2)):Math.random();if(d>score){score=d;best=i;}}
 chosen.push(best);for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){const x=best%W+dx,y=Math.floor(best/W)+dy;if(x>=0&&x<W&&y>=0&&y<H&&room.tiles[y*W+x]===0)room.tiles[y*W+x]=p.id;}
 p.troops=150;p.gold=100;p.capital=best;
 }
}
export function neighbors(i){const a=[];if(i%W>0)a.push(i-1);if(i%W<W-1)a.push(i+1);if(i>=W)a.push(i-W);if(i<W*(H-1))a.push(i+W);return a;}
export function attack(room,p,target,ratio){
 if(!Number.isInteger(target)||target<0||target>=W*H||!Number.isFinite(ratio)||ratio<.05||ratio>.8)throw Error('Érvénytelen támadás.');
 const owner=room.tiles[target];if(owner<0||owner===p.id)throw Error('Itt nem támadhatsz.');
 if(!room.tiles.some((v,i)=>v===p.id&&neighbors(i).some(j=>room.tiles[j]===owner)))throw Error('Nincs közös határ.');
 const budget=Math.floor(p.troops*ratio);if(budget<2)throw Error('Kevés a katona.');p.troops-=budget;
 room.attacks.push({player:p.id,owner,budget});
}
export function tick(room){
 const counts=new Map(room.players.map(p=>[p.id,0]));for(const v of room.tiles)if(v>0)counts.set(v,(counts.get(v)||0)+1);
 for(const p of room.players){const land=counts.get(p.id);p.land=land;if(!land)continue;const cities=room.buildings.filter(b=>b.owner===p.id&&b.type==='city').length;const cap=150+land*4+cities*300;p.troops=Math.min(cap,p.troops+2+land*.025+cities*2);p.gold+=1+land*.005;}
 for(const a of room.attacks){
 const p=room.players.find(p=>p.id===a.player);if(!p?.land){a.budget=0;continue;}
 const frontier=[];for(let i=0;i<room.tiles.length;i++)if(room.tiles[i]===a.owner&&neighbors(i).some(j=>room.tiles[j]===a.player))frontier.push(i);
 for(const i of frontier.sort(()=>Math.random()-.5).slice(0,5)){
 const defender=room.players.find(p=>p.id===a.owner);const fort=room.buildings.some(b=>b.type==='fort'&&b.owner===a.owner&&Math.abs(b.at%W-i%W)+Math.abs(Math.floor(b.at/W)-Math.floor(i/W))<7);
 const cost=a.owner===0?2:4+(defender?.troops||0)/Math.max(1,defender?.land||1)*(fort?3:1);
 if(a.budget<cost){a.budget=0;break;}a.budget-=cost;if(defender)defender.troops=Math.max(0,defender.troops-cost*.5);room.tiles[i]=a.player;
 for(const b of room.buildings)if(b.at===i)b.owner=a.player;
 }if(!frontier.length)a.budget=0;
 }
 room.attacks=room.attacks.filter(a=>a.budget>0);
 const total=room.tiles.filter(v=>v>=0).length;const alive=room.players.filter(p=>p.land>0);
 const winner=room.players.find(p=>p.land/total>=.7)||(alive.length===1?alive[0]:null);
 if(winner){room.phase='ended';room.winner=winner.name;}
 room.ticks++;
}
