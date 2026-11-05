import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, spawn, attack, tick, neighbors, W, H } from '../game.js';

function room(seed = 'test', count = 2) {
  return { seed, tiles: createMap(seed), players: Array.from({ length: count }, (_, i) => ({ id: i + 1, name: `P${i + 1}` })), buildings: [], attacks: [], ticks: 0, phase: 'playing' };
}
function small() {
  const r = room(); r.tiles = Array(W * H).fill(-1);
  r.players = [{ id: 1, name: 'Első', troops: 500, gold: 100, capital: 101 }, { id: 2, name: 'Második', troops: 0, gold: 200, capital: 102 }];
  r.tiles[101] = 1; r.tiles[102] = 2;
  return r;
}

test('seeded maps have one reachable landmass and equal non-overlapping starts for 8 players', () => {
  assert.deepEqual(createMap('Budapest'), createMap('Budapest'));
  assert.notDeepEqual(createMap('Budapest'), createMap('Havanna'));
  for (let seed = 0; seed < 64; seed++) {
    const r = room(seed, 8), land = r.tiles.filter(v => v === 0).length;
    assert.ok(land > 2000);
    const seen = new Set([r.tiles.indexOf(0)]), queue = [...seen];
    for (let head = 0; head < queue.length; head++) for (const j of neighbors(queue[head])) if (r.tiles[j] === 0 && !seen.has(j)) { seen.add(j); queue.push(j); }
    assert.equal(seen.size, land, `seed ${seed} has disconnected land`);
    spawn(r);
    for (const p of r.players) { assert.equal(p.land, 25); assert.equal(p.troops, 150); assert.equal(p.gold, 100); assert.equal(p.capacity, 250); assert.equal(r.tiles[p.capital], p.id); }
  }
});

test('spawn and combat produce identical states for identical inputs', () => {
  const a = room(1234, 4), b = room(1234, 4); spawn(a); spawn(b);
  assert.deepEqual(a, b);
  const target = a.tiles.findIndex((v, i) => v === 0 && neighbors(i).some(j => a.tiles[j] === 1));
  attack(a, a.players[0], target, .5); attack(b, b.players[0], target, .5);
  for (let i = 0; i < 25; i++) { tick(a); tick(b); }
  assert.deepEqual(a, b);
});

test('reinforcements use one front, so repeated commands do not multiply capture speed', () => {
  const r = room(); spawn(r);
  const p = r.players[0], target = r.tiles.findIndex((v, i) => v === 0 && neighbors(i).some(j => r.tiles[j] === p.id));
  attack(r, p, target, .2); attack(r, p, target, .2);
  assert.equal(r.attacks.length, 1); assert.equal(r.attacks[0].budget, 54);
  tick(r); assert.ok(p.land <= 30);
});

test('last-tile conquest updates ownership, elimination and winner in the same tick', () => {
  const r = small(); r.buildings.push({ owner: 2, at: 102, type: 'city' });
  attack(r, r.players[0], 102, .8); tick(r);
  assert.equal(r.tiles[102], 1); assert.equal(r.players[0].land, 2);
  assert.equal(r.players[1].land, 0); assert.equal(r.players[1].eliminated, true);
  assert.equal(r.players[1].troops, 0); assert.equal(r.players[1].gold, 0);
  assert.equal(r.buildings[0].owner, 1); assert.equal(r.phase, 'ended'); assert.equal(r.winner, 'Első');
  assert.equal(r.attacks.length, 0); assert.throws(() => attack(r, r.players[1], 101, .2));
  const frozen = JSON.stringify(r); tick(r); assert.equal(JSON.stringify(r), frozen);
});

test('forts increase resistance and an unsuccessful attack still causes limited attrition', () => {
  const plain = small(); plain.players[0].troops = 20; plain.players[1].troops = 100;
  for (let i = 103; i < 180; i++) plain.tiles[i] = 0;
  const fort = structuredClone(plain); fort.buildings.push({ owner: 2, at: 102, type: 'fort' });
  attack(plain, plain.players[0], 102, .8); attack(fort, fort.players[0], 102, .8);
  tick(plain); tick(fort);
  assert.ok(fort.players[1].troops > plain.players[1].troops);
  assert.ok(fort.players[1].troops < 102.1);
  assert.equal(fort.tiles[102], 2);
});

test('invalid placement and invalid coordinates are rejected before troops or terrain mutate', () => {
  const r = room(); r.tiles = Array(W * H).fill(-1); r.tiles[101] = 0;
  const before = structuredClone(r); assert.throws(() => spawn(r)); assert.deepEqual(r, before);
  const valid = room(); spawn(valid); const p = valid.players[0], troops = p.troops;
  for (const target of [-1, 6400, NaN, 1.1]) assert.throws(() => attack(valid, p, target, .2));
  assert.equal(p.troops, troops); assert.deepEqual(neighbors(-1), []); assert.deepEqual(neighbors(W * H), []);
});
