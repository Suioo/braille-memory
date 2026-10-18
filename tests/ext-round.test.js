'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ExtRound } = require('../src/core/ext-round.js');
const Prog = require('../src/core/progress.js');
const Pick = require('../src/core/pick.js');
const { extra, ext, cfg, wrongDots } = require('./helpers/fixtures.js');

const C = cfg();
const mk = (o) => new ExtRound(Object.assign({ mode: 'practice', rows: extra, ext, progress: Prog.createProgress(C), cfg: C, length: 10, qtype: 'mix', rng: Pick.makeRng(11) }, o));

test('practice round: length, question shape, scores go to progress.ext only', () => {
  const r = mk({});
  const before = JSON.stringify(Object.assign({}, r.progress, { ext: undefined }));
  let q; let n = 0;
  while ((q = r.next())) {
    n++;
    assert.ok(['dots', 'chooseCells', 'chooseSymbol'].includes(q.type));
    if (q.type === 'dots') assert.equal(q.options, null);
    else assert.ok(q.options.length >= 2 && q.options.some((o) => o.id === q.row.id));
    if (q.type === 'dots') r.answer({ cells: q.row.cells }, 1000); else r.answer({ optionId: q.row.id }, 1000);
  }
  assert.equal(n, 10);
  const s = r.summary();
  assert.equal(s.total, 10);
  assert.equal(s.correct, 10);
  assert.equal(s.acc, 1);
  assert.equal(JSON.stringify(Object.assign({}, r.progress, { ext: undefined })), before, 'main symbols / lessons untouched');
  assert.ok(Object.keys(r.progress.ext.symbols).length > 0);
  assert.deepEqual(r.progress.symbols, {});
});

test('wrong dots answer: judged per cell, score goes up, symbol becomes weak', () => {
  const row = extra.find((x) => x.cells.length >= 2);
  const r = mk({ qtype: 'dots', length: 1 });
  r.next({ rowId: row.id });
  const bad = row.cells.map((c, i) => (i === 1 ? wrongDots({ dots: c }) : c));
  const res = r.answer({ cells: bad }, 500);
  assert.equal(res.correct, false);
  assert.equal(res.judge.firstWrong, 1);
  const e = r.progress.ext.symbols[row.id];
  assert.equal(e.wrong, 1);
  assert.equal(e.score, C.score.wrong);
  assert.equal(e.sig, Prog.extSymSig(row));
  assert.deepEqual(Prog.extWeakRows(r.progress, extra).map((x) => x.id), [row.id]);
  assert.deepEqual(r.summary().wrongIds, [row.id]);
});

test('choice answers: right option correct, any other option wrong', () => {
  const row = extra.find((x) => ext.byId.has(x.id) && !ext.ambiguous.has(x.id));
  for (const type of ['chooseCells', 'chooseSymbol']) {
    const r = mk({ length: 2 });
    const q = r.next({ rowId: row.id, type });
    assert.equal(q.type, type);
    assert.equal(r.answer({ optionId: row.id }, 1).correct, true);
    const r2 = mk({ length: 2 });
    const q2 = r2.next({ rowId: row.id, type });
    const other = q2.options.find((o) => o.id !== row.id);
    assert.equal(r2.answer({ optionId: other.id }, 1).correct, false);
    const r3 = mk({ length: 2 });
    r3.next({ rowId: row.id, type });
    assert.equal(r3.answer({ optionId: -1 }, 1).correct, false);
  }
});

test('ambiguous symbols fall back: never asked as 看点位选符号', () => {
  for (const id of ext.ambiguous) {
    for (let s = 1; s <= 8; s++) {
      const r = mk({ rng: Pick.makeRng(s), length: 3 });
      const q = r.next({ rowId: id, type: 'chooseSymbol' });
      assert.notEqual(q.type, 'chooseSymbol');
      assert.ok(q.type === 'chooseCells' || q.type === 'dots');
    }
  }
});

test('review mode weights weak symbols; wrong mode only asks weak symbols and ends when none', () => {
  const p = Prog.createProgress(C);
  const weak = extra[3];
  Prog.recordExtAnswer(p, weak, false, C);
  const w = mk({ mode: 'wrong', progress: p, length: 5, qtype: 'dots' });
  let n = 0; let q;
  while ((q = w.next())) { n++; assert.equal(q.row.id, weak.id); w.answer({ cells: q.row.cells }, 1); }
  assert.ok(n >= 1 && n <= 5);
  const empty = mk({ mode: 'wrong', progress: Prog.createProgress(C), length: 5 });
  assert.equal(empty.next(), null);
  const rv = mk({ mode: 'review', progress: p, length: 200, qtype: 'dots', rng: Pick.makeRng(5) });
  let hits = 0; let total = 0;
  while ((q = rv.next())) { total++; if (q.row.id === weak.id) hits++; rv.answer({ cells: q.row.cells }, 1); }
  assert.ok(hits / total > 1 / extra.length, 'weak symbol drawn more often than uniform');
});

test('scope: rows limit the targets but options stay in the target category', () => {
  const cat = ext.cats[0].name;
  const rows = extra.filter((r) => r.category === cat);
  const r = mk({ rows, qtype: 'choose', length: 30 });
  let q;
  while ((q = r.next())) {
    assert.equal(q.row.category, cat);
    if (q.options) assert.ok(q.options.every((o) => o.category === cat));
    r.answer({ optionId: q.row.id }, 1);
  }
});

test('bad mode throws; answering without a question throws', () => {
  assert.throws(() => mk({ mode: 'x' }));
  assert.throws(() => mk({}).answer({}, 1));
});
