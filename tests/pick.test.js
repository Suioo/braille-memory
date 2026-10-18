'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeRng, shuffle, pickWeighted, makeOptions, shuffleNoAdjacent } = require('../src/core/pick.js');
const { table, cats } = require('./helpers/fixtures.js');

test('makeRng is deterministic per seed', () => {
  const a = makeRng(7); const b = makeRng(7);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
});

test('shuffle keeps all elements', () => {
  const s = shuffle(table, makeRng(1));
  assert.equal(s.length, table.length);
  assert.deepEqual(s.map((r) => r.id).sort((x, y) => x - y), table.map((r) => r.id).sort((x, y) => x - y));
});

test('pickWeighted never returns avoidId when others exist', () => {
  const rng = makeRng(3);
  const two = table.slice(0, 2);
  for (let i = 0; i < 50; i++) assert.notEqual(pickWeighted(two, () => 1, rng, two[0].id).id, two[0].id);
  assert.equal(pickWeighted(table.slice(0, 1), () => 1, rng, table[0].id).id, table[0].id);
  assert.equal(pickWeighted([], () => 1, rng), null);
});

test('pickWeighted follows weights (heavy item picked far more often)', () => {
  const rng = makeRng(11);
  const items = table.slice(0, 3);
  const heavy = items[2].id;
  let hits = 0;
  for (let i = 0; i < 2000; i++) if (pickWeighted(items, (x) => (x.id === heavy ? 9 : 1), rng).id === heavy) hits++;
  assert.ok(hits > 1400 && hits < 1800, 'hits=' + hits); // 期望 9/11 ≈ 1636
});

test('makeOptions: 4 options, includes target, all dot patterns distinct', () => {
  const rng = makeRng(5);
  for (const target of table) {
    const opts = makeOptions(target, table, table, rng, 4);
    assert.equal(opts.length, 4);
    assert.ok(opts.some((o) => o.id === target.id));
    assert.equal(new Set(opts.map((o) => o.dotsText)).size, 4);
  }
});

test('makeOptions falls back to the full table when the scope is small', () => {
  const small = cats.reduce((a, c) => (c.count < a.count ? c : a));
  const pool = table.filter((r) => r.category === small.name);
  const opts = makeOptions(pool[0], pool.slice(0, 1), table, makeRng(9), 4);
  assert.equal(opts.length, 4);
  assert.equal(new Set(opts.map((o) => o.dotsText)).size, 4);
});

test('shuffleNoAdjacent: no equal neighbours for doubled lists', () => {
  const rng = makeRng(2);
  for (let n = 2; n <= 6; n++) {
    const items = [...table.slice(0, n), ...table.slice(0, n)];
    const out = shuffleNoAdjacent(items, rng);
    assert.equal(out.length, items.length);
    for (let i = 1; i < out.length; i++) assert.notEqual(out[i].id, out[i - 1].id);
  }
});
