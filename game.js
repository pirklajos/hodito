export const W = 100, H = 64;
export const colors = ['#51d7c5', '#ffb65b', '#b49aff', '#fb7185', '#60a5fa', '#d7e56e', '#e8a2d3', '#f4eee0'];
const START_LAND = 25;

function hash(value) {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
function random(seed) {
  let n = hash(seed);
  return () => { n += 0x6d2b79f5; let t = n; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function neighbors(i) {
  if (!Number.isInteger(i) || i < 0 || i >= W * H) return [];
  const a = [];
  if (i % W > 0) a.push(i - 1);
  if (i % W < W - 1) a.push(i + 1);
  if (i >= W) a.push(i - W);
  if (i < W * (H - 1)) a.push(i + W);
  return a;
}

export function createMap(seed = Math.random()) {
  const rng = random(seed), phase = rng() * Math.PI * 2;
  const tiles = Array(W * H).fill(-1);
  for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++) {
    const nx = (x - W / 2) / (W * .46), ny = (y - H / 2) / (H * .44);
    const coast = Math.sin(x * .16 + phase) * .12 + Math.cos(y * .21 - phase) * .12 + Math.sin((x + y) * .12 + phase) * .09;
    if (nx * nx + ny * ny < .92 + coast) tiles[y * W + x] = 0;
  }
  // Only the largest four-connected landmass remains: every neutral tile is reachable on foot.
  const visited = new Set(); let largest = [];
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== 0 || visited.has(i)) continue;
    const queue = [i]; visited.add(i);
    for (let head = 0; head < queue.length; head++) for (const j of neighbors(queue[head])) {
      if (tiles[j] === 0 && !visited.has(j)) { visited.add(j); queue.push(j); }
    }
    if (queue.length > largest.length) largest = queue;
  }
  const land = new Set(largest);
  return tiles.map((_, i) => land.has(i) ? 0 : -1);
}

function recount(room) {
  const counts = new Map(room.players.map(p => [p.id, 0]));
  for (const owner of room.tiles) if (owner > 0) counts.set(owner, (counts.get(owner) || 0) + 1);
  for (const p of room.players) {
    p.land = counts.get(p.id) || 0;
    p.eliminated = p.land === 0;
    const cities = room.buildings.filter(b => b.owner === p.id && b.type === 'city').length;
    p.capacity = p.land ? 150 + p.land * 4 + cities * 300 : 0;
    if (p.eliminated) { p.troops = 0; p.gold = 0; }
    else if (room.tiles[p.capital] !== p.id) p.capital = room.tiles.indexOf(p.id);
  }
}

export function spawn(room) {
  if (room.players.length < 2 || room.players.length > colors.length) throw Error('2–8 résztvevő szükséges.');
  // Prefer inland starts so every player gets exactly the same contiguous starting area.
  const candidates = [];
  for (let i = 0; i < room.tiles.length; i++) if (room.tiles[i] === 0) {
    const x = i % W, y = Math.floor(i / W);
    let clear = true;
    for (let dy = -3; dy <= 3 && clear; dy++) for (let dx = -3; dx <= 3; dx++) {
      if (x + dx < 0 || x + dx >= W || y + dy < 0 || y + dy >= H || room.tiles[(y + dy) * W + x + dx] !== 0) { clear = false; break; }
    }
    if (clear) candidates.push(i);
  }
  const rng = random(room.seed ?? room.tiles.join(','));
  const first = candidates[Math.floor(rng() * candidates.length)], chosen = [];
  for (const p of room.players) {
    let best = first, score = -1;
    for (const i of candidates) {
      const d = chosen.length ? Math.min(...chosen.map(j => (i % W - j % W) ** 2 + (Math.floor(i / W) - Math.floor(j / W)) ** 2)) : (i === first ? 1 : 0);
      if (d > score) { score = d; best = i; }
    }
    if (best === undefined || (chosen.length && score < 64)) throw Error('Nincs elegendő hely az induló birodalmaknak.');
    chosen.push(best);
  }
  // Validate all placements before mutating the room.
  room.buildings = []; room.attacks = []; room.ticks = 0; delete room.winner;
  for (let n = 0; n < room.players.length; n++) {
    const p = room.players[n], best = chosen[n];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) room.tiles[best + dy * W + dx] = p.id;
    p.troops = 150; p.gold = 100; p.capital = best;
  }
  recount(room);
  if (room.players.some(p => p.land !== START_LAND)) throw Error('Az induló területek ütköznek.');
}

