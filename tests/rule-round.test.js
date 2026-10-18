'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { RuleRound, availableTypes, poolOf } = require('../src/core/rule-round.js');
const Prog = require('../src/core/progress.js');
const Pick = require('../src/core/pick.js');
const { cfg, translator, ruleData: d } = require('./helpers/fixtures.js');

const C = cfg();
const mk = (o) => new RuleRound(Object.assign({ mode: 'practice', data: d, translator, progress: Prog.createProgress(C), cfg: C, length: 12, qtype: 'mix', rng: Pick.makeRng(21) }, o));
const rightAnswer = (q) => (q.type === 'translate' ? { cells: q.item.cells } : q.type === 'read' ? { key: q.item.key } : { choice: q.item.answer });

test('available types: translate / read / judge all have data', () => {
  assert.deepEqual(availableTypes(d), ['translate', 'read', 'judge']);
  assert.equal(poolOf(d, 'judge').length, d.judge.length);
  assert.deepEqual(availableTypes(Object.assign({}, d, { judge: [] })), ['translate', 'read']);
  assert.deepEqual(availableTypes(Object.assign({}, d, { words: [d.words[0]] })), ['translate', 'judge']); // 只有一个词：翻盲文还能出，读词凑不出选项
  assert.deepEqual(availableTypes(Object.assign({}, d, { words: [], judge: [] })), []);
});

test('a full mixed round: all question types appear, correct answers score right, progress goes to progress.rules only', () => {
  const r = mk({ length: 60 });
  const seen = new Set();
  let q; let n = 0;
  while ((q = r.next())) {
    n++;
    seen.add(q.type);
    if (q.type === 'read') { assert.ok(q.options.length >= 2); assert.ok(q.options.some((o) => o.key === q.item.key)); assert.ok(['chars', 'pinyin'].includes(q.ask)); }
    const res = r.answer(rightAnswer(q), 1000);
    assert.equal(res.correct, true);
    assert.equal(res.explain, q.type === 'judge' ? res.explain : null);
  }
  assert.equal(n, 60);
  assert.deepEqual([...seen].sort(), ['judge', 'read', 'translate']);
  assert.equal(r.summary().acc, 1);
  assert.deepEqual(r.progress.symbols, {});
  assert.deepEqual(r.progress.ext, { symbols: {} });
  const keys = Object.keys(r.progress.rules.items);
  assert.ok(keys.length > 0 && keys.every((k) => d.byKey.has(k)));
  for (const k of keys) assert.equal(r.progress.rules.items[k].sig, d.byKey.get(k).sig);
});

test('translate: wrong answer is judged per cell and names the first wrong cell with its rule', () => {
  const item = d.words.find((w) => w.cells.length >= 4 && w.result.cells.some((c) => c.kind === 'tone'));
  const r = mk({ qtype: 'translate', length: 1 });
  r.next({ type: 'translate', key: item.key });
  const ti = item.result.cells.findIndex((c) => c.kind === 'tone');
  const bad = item.cells.map((c, i) => (i === ti ? [c[0] === 1 ? 2 : 1] : c));
  const res = r.answer({ cells: bad }, 800);
  assert.equal(res.correct, false);
  assert.equal(res.judge.firstWrong, ti);
  assert.equal(res.explain.index, ti);
  assert.equal(res.explain.kind, 'tone');
  assert.ok(res.explain.rules.length >= 1);
  const e = r.progress.rules.items[item.key];
  assert.equal(e.wrong, 1);
  assert.equal(e.score, C.score.wrong);
  assert.deepEqual(r.summary().wrongKeys, [item.key]);
});

test('translate: blank cells matter (a word break must be an empty cell)', () => {
  const item = d.words.find((w) => w.cells.some((c) => c.length === 0));
  assert.ok(item, 'the data has a word with a word break');
  const r = mk({ qtype: 'translate', length: 2 });
  r.next({ type: 'translate', key: item.key });
  assert.equal(r.answer({ cells: item.cells.filter((c) => c.length) }, 1).correct, false);
  r.next({ type: 'translate', key: item.key });
  assert.equal(r.answer({ cells: item.cells }, 1).correct, true);
});

test('read: choosing another word is wrong and explains where its braille first differs', () => {
  const item = d.words[7];
  const r = mk({ qtype: 'read', length: 2 });
  r.next({ type: 'read', key: item.key, ask: 'chars' });
  const other = r.current.options.find((o) => o.key !== item.key);
  const res = r.answer({ key: other.key }, 1);
  assert.equal(res.correct, false);
  assert.ok(res.explain && res.explain.index >= 0);
  assert.equal(r.answer === undefined, false);
  assert.throws(() => r.answer({ key: item.key }, 1));
});

test('judge: answer true/false, explanation lists the deciding rules', () => {
  for (const family of ['tone', 'contract']) {
    const item = d.judge.find((x) => x.family === family && x.answer);
    const r = mk({ qtype: 'judge', length: 2 });
    r.next({ type: 'judge', key: item.key });
    const res = r.answer({ choice: !item.answer }, 1);
    assert.equal(res.correct, false);
    assert.deepEqual(res.explain.rules, item.rules);
    r.next({ type: 'judge', key: item.key });
    assert.equal(r.answer({ choice: item.answer }, 1).correct, true);
  }
});

test('review mode weights weak items; wrong mode only asks weak items and ends when none', () => {
  const p = Prog.createProgress(C);
  const weak = d.words[4];
  Prog.recordRuleAnswer(p, weak, false, C);
  const w = mk({ mode: 'wrong', progress: p, qtype: 'translate', length: 5 });
  let q; let n = 0;
  while ((q = w.next())) { n++; assert.equal(q.item.key, weak.key); w.answer({ cells: q.item.cells }, 1); }
  assert.ok(n >= 1);
  assert.equal(mk({ mode: 'wrong', length: 5 }).next(), null);
  const rv = mk({ mode: 'review', progress: p, qtype: 'translate', length: 300, rng: Pick.makeRng(2) });
  let hits = 0; let total = 0;
  while ((q = rv.next())) { total++; if (q.item.key === weak.key) hits++; rv.answer({ cells: q.item.cells }, 1); }
  assert.ok(hits / total > 1 / d.words.length);
});

test('a type with no usable questions is never asked; an empty pool ends the round', () => {
  const noJudge = mk({ data: Object.assign({}, d, { judge: [] }), length: 30 });
  let q;
  while ((q = noJudge.next())) { assert.notEqual(q.type, 'judge'); noJudge.answer(rightAnswer(q), 1); }
  assert.equal(mk({ data: Object.assign({}, d, { judge: [] }), qtype: 'judge' }).next(), null);
  assert.throws(() => mk({ mode: 'x' }));
});
