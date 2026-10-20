'use strict';
// 存档 v1 → v2：旧记录与课程星星逐字段保持不变；扩展符号进度单独存放。
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/progress.js');
const { table, cats, cfg, plan, extra } = require('./helpers/fixtures.js');

const C = cfg();
const catNames = cats.map((c) => c.name);
const norm = (raw, extraRows) => P.normalizeProgress(raw, table, plan, C, catNames, extraRows);
const clone = (o) => JSON.parse(JSON.stringify(o));

/** 一份 v1 存档（没有 ext、version 1），记录从真实字表 / 课程表推出。 */
function v1Save() {
  const symbols = {};
  table.forEach((r, i) => { if (i % 3 === 0) symbols[r.id] = { sig: P.symSig(r), score: i % (C.score.max + 1), right: i, wrong: i + 1 }; });
  const lessons = {};
  plan.forEach((l, i) => { lessons[l.key] = { sig: l.sig, stars: i % 4, bestAcc: 0.5 + (i % 5) / 10, bestAvgSec: i % 2 ? null : 7.5, plays: i + 1 }; });
  return { version: 1, settings: { theme: 'dark', seed: 'indigo', mirror: true, scope: 'all', roundLength: C.round.lengths[0], autoNext: false, timing: false, qtype: 'dots', fx: false, haptics: false, style: 'glass' }, symbols, lessons };
}

test('version is 4, createProgress carries empty ext, rules and texts, MIN_VERSION is 1', () => {
  assert.equal(P.VERSION, 4);
  assert.equal(P.MIN_VERSION, 1);
  const p = P.createProgress(C);
  assert.equal(p.version, 4);
  assert.deepEqual(p.ext, { symbols: {} });
  assert.deepEqual(p.rules, { items: {} });
  assert.deepEqual(p.texts, { items: {}, runs: {} });
});

test('v1 save: symbols, lessons (stars!) and settings come through field by field unchanged', () => {
  const old = v1Save();
  const p = norm(clone(old));
  assert.equal(p.version, P.VERSION);
  assert.deepEqual(p.symbols, old.symbols);
  assert.deepEqual(p.lessons, old.lessons);
  // 后来新增的设置项补默认值，旧字段不变
  assert.deepEqual(p.settings, Object.assign({ padHaptics: true, padHapticsStyle: 'rich', padDots: true, padSwitchKeys: 'keycap' }, old.settings));
  assert.deepEqual(p.ext, { symbols: {} });
  assert.deepEqual(p.rules, { items: {} });
  // 星星逐课不变
  for (const l of plan) assert.equal(p.lessons[l.key] && p.lessons[l.key].stars, old.lessons[l.key].stars);
});

test('current-version save with ext records round trips exactly', () => {
  const p = P.createProgress(C);
  P.recordAnswer(p, table[0], false, C);
  P.recordExtAnswer(p, extra[0], false, C);
  P.recordExtAnswer(p, extra[5], true, C);
  assert.deepEqual(norm(clone(p), extra), p);
});

test('ext records are kept apart: extra ids never leak into symbols and vice versa', () => {
  const p = P.createProgress(C);
  P.recordExtAnswer(p, extra[0], false, C);
  assert.deepEqual(p.symbols, {});
  P.recordAnswer(p, table[0], false, C);
  assert.equal(Object.keys(p.ext.symbols).length, 1);
  assert.equal(p.symbols[table[0].id].wrong, 1);
});

test('ext record with a stale signature is dropped; out-of-range numbers are clamped', () => {
  const p = P.createProgress(C);
  P.recordExtAnswer(p, extra[0], false, C);
  P.recordExtAnswer(p, extra[1], false, C);
  const raw = clone(p);
  raw.ext.symbols[extra[0].id].sig = 'other|sig';
  raw.ext.symbols[extra[1].id].score = 1e9;
  raw.ext.symbols[extra[1].id].right = -5;
  const q = norm(raw, extra);
  assert.equal(q.ext.symbols[extra[0].id], undefined);
  assert.equal(q.ext.symbols[extra[1].id].score, C.score.max);
  assert.equal(q.ext.symbols[extra[1].id].right, 0);
  // 不在扩展表里的 id 被丢弃
  raw.ext.symbols['999999'] = { sig: 'x', score: 1, right: 0, wrong: 1 };
  assert.equal(norm(raw, extra).ext.symbols['999999'], undefined);
});

test('extra table unavailable (extraRows omitted): existing ext records are preserved, never lost', () => {
  const p = P.createProgress(C);
  P.recordExtAnswer(p, extra[2], false, C);
  const q = norm(clone(p));
  assert.deepEqual(q.ext, p.ext);
  const junk = clone(p);
  junk.ext.symbols.abc = { sig: 'x' };
  junk.ext.symbols[extra[3].id] = 'nope';
  junk.ext.symbols[extra[4].id] = { sig: 5 };
  assert.deepEqual(norm(junk).ext, p.ext);
  assert.deepEqual(norm({ version: 2, ext: 'bad' }).ext, { symbols: {} });
  assert.deepEqual(norm(null).ext, { symbols: {} });
});

test('ext scoring uses the same rule as the main table; weak = score > 0', () => {
  const p = P.createProgress(C);
  const e = P.recordExtAnswer(p, extra[0], false, C);
  assert.equal(e.score, C.score.wrong);
  assert.equal(e.wrong, 1);
  P.recordExtAnswer(p, extra[0], true, C);
  assert.equal(p.ext.symbols[extra[0].id].score, Math.max(C.score.min, C.score.wrong + C.score.right));
  assert.equal(p.ext.symbols[extra[0].id].right, 1);
  assert.deepEqual(P.extWeakRows(p, extra).map((r) => r.id), [extra[0].id]);
  assert.deepEqual(P.extState(p, extra[1]), { sig: P.extSymSig(extra[1]), score: 0, right: 0, wrong: 0 });
});

test('clearProgress keeps settings and clears ext too', () => {
  const p = P.createProgress(C);
  p.settings.theme = 'dark';
  P.recordExtAnswer(p, extra[0], false, C);
  const c = P.clearProgress(p, C);
  assert.equal(c.settings.theme, 'dark');
  assert.deepEqual(c.ext, { symbols: {} });
  assert.deepEqual(c.symbols, {});
});

test('padSwitchKeys: only keycap / position are accepted, anything else falls back to keycap', () => {
  const mk = (v) => { const s = v1Save(); s.settings.padSwitchKeys = v; return norm(clone(s)).settings.padSwitchKeys; };
  assert.equal(mk('position'), 'position');
  assert.equal(mk('keycap'), 'keycap');
  assert.equal(mk('weird'), 'keycap');
  assert.equal(mk(undefined), 'keycap');
  assert.equal(mk(1), 'keycap');
});
