'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/progress.js');
const { table, cats, cfg, plan } = require('./helpers/fixtures.js');

const C = cfg();
const fresh = () => P.createProgress(C);
const catNames = cats.map((c) => c.name);

test('score: right -1 floor 0, wrong +2 cap 8', () => {
  assert.equal(P.nextScore(0, true, C), 0);
  assert.equal(P.nextScore(3, true, C), 2);
  assert.equal(P.nextScore(0, false, C), 2);
  assert.equal(P.nextScore(7, false, C), 8);
  assert.equal(P.nextScore(8, false, C), 8);
});

test('recordAnswer updates score and counters; weak = score>0', () => {
  const p = fresh(); const row = table[0];
  assert.equal(P.isWeak(p, row), false);
  P.recordAnswer(p, row, false, C);
  assert.deepEqual([P.symState(p, row).score, P.symState(p, row).wrong], [2, 1]);
  assert.equal(P.isWeak(p, row), true);
  P.recordAnswer(p, row, true, C); P.recordAnswer(p, row, true, C);
  assert.equal(P.symState(p, row).score, 0);
  assert.equal(P.symState(p, row).right, 2);
  assert.deepEqual(P.weakRows(p, table), []);
});

test('recordTestMistake: wrong+1, score+2 capped', () => {
  const p = fresh(); const row = table[1];
  for (let i = 0; i < 6; i++) P.recordTestMistake(p, row, C);
  assert.equal(P.symState(p, row).wrong, 6);
  assert.equal(P.symState(p, row).score, 8);
  assert.equal(P.symState(p, row).right, 0);
});

test('recordLessonResult: stars never go down, best values kept', () => {
  const p = fresh(); const L = plan[0];
  assert.equal(P.recordLessonResult(p, L, { stars: 2, acc: 0.9, avgSec: 8 }).improved, true);
  assert.equal(P.recordLessonResult(p, L, { stars: 1, acc: 0.8, avgSec: 5 }).improved, false);
  assert.deepEqual(p.lessons[L.key], { sig: L.sig, stars: 2, bestAcc: 0.9, bestAvgSec: 5, plays: 2 });
  P.recordLessonResult(p, L, { stars: 3, acc: 1, avgSec: null });
  assert.equal(p.lessons[L.key].stars, 3);
  assert.equal(p.lessons[L.key].bestAvgSec, 5);
});

test('normalizeProgress drops entries whose signature no longer matches the CSV', () => {
  const p = fresh();
  P.recordAnswer(p, table[0], false, C);
  P.recordAnswer(p, table[1], false, C);
  P.recordLessonResult(p, plan[0], { stars: 1, acc: 0.8, avgSec: 10 });
  const raw = JSON.parse(JSON.stringify(p));
  raw.symbols[table[1].id].sig = 'stale';
  raw.symbols['999999'] = { sig: 'x', score: 3 };
  raw.lessons[plan[1].key] = { sig: 'stale', stars: 3 };
  const n = P.normalizeProgress(raw, table, plan, C, catNames);
  assert.equal(n.symbols[table[0].id].score, 2);
  assert.equal(n.symbols[table[1].id], undefined);
  assert.equal(n.symbols['999999'], undefined);
  assert.equal(n.lessons[plan[0].key].stars, 1);
  assert.equal(n.lessons[plan[1].key], undefined);
});

test('normalizeProgress clamps values and validates settings', () => {
  const raw = {
    settings: { theme: 'neon', seed: 'green', mirror: true, scope: catNames[0], roundLength: 20, autoNext: 'yes', qtype: 'choose' },
    symbols: { [table[0].id]: { sig: P.symSig(table[0]), score: 99, right: -3, wrong: 2 } },
  };
  const n = P.normalizeProgress(raw, table, plan, C, catNames);
  assert.equal(n.settings.theme, 'system');
  assert.equal(n.settings.seed, 'green');
  assert.equal(P.normalizeProgress({ settings: { seed: 'pink' } }, table, plan, C, catNames).settings.seed, 'teal');
  assert.equal(n.settings.mirror, true);
  assert.equal(n.settings.scope, catNames[0]);
  assert.equal(n.settings.roundLength, 20);
  assert.equal(n.settings.autoNext, true);
  assert.equal(n.settings.qtype, 'choose');
  assert.equal(n.symbols[table[0].id].score, 8);
  assert.equal(n.symbols[table[0].id].right, 0);
  const bad = P.normalizeProgress({ settings: { scope: 'not-a-category' } }, table, plan, C, catNames);
  assert.equal(bad.settings.scope, 'all');
  assert.deepEqual(P.normalizeProgress(null, table, plan, C, catNames), fresh());
});

test('clearProgress keeps settings only', () => {
  const p = fresh();
  p.settings.mirror = true;
  P.recordAnswer(p, table[0], false, C);
  P.recordLessonResult(p, plan[0], { stars: 1, acc: 1, avgSec: 1 });
  const c = P.clearProgress(p, C);
  assert.deepEqual(c.symbols, {});
  assert.deepEqual(c.lessons, {});
  assert.equal(c.settings.mirror, true);
});
