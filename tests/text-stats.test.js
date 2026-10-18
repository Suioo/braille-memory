'use strict';
// 文本练习的计时成绩：日志 → 成绩、指标、最佳 / 趋势、存档往返、导出导入。夹具来自真实 CSV / rules.json。
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/core/text-stats.js');
const P = require('../src/core/progress.js');
const B = require('../src/core/backup.js');
const T = require('../src/core/texts.js');
const { RuleRound } = require('../src/core/rule-round.js');
const Pick = require('../src/core/pick.js');
const { table, cats, cfg, plan, extra, ruleData, translator: tr, pmap, dict, dictProvider } = require('./helpers/fixtures.js');

const C = cfg();
const catNames = cats.map((c) => c.name);
const words = [...dict.keys()].filter((w) => Array.from(w).length >= 2);
const stop = Object.keys(pmap.punctuation).find((k) => pmap.punctuation[k] === '句号');
const mk = (store, raw) => T.createText(store, { raw, rng: Pick.makeRng(store.texts.length + 9), map: pmap, provider: dictProvider }).text;
let store = T.emptyStore();
store = T.addText(store, mk(store, words[0] + words[1] + stop + words[2] + stop));
store = T.addText(store, mk(store, words[3] + stop));
const data = T.buildItems(store, tr);
const [idA, idB] = store.texts.map((t) => t.id);
const run = (o) => Object.assign({ at: '2026-01-01T00:00:00.000Z', n: 4, ok: 4, cells: 40, ms: 60000 }, o);

test('roundRuns groups a round by text; cells counted for every answered sentence; invalid logs give no run', () => {
  const a = data.items.filter((i) => i.textId === idA);
  const b = data.items.filter((i) => i.textId === idB);
  const log = [{ key: a[0].key, correct: true, ms: 4000 }, { key: a[1].key, correct: false, ms: 6000 }, { key: b[0].key, correct: true, ms: 2500 }, { key: 'nope', correct: true, ms: 1 }];
  const r = S.roundRuns(log, data.byKey, 'AT');
  assert.deepEqual(r.map((x) => x.textId).sort(), [idA, idB].sort());
  const ra = r.find((x) => x.textId === idA).run;
  assert.deepEqual(ra, { at: 'AT', n: 2, ok: 1, cells: a[0].cells.length + a[1].cells.length, ms: 10000 });
  assert.equal(r.find((x) => x.textId === idB).run.ms, 2500);
  assert.deepEqual(S.roundRuns([{ key: a[0].key, correct: true, ms: 0 }], data.byKey, 'AT'), []);
  assert.deepEqual(S.roundRuns([], data.byKey, 'AT'), []);
  assert.equal(S.roundRuns([{ key: a[0].key, correct: true, ms: 9e9 }], data.byKey, 'AT', 1000)[0].run.ms, 1000, 'per-sentence cap');
});

test('metrics: accuracy, cells per minute, seconds per cell, total seconds', () => {
  const m = S.metrics(run({ n: 5, ok: 4, cells: 60, ms: 30000 }));
  assert.equal(m.acc, 0.8);
  assert.equal(m.cpm, 120);
  assert.equal(m.secPerCell, 0.5);
  assert.equal(m.totalSec, 30);
  assert.deepEqual(S.metrics(run({ ms: 0 })).cpm, 0);
  assert.deepEqual(S.trend(null), []);
});

test('recordTextRun: keeps the last 10, best speed needs accuracy >= 80%, best accuracy tracked separately', () => {
  const p = P.createProgress(C);
  assert.equal(P.recordTextRun(p, 'bad id', run()), null);
  assert.equal(P.recordTextRun(p, idA, run({ ms: 0 })), null);
  let r = P.recordTextRun(p, idA, run({ ok: 4, cells: 40, ms: 60000 })); // 40 cpm
  assert.deepEqual([r.newBest, r.newBestAcc], [true, true]);
  r = P.recordTextRun(p, idA, run({ ok: 2, n: 4, cells: 40, ms: 20000 })); // 120 cpm 但正确率 50%
  assert.deepEqual([r.newBest, r.newBestAcc], [false, false]);
  assert.equal(P.textRuns(p, idA).best.cpm, 40);
  r = P.recordTextRun(p, idA, run({ ok: 4, cells: 40, ms: 30000 })); // 80 cpm，正确率 100%
  assert.equal(r.newBest, true);
  assert.equal(r.newBestAcc, false, 'equal accuracy is not a new high');
  assert.equal(P.textRuns(p, idA).best.cpm, 80);
  assert.equal(P.textRuns(p, idA).bestAcc, 1);
  for (let i = 0; i < 12; i++) P.recordTextRun(p, idA, run({ at: 'r' + i }));
  assert.equal(P.textRuns(p, idA).recent.length, P.RUNS_KEEP);
  assert.equal(P.textRuns(p, idA).recent.at(-1).at, 'r11');
  assert.equal(S.trend(P.textRuns(p, idA)).length, P.RUNS_KEEP);
  assert.equal(P.textRuns(p, idB), null);
});

