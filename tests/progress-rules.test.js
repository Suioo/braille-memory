'use strict';
// 规则 / 词句进度（progress.rules）：单独存放，v1 / v2 存档与导出文件照常读入，导出导入一并带上。
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/progress.js');
const B = require('../src/core/backup.js');
const { table, cats, cfg, plan, extra, ruleData: d } = require('./helpers/fixtures.js');

const C = cfg();
const catNames = cats.map((c) => c.name);
const clone = (o) => JSON.parse(JSON.stringify(o));
const norm = (raw, ruleEntries) => P.normalizeProgress(raw, table, plan, C, catNames, extra, ruleEntries);

test('rule answers are scored like the others and stored only under progress.rules', () => {
  const p = P.createProgress(C);
  const item = d.words[0];
  assert.deepEqual(P.ruleState(p, item), { sig: item.sig, score: 0, right: 0, wrong: 0 });
  const e = P.recordRuleAnswer(p, item, false, C);
  assert.equal(e.score, C.score.wrong);
  assert.equal(e.wrong, 1);
  assert.equal(e.sig, item.sig);
  P.recordRuleAnswer(p, item, true, C);
  assert.equal(p.rules.items[item.key].right, 1);
  assert.equal(p.rules.items[item.key].score, Math.max(C.score.min, C.score.wrong + C.score.right));
  assert.deepEqual(p.symbols, {});
  assert.deepEqual(p.ext, { symbols: {} });
  assert.deepEqual(P.ruleWeakItems(p, d.words).map((x) => x.key), [item.key]);
});

test('v1 and v2 saves still load: every old field is kept, rules starts empty', () => {
  const p = P.createProgress(C);
  P.recordAnswer(p, table[0], false, C);
  P.recordExtAnswer(p, extra[0], false, C);
  const v2 = clone(p);
  delete v2.rules;
  v2.version = 2;
  const q = norm(v2, d.entries);
  assert.equal(q.version, P.VERSION);
  assert.deepEqual(q.symbols, p.symbols);
  assert.deepEqual(q.ext, p.ext);
  assert.deepEqual(q.settings, p.settings);
  assert.deepEqual(q.rules, { items: {} });
  const v1 = clone(v2);
  delete v1.ext;
  v1.version = 1;
  const r = norm(v1, d.entries);
  assert.deepEqual(r.symbols, p.symbols);
  assert.deepEqual(r.ext, { symbols: {} });
  assert.deepEqual(r.rules, { items: {} });
});

test('current save round trips; stale signatures and unknown keys are dropped; numbers clamped', () => {
  const p = P.createProgress(C);
  P.recordRuleAnswer(p, d.words[0], false, C);
  P.recordRuleAnswer(p, d.judge[0], true, C);
  assert.deepEqual(norm(clone(p), d.entries), p);
  const raw = clone(p);
  raw.rules.items[d.words[0].key].sig = 'changed';
  raw.rules.items[d.judge[0].key].score = 1e9;
  raw.rules.items['w:no.such#9'] = { sig: 'x', score: 1, right: 0, wrong: 1 };
  const q = norm(raw, d.entries);
  assert.equal(q.rules.items[d.words[0].key], undefined);
  assert.equal(q.rules.items[d.judge[0].key].score, C.score.max);
  assert.equal(q.rules.items['w:no.such#9'], undefined);
});

test('rules data unavailable (ruleEntries omitted): existing records are preserved, never lost; junk is filtered', () => {
  const p = P.createProgress(C);
  P.recordRuleAnswer(p, d.words[3], false, C);
  assert.deepEqual(norm(clone(p)).rules, p.rules);
  const junk = clone(p);
  junk.rules.items['not a key!'] = { sig: 'x' };
  junk.rules.items[d.words[4].key] = 'nope';
  junk.rules.items[d.words[5].key] = { sig: 5 };
  assert.deepEqual(norm(junk).rules, p.rules);
  assert.deepEqual(norm({ version: 3, rules: 'bad' }).rules, { items: {} });
  assert.deepEqual(norm(null).rules, { items: {} });
});

test('clearProgress keeps settings and clears rule records too', () => {
  const p = P.createProgress(C);
  p.settings.theme = 'dark';
  P.recordRuleAnswer(p, d.words[0], false, C);
  const c = P.clearProgress(p, C);
  assert.equal(c.settings.theme, 'dark');
  assert.deepEqual(c.rules, { items: {} });
});

test('export / import: rule records go along, count as entries, and old exports (v1 / v2) still import', () => {
  const p = P.createProgress(C);
  P.recordAnswer(p, table[0], false, C);
  P.recordRuleAnswer(p, d.words[0], false, C);
  P.recordRuleAnswer(p, d.judge[1], false, C);
  const text = B.buildExport(p, '2.4.0');
  const r = B.parseImport(text, table, plan, C, catNames, extra, d.entries);
  assert.equal(r.ok, true);
  assert.deepEqual(r.progress, p);
  assert.equal(r.imported, 3);
  assert.equal(r.skipped, 0);
  // 规则数据不可用：记录原样保留
  assert.deepEqual(B.parseImport(text, table, plan, C, catNames, extra).progress.rules, p.rules);
  // 签名不符：丢弃并计入跳过
  const doc = JSON.parse(text);
  doc.progress.rules.items[d.words[0].key].sig = 'changed';
  const r2 = B.parseImport(JSON.stringify(doc), table, plan, C, catNames, extra, d.entries);
  assert.equal(r2.progress.rules.items[d.words[0].key], undefined);
  assert.equal(r2.skipped, 1);
  // 老导出文件（v2、没有 rules）
  const old = JSON.parse(text);
  delete old.progress.rules;
  old.progress.version = 2;
  const r3 = B.parseImport(JSON.stringify(old), table, plan, C, catNames, extra, d.entries);
  assert.equal(r3.ok, true);
  assert.deepEqual(r3.progress.rules, { items: {} });
  assert.deepEqual(r3.progress.symbols, p.symbols);
  // 比当前新的版本被明确拒绝
  old.progress.version = P.VERSION + 1;
  assert.equal(B.parseImport(JSON.stringify(old), table, plan, C, catNames, extra, d.entries).reason, 'version');
});
