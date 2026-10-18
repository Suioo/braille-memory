'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Round } = require('../src/core/round.js');
const P = require('../src/core/progress.js');
const { makeRng } = require('../src/core/pick.js');
const { table, cats, cfg, wrongDots } = require('./helpers/fixtures.js');

const C = cfg();
const make = (o) => new Round(Object.assign({
  mode: 'practice', rows: table, table, progress: P.createProgress(C), cfg: C, length: 10, qtype: 'dots', rng: makeRng(6),
}, o));

test('practice round: length questions, no immediate repeats, scores written', () => {
  const r = make({});
  let prev = null; let n = 0; let q;
  while ((q = r.next())) {
    assert.notEqual(q.row.id, prev);
    prev = q.row.id;
    r.answer({ dots: n % 2 ? q.row.dots : wrongDots(q.row) }, 1000);
    n++;
  }
  assert.equal(n, 10);
  const s = r.summary();
  assert.deepEqual([s.total, s.correct, s.acc, s.avgSec, s.totalSec], [10, 5, 0.5, 1, 10]);
  assert.ok(s.wrongIds.length >= 1);
  assert.ok(P.weakRows(r.progress, table).length >= 1);
});

test('choose questions: 4 distinct-dot options, answered by option id', () => {
  const r = make({ qtype: 'choose' });
  const q = r.next();
  assert.equal(q.type, 'choose');
  assert.equal(q.options.length, 4);
  assert.equal(new Set(q.options.map((o) => o.dotsText)).size, 4);
  assert.equal(r.answer({ optionId: q.row.id }, 0).correct, true);
  const q2 = r.next();
  const other = q2.options.find((o) => o.id !== q2.row.id);
  assert.equal(r.answer({ optionId: other.id }, 0).correct, false);
});

test('mix produces both types', () => {
  const r = make({ qtype: 'mix', length: 40 });
  const types = new Set();
  let q;
  while ((q = r.next())) { types.add(q.type); r.answer({ dots: q.row.dots, optionId: q.row.id }, 0); }
  assert.deepEqual([...types].sort(), ['choose', 'dots']);
});

test('wrong-only round ends as soon as nothing is weak', () => {
  const p = P.createProgress(C);
  P.recordAnswer(p, table[0], false, C); // score 2 → 需答对 2 次
  const r = make({ mode: 'wrong', progress: p, length: 20 });
  let n = 0; let q;
  while ((q = r.next())) { assert.equal(q.row.id, table[0].id); r.answer({ dots: q.row.dots }, 0); n++; }
  assert.equal(n, 2);
  assert.equal(make({ mode: 'wrong', length: 20 }).next(), null);
});

test('review weights by 1+score', () => {
  const p = P.createProgress(C);
  const scope = table.filter((r) => r.category === cats[0].name);
  for (let i = 0; i < 4; i++) P.recordAnswer(p, scope[0], false, C); // score 8 → 权重 9
  const r = make({ mode: 'review', rows: scope, progress: p, length: 100000 });
  let hits = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    r.lastId = undefined;
    if (r.next().row.id === scope[0].id) hits++;
    r.current = null;
  }
  const expected = 9 / (9 + scope.length - 1);
  assert.ok(Math.abs(hits / N - expected) < 0.05, hits / N + ' vs ' + expected);
});

test('force picks the given symbol and type (used by screenshots)', () => {
  const r = make({ qtype: 'mix' });
  const q = r.next({ type: 'choose', rowId: table[3].id });
  assert.equal(q.row.id, table[3].id);
  assert.equal(q.type, 'choose');
});