test('per-sentence time: last and fastest-correct, only when ms is given', () => {
  const p = P.createProgress(C);
  const it = data.items[0];
  P.recordTextAnswer(p, it, true, C);
  assert.equal(p.texts.items[it.key].lastMs, undefined);
  P.recordTextAnswer(p, it, true, C, 9000);
  P.recordTextAnswer(p, it, false, C, 3000);
  P.recordTextAnswer(p, it, true, C, 7000);
  const e = p.texts.items[it.key];
  assert.deepEqual([e.lastMs, e.bestMs, e.timed], [7000, 7000, 3]);
  P.recordTextAnswer(p, it, true, C, 9e9);
  assert.equal(p.texts.items[it.key].lastMs, P.MAX_SENTENCE_MS);
});

test('RuleRound writes sentence times only when timed', () => {
  const mkRound = (timed) => new RuleRound({ mode: 'practice', scope: 'text', timed, data: { words: data.items, judge: [] }, translator: tr, progress: P.createProgress(C), cfg: C, length: 2, qtype: 'translate', rng: Pick.makeRng(4) });
  for (const timed of [false, true]) {
    const r = mkRound(timed);
    let q;
    while ((q = r.next())) r.answer({ cells: q.item.cells }, 1234);
    const es = Object.values(r.progress.texts.items);
    assert.ok(es.length > 0);
    assert.equal(es.every((e) => (e.lastMs === 1234) === timed), true);
  }
});

test('normalize: runs are shape-cleaned, junk dropped, kept even without sentence records; prune removes missing texts; delete removes runs', () => {
  const p = P.createProgress(C);
  P.recordTextRun(p, idA, run());
  P.recordTextRun(p, idB, run());
  const raw = JSON.parse(JSON.stringify(p));
  raw.texts.runs[idA].recent.push({ at: 1 }, null, { at: 'x', n: 2, ok: 9, cells: 5, ms: 5 });
  raw.texts.runs['t_bad id'] = { recent: [run()] };
  raw.texts.runs[idB].best = { at: 'x', cpm: 99, acc: 0.5 };
  const q = P.normalizeProgress(raw, table, plan, C, catNames, extra, ruleData.entries, data.entries);
  assert.equal(Object.keys(q.texts.runs).length, 2);
  assert.equal(q.texts.runs[idA].recent.length, 2);
  assert.equal(q.texts.runs[idA].recent[1].ok, 2, 'ok clamped to n');
  assert.equal(q.texts.runs[idB].best, null, 'best below the accuracy bar is dropped');
  P.pruneTextRuns(q, new Set([idA]));
  assert.deepEqual(Object.keys(q.texts.runs), [idA]);
  P.removeTextProgress(q, idA);
  assert.deepEqual(q.texts.runs, {});
});

test('export / import carries runs and sentence times; runs of texts that are not in the library are pruned on import', () => {
  const p = P.createProgress(C);
  P.recordTextAnswer(p, data.items[0], true, C, 5000);
  P.recordTextRun(p, idA, run());
  P.recordTextRun(p, idB, run({ ok: 3 }));
  const text = B.buildExport(p, '2.5.0', new Date('2026-01-02T00:00:00Z'), store);
  const api = (current) => ({ normalize: T.normalizeStore, entries: (s) => T.buildItems(s, tr).entries, current });
  const r = B.parseImport(text, table, plan, C, catNames, extra, ruleData.entries, api(T.emptyStore()));
  assert.equal(r.ok, true);
  assert.deepEqual(r.progress, p);
  // 文件不带文本库、现有文本库里只有 A：B 的成绩被清掉，A 的保留
  const doc = JSON.parse(text); delete doc.texts; doc.format = 1;
  const only = T.removeText(store, idB);
  const r1 = B.parseImport(JSON.stringify(doc), table, plan, C, catNames, extra, ruleData.entries, api(only));
  assert.deepEqual(Object.keys(r1.progress.texts.runs), [idA]);
});
