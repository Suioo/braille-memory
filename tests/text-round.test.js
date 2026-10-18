'use strict';
// 自定义文本的一轮练习：复用 RuleRound（scope:'text'），进度只写 progress.texts。
const test = require('node:test');
const assert = require('node:assert/strict');
const { RuleRound, availableTypes } = require('../src/core/rule-round.js');
const T = require('../src/core/texts.js');
const Prog = require('../src/core/progress.js');
const Pick = require('../src/core/pick.js');
const { cfg, translator, pmap, dict, dictProvider } = require('./helpers/fixtures.js');

const C = cfg();
const words = [...dict.keys()].filter((w) => Array.from(w).length >= 2);
const stop = Object.keys(pmap.punctuation).find((k) => pmap.punctuation[k] === '句号');
const raw = words[0] + words[1] + stop + words[2] + stop + words[3] + stop;
const store = T.addText(T.emptyStore(), T.createText(T.emptyStore(), { raw, rng: Pick.makeRng(5), map: pmap, provider: dictProvider }).text);
const data = T.buildItems(store, translator);
const textData = { words: data.items, judge: [] };
const mk = (o) => new RuleRound(Object.assign({ mode: 'practice', scope: 'text', data: textData, translator, progress: Prog.createProgress(C), cfg: C, length: 9, qtype: 'mix', rng: Pick.makeRng(2) }, o));

test('text scope forces translate questions even when asked for mix', () => {
  assert.ok(availableTypes(textData).includes('read'), 'pool alone could allow read');
  const r = mk();
  let q; const types = new Set();
  while ((q = r.next())) { types.add(q.type); r.answer({ cells: q.item.cells }, 500); }
  assert.deepEqual([...types], ['translate']);
});

test('answers are written to progress.texts only, with the sentence signature; correct = right', () => {
  const r = mk({ length: 6 });
  let q;
  while ((q = r.next())) assert.equal(r.answer({ cells: q.item.cells }, 100).correct, true);
  assert.deepEqual(r.progress.rules, { items: {} });
  assert.deepEqual(r.progress.symbols, {});
  const keys = Object.keys(r.progress.texts.items);
  assert.ok(keys.length > 0 && keys.every((k) => data.byKey.get(k).sig === r.progress.texts.items[k].sig));
  assert.equal(r.summary().acc, 1);
});

test('a wrong answer explains and feeds wrong mode; wrong mode only asks weak sentences', () => {
  const p = Prog.createProgress(C);
  const r = mk({ progress: p, length: 1 });
  const q = r.next();
  const res = r.answer({ cells: [[1, 2, 3, 4, 5, 6]] }, 100);
  assert.equal(res.correct, false);
  assert.ok(res.explain);
  const w = mk({ mode: 'wrong', progress: p, length: 4 });
  let q2; const asked = new Set();
  while ((q2 = w.next())) { asked.add(q2.item.key); w.answer({ cells: q2.item.cells }, 100); }
  assert.deepEqual([...asked], [q.item.key]);
});
