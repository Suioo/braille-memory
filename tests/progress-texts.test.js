'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/progress.js');
const B = require('../src/core/backup.js');
const T = require('../src/core/texts.js');
const Pick = require('../src/core/pick.js');
const { table, cats, cfg, plan, extra, ruleData, translator: tr, pmap, dict, dictProvider } = require('./helpers/fixtures.js');

const C = cfg();
const catNames = cats.map((c) => c.name);
const clone = (o) => JSON.parse(JSON.stringify(o));
const words = [...dict.keys()].filter((w) => Array.from(w).length >= 2);
const stop = Object.keys(pmap.punctuation).find((k) => pmap.punctuation[k] === '句号');
const mkText = (store, raw) => T.createText(store, { raw, rng: Pick.makeRng(store.texts.length + 5), map: pmap, provider: dictProvider }).text;
const store1 = () => { let s = T.emptyStore(); s = T.addText(s, mkText(s, words[0] + words[1] + stop + words[2] + stop)); return s; };
const api = (current) => ({ normalize: T.normalizeStore, entries: (s) => T.buildItems(s, tr).entries, current });
const norm = (raw, textEntries) => P.normalizeProgress(raw, table, plan, C, catNames, extra, ruleData.entries, textEntries);

test('text sentence answers are scored like the others and stored only under progress.texts', () => {
  const p = P.createProgress(C);
  const d = T.buildItems(store1(), tr);
  const it = d.items[0];
  assert.deepEqual(P.textState(p, it), { sig: it.sig, score: 0, right: 0, wrong: 0 });
  const e = P.recordTextAnswer(p, it, false, C);
  assert.equal(e.score, C.score.wrong);
  assert.equal(e.wrong, 1);
  P.recordTextAnswer(p, it, true, C);
  assert.equal(p.texts.items[it.key].right, 1);
  assert.deepEqual(p.symbols, {});
  assert.deepEqual(p.rules, { items: {} });
  assert.deepEqual(P.textWeakItems(p, d.items).map((x) => x.key), [it.key]);
  P.recordTextAnswer(p, d.items[1], false, C);
  P.removeTextProgress(p, store1().texts[0].id === it.textId ? it.textId : it.textId);
  assert.deepEqual(p.texts.items, {}, 'deleting a text deletes its records');
});

test('removeTextProgress only touches that text', () => {
  const p = P.createProgress(C);
  p.texts.items['t:t_aaaaa#s1'] = { sig: 'x', score: 1, right: 0, wrong: 1 };
  p.texts.items['t:t_aaaaa#s2'] = { sig: 'x', score: 1, right: 0, wrong: 1 };
  p.texts.items['t:t_bbbbb#s1'] = { sig: 'x', score: 1, right: 0, wrong: 1 };
  P.removeTextProgress(p, 't_aaaaa');
  assert.deepEqual(Object.keys(p.texts.items), ['t:t_bbbbb#s1']);
});

test('v1 / v2 / v3 saves still load: every old field is kept, texts starts empty', () => {
  const p = P.createProgress(C);
  P.recordAnswer(p, table[0], false, C);
  P.recordExtAnswer(p, extra[0], false, C);
  P.recordRuleAnswer(p, ruleData.words[0], false, C);
  const v3 = clone(p); delete v3.texts; v3.version = 3;
  const q = norm(v3);
  assert.equal(q.version, P.VERSION);
  assert.deepEqual(q.symbols, p.symbols);
  assert.deepEqual(q.ext, p.ext);
  assert.deepEqual(q.rules, p.rules);
  assert.deepEqual(q.texts, { items: {}, runs: {} });
  const v2 = clone(v3); delete v2.rules; v2.version = 2;
  assert.deepEqual(norm(v2).rules, { items: {} });
  const v1 = clone(v2); delete v1.ext; v1.version = 1;
  assert.deepEqual(norm(v1).symbols, p.symbols);
  assert.deepEqual(norm(v1).texts, { items: {}, runs: {} });
});