export function attack(room, p, target, ratio) {
  if (!room.players.includes(p) || !Number.isInteger(target) || target < 0 || target >= W * H || !Number.isFinite(ratio) || ratio < .05 || ratio > .8) throw Error('Érvénytelen támadás.');
  if (!room.tiles.includes(p.id)) throw Error('A birodalmad már elesett.');
  const owner = room.tiles[target];
  if (owner < 0 || owner === p.id) throw Error('Itt nem támadhatsz.');
  if (!room.tiles.some((v, i) => v === p.id && neighbors(i).some(j => room.tiles[j] === owner))) throw Error('Nincs közös határ.');
  const budget = Math.floor(p.troops * ratio);
  if (budget < 2) throw Error('Kevés a katona.');
  p.troops -= budget;
  // Reinforcing a front increases its budget, never its capture speed (spam protection).
  const existing = room.attacks.find(a => a.player === p.id && a.owner === owner);
  if (existing) existing.budget += budget;
  else room.attacks.push({ player: p.id, owner, budget });
}

export function tick(room) {
  if (room.phase !== 'playing') return;
  recount(room);
  for (const p of room.players) {
    if (p.eliminated) continue;
    const cities = room.buildings.filter(b => b.owner === p.id && b.type === 'city').length;
    p.troops = Math.min(p.capacity, p.troops + 2 + p.land * .025 + cities * 2);
    p.gold += 1 + p.land * .005;
  }
  // Rotate initiative each tick so a fixed player ID does not always get the first move.
  const attacks = [...room.attacks];
  if (attacks.length) { const shift = (room.ticks || 0) % attacks.length; attacks.push(...attacks.splice(0, shift)); }
  for (const a of attacks) {
    const p = room.players.find(p => p.id === a.player);
    if (!p || p.land === 0) { a.budget = 0; continue; }
    const frontier = [];
    for (let i = 0; i < room.tiles.length; i++) if (room.tiles[i] === a.owner && neighbors(i).some(j => room.tiles[j] === a.player)) frontier.push(i);
    if (!frontier.length) { p.troops = Math.min(p.capacity, p.troops + a.budget); a.budget = 0; continue; }
    const offset = ((room.ticks || 0) * 17 + p.id * 31) % frontier.length;
    const defender = room.players.find(p => p.id === a.owner);
    for (let n = 0; n < Math.min(5, frontier.length) && a.budget > 0; n++) {
      const i = frontier[(offset + n) % frontier.length];
      const fort = room.buildings.some(b => b.type === 'fort' && b.owner === a.owner && Math.abs(b.at % W - i % W) + Math.abs(Math.floor(b.at / W) - Math.floor(i / W)) < 7);
      const cost = a.owner === 0 ? 2 : 4 + (defender?.troops || 0) / Math.max(1, defender?.land || 1) * (fort ? 3 : 1);
      if (a.budget < cost) {
        // A smaller force still causes attrition rather than silently disappearing.
        if (defender) defender.troops = Math.max(0, defender.troops - a.budget / (fort ? 6 : 2));
        a.budget = 0; break;
      }
      a.budget -= cost;
      if (defender) { defender.troops = Math.max(0, defender.troops - cost * .5); defender.land--; }
      room.tiles[i] = a.player; p.land++;
      for (const b of room.buildings) if (b.at === i) b.owner = a.player;
    }
  }
  // Recount after conquest: elimination and victory are visible in the same snapshot.
  recount(room);
  room.attacks = room.attacks.filter(a => a.budget > 0 && room.players.some(p => p.id === a.player && !p.eliminated));
  const total = room.tiles.filter(v => v >= 0).length;
  const alive = room.players.filter(p => !p.eliminated);
  const winner = room.players.find(p => total > 0 && p.land / total >= .7) || (alive.length === 1 ? alive[0] : null);
  if (winner) { room.phase = 'ended'; room.winner = winner.name; room.attacks = []; }
  room.ticks = (room.ticks || 0) + 1;
}