test('text records: round trip; stale signature dropped; unknown key dropped; unavailable (no entries) → kept, junk filtered', () => {
  const d = T.buildItems(store1(), tr);
  const p = P.createProgress(C);
  P.recordTextAnswer(p, d.items[0], false, C);
  P.recordTextAnswer(p, d.items[1], true, C);
  assert.deepEqual(norm(clone(p), d.entries), p);
  const raw = clone(p);
  raw.texts.items[d.items[0].key].sig = 'changed';
  raw.texts.items['t:t_zzzzz#s9'] = { sig: 'x', score: 1, right: 0, wrong: 1 };
  raw.texts.items[d.items[1].key].score = 1e9;
  const q = norm(raw, d.entries);
  assert.equal(q.texts.items[d.items[0].key], undefined);
  assert.equal(q.texts.items['t:t_zzzzz#s9'], undefined);
  assert.equal(q.texts.items[d.items[1].key].score, C.score.max);
  assert.deepEqual(norm(clone(p)).texts, p.texts, 'no entries → existing records preserved');
  const junk = clone(p); junk.texts.items['not a key!'] = { sig: 'x' }; junk.texts.items[d.items[0].key] = 'nope';
  assert.deepEqual(Object.keys(norm(junk).texts.items), [d.items[1].key]);
  assert.deepEqual(norm({ version: 4, texts: 'bad' }).texts, { items: {}, runs: {} });
});

test('clearProgress keeps settings and clears text records too', () => {
  const p = P.createProgress(C);
  p.settings.theme = 'dark';
  P.recordTextAnswer(p, T.buildItems(store1(), tr).items[0], false, C);
  const c = P.clearProgress(p, C);
  assert.equal(c.settings.theme, 'dark');
  assert.deepEqual(c.texts, { items: {}, runs: {} });
});

test('export format 2 carries the text library; import accepts format 1 and 2', () => {
  const store = store1();
  const d = T.buildItems(store, tr);
  const p = P.createProgress(C);
  P.recordAnswer(p, table[0], false, C);
  P.recordTextAnswer(p, d.items[0], false, C);
  const text = B.buildExport(p, '2.5.0', new Date('2026-01-02T00:00:00Z'), store);
  const doc = JSON.parse(text);
  assert.equal(doc.format, 2);
  assert.equal(B.FORMAT, 2);
  assert.deepEqual(doc.texts, store);
  const r = B.parseImport(text, table, plan, C, catNames, extra, ruleData.entries, api(T.emptyStore()));
  assert.equal(r.ok, true);
  assert.deepEqual(r.progress, p);
  assert.deepEqual(r.texts, store);
  assert.equal(r.textCount, 1);
  assert.equal(r.imported, 2);
  assert.equal(r.skipped, 0);
  // 没有 texts 的 format 1 文件：现有文本不动（texts = null），记录按现有文本校验
  const old = JSON.parse(text); delete old.texts; old.format = 1;
  const r1 = B.parseImport(JSON.stringify(old), table, plan, C, catNames, extra, ruleData.entries, api(store));
  assert.equal(r1.ok, true);
  assert.equal(r1.texts, null);
  assert.equal(r1.textCount, null);
  assert.deepEqual(r1.progress.texts, p.texts);
  // 没有现有文本、文件也没带文本：句子记录因签名无从验证而被丢弃并计入跳过
  const r2 = B.parseImport(JSON.stringify(old), table, plan, C, catNames, extra, ruleData.entries, api(T.emptyStore()));
  assert.deepEqual(r2.progress.texts, { items: {}, runs: {} });
  assert.equal(r2.skipped, 1);
  // 不带 texts API（旧调用方式）：仍可导入，句子记录原样保留
  assert.equal(B.parseImport(JSON.stringify(old), table, plan, C, catNames, extra, ruleData.entries).ok, true);
});

test('import refuses broken or over-limit text libraries, and unknown formats', () => {
  const store = store1();
  const p = P.createProgress(C);
  const doc = JSON.parse(B.buildExport(p, '2.5.0', new Date(), store));
  const run = (d, a) => B.parseImport(JSON.stringify(d), table, plan, C, catNames, extra, ruleData.entries, a === undefined ? api(T.emptyStore()) : a);
  assert.equal(run(Object.assign({}, doc, { texts: 5 })).reason, 'format');
  assert.equal(run(Object.assign({}, doc, { texts: { texts: Array.from({ length: T.LIMITS.texts + 1 }, (_, i) => ({ id: 't_' + String(i).padStart(5, '0'), sentences: [] })) } })).reason, 'limit');
  assert.equal(B.parseImport(JSON.stringify(doc), table, plan, C, catNames, extra, ruleData.entries, null).reason, 'format', 'texts present but no way to validate them');
  assert.equal(run(Object.assign({}, doc, { format: 3 })).reason, 'version');
  assert.equal(run(Object.assign({}, doc, { format: 0 })).reason, 'version');
  assert.equal(run(Object.assign({}, doc, { progress: Object.assign({}, doc.progress, { version: P.VERSION + 1 }) })).reason, 'version');
});

test('bundle apply: backs up progress AND texts first, writes both, restores both on failure', async () => {
  const cur = { kind: 'bundle', progress: P.createProgress(C), texts: store1() };
  const next = { kind: 'bundle', progress: P.createProgress(C), texts: T.emptyStore() };
  next.progress.settings.theme = 'dark';
  const mkIo = (opts) => {
    const io = { backup: null, progress: clone(cur.progress), texts: clone(cur.texts), log: [],
      async saveBackup(d) { io.log.push('backup'); if (opts && opts.failBackup) return false; io.backup = clone(d); return true; },
      async saveProgress(d) { io.log.push('progress'); if (opts && opts.failProgress && io.log.filter((x) => x === 'progress').length === 1) return false; io.progress = clone(d); return true; },
      async saveTexts(d) { io.log.push('texts'); if (opts && opts.failTexts && io.log.filter((x) => x === 'texts').length === 1) return false; io.texts = clone(d); return true; },
      async loadBackup() { return io.backup ? clone(io.backup) : null; },
      async clearBackup() { io.backup = null; return true; } };
    return io;
  };
  let io = mkIo();
  assert.deepEqual(await B.applyImport(cur, next, io), { ok: true });
  assert.equal(io.log[0], 'backup');
  assert.deepEqual(io.texts, T.emptyStore());
  assert.equal(io.progress.settings.theme, 'dark');
  assert.equal(io.backup.textsReplaced, true);
  assert.deepEqual(io.backup.texts, cur.texts);
  const u = await B.undoImport(io);
  assert.equal(u.ok, true);
  assert.deepEqual(io.texts, cur.texts);
  assert.deepEqual(io.progress, cur.progress);
  assert.equal(io.backup, null);
  // 文本保存失败 → 两者都恢复
  io = mkIo({ failTexts: true });
  assert.deepEqual(await B.applyImport(cur, next, io), { ok: false, reason: 'save' });
  assert.deepEqual(io.texts, cur.texts);
  assert.deepEqual(io.progress, cur.progress);
  // 备份失败 → 什么都不写
  io = mkIo({ failBackup: true });
  assert.deepEqual(await B.applyImport(cur, next, io), { ok: false, reason: 'backup' });
  assert.deepEqual(io.log, ['backup']);
  // 文件里没带文本（texts: null）→ 不动文本，撤销也不还原文本
  io = mkIo();
  assert.deepEqual(await B.applyImport(cur, { kind: 'bundle', progress: next.progress, texts: null }, io), { ok: true });
  assert.equal(io.log.includes('texts'), false);
  assert.equal(io.backup.textsReplaced, false);
  io.texts = { version: 1, texts: [] }; // 之后用户改了文本
  const u2 = await B.undoImport(io);
  assert.equal(u2.ok, true);
  assert.deepEqual(io.texts, { version: 1, texts: [] }, 'undo leaves the texts alone');
});

test('legacy (plain progress) backups still undo', async () => {
  const p = P.createProgress(C);
  const io = { backup: clone(p), progress: null, async loadBackup() { return io.backup; }, async saveProgress(d) { io.progress = d; return true; }, async clearBackup() { io.backup = null; return true; } };
  const u = await B.undoImport(io);
  assert.equal(u.ok, true);
  assert.deepEqual(io.progress, p);
  assert.equal(u.texts, undefined);
});
