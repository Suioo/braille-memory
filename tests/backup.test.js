'use strict';
// 记录导出 / 导入 / 撤销：夹具一律从真实 CSV 推出。
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/core/backup.js');
const P = require('../src/core/progress.js');
const { table, cats, cfg, plan } = require('./helpers/fixtures.js');

const C = cfg();
const catNames = cats.map((c) => c.name);
const sample = () => {
  const p = P.createProgress(C);
  p.settings.mirror = true;
  p.settings.theme = 'dark';
  P.recordAnswer(p, table[0], false, C);
  P.recordAnswer(p, table[1], true, C);
  P.recordLessonResult(p, plan[0], { stars: 2, acc: 0.9, avgSec: 6 });
  return p;
};
const parse = (text) => B.parseImport(text, table, plan, C, catNames);
const clone = (o) => JSON.parse(JSON.stringify(o));

test('export wraps the complete progress including settings', () => {
  const p = sample();
  const doc = JSON.parse(B.buildExport(p, '2.0.2', new Date('2026-01-02T03:04:05Z')));
  assert.equal(doc.app, B.APP);
  assert.equal(doc.kind, B.KIND);
  assert.equal(doc.format, B.FORMAT);
  assert.equal(doc.appVersion, '2.0.2');
  assert.equal(doc.exportedAt, '2026-01-02T03:04:05.000Z');
  assert.deepEqual(doc.progress, clone(p));
  assert.equal(doc.progress.settings.theme, 'dark');
});

test('export does not alias or mutate the live progress', () => {
  const p = sample();
  const before = clone(p);
  B.buildExport(p, '1');
  assert.deepEqual(p, before);
});

test('default file name is a dated .json', () => {
  assert.equal(B.defaultFileName(new Date(2026, 0, 5)), 'braille-memory-20260105.json');
});

test('export → import round trip restores everything, skipped = 0', () => {
  const p = sample();
  const r = parse(B.buildExport(p, '2.0.2'));
  assert.equal(r.ok, true);
  assert.deepEqual(r.progress, p);
  assert.equal(r.imported, 3);
  assert.equal(r.skipped, 0);
});

test('records whose symbol signature no longer matches are skipped and counted', () => {
  const p = sample();
  const doc = JSON.parse(B.buildExport(p, '2'));
  doc.progress.symbols[table[0].id].sig = 'changed|sig';
  doc.progress.lessons[plan[0].key].sig = 'changed|sig';
  doc.progress.symbols['no-such-id'] = { sig: 'x', score: 1, right: 0, wrong: 1 };
  const r = parse(JSON.stringify(doc));
  assert.equal(r.ok, true);
  assert.equal(r.imported, 1);
  assert.equal(r.skipped, 3);
  assert.equal(r.progress.symbols[table[0].id], undefined);
  assert.equal(r.progress.lessons[plan[0].key], undefined);
  assert.ok(r.progress.symbols[table[1].id]);
});

test('out-of-range values are clamped by the existing normalizer', () => {
  const doc = JSON.parse(B.buildExport(sample(), '2'));
  doc.progress.symbols[table[1].id].score = 1e9;
  doc.progress.lessons[plan[0].key].stars = 99;
  const r = parse(JSON.stringify(doc));
  assert.equal(r.progress.symbols[table[1].id].score, C.score.max);
  assert.equal(r.progress.lessons[plan[0].key].stars, 3);
});

test('bad files are rejected with a reason and never throw', () => {
  const good = JSON.parse(B.buildExport(sample(), '2'));
  const withDoc = (patch) => JSON.stringify(Object.assign(clone(good), patch));
  const cases = [
    [undefined, 'empty'], [null, 'empty'], ['', 'empty'], ['   \n', 'empty'], [123, 'empty'],
    ['{not json', 'json'], ['\u0000\u0001garbage', 'json'],
    ['null', 'format'], ['[]', 'format'], ['"text"', 'format'], ['{}', 'format'],
    [JSON.stringify(sample()), 'format'], // 直接是存档本身（不是导出文件）
    [withDoc({ app: 'other' }), 'format'],
    [withDoc({ kind: 'x' }), 'format'],
    [withDoc({ progress: null }), 'format'],
    [withDoc({ progress: [] }), 'format'],
    [withDoc({ format: 2 }), 'version'],
    [withDoc({ format: undefined }), 'version'],
    [withDoc({ progress: Object.assign(clone(good.progress), { version: 2 }) }), 'version'],
    [withDoc({ progress: Object.assign(clone(good.progress), { version: undefined }) }), 'version'],
    ['x'.repeat(B.MAX_CHARS + 1), 'size'],
  ];
  for (const [text, reason] of cases) {
    const r = parse(text);
    assert.equal(r.ok, false, String(reason));
    assert.equal(r.reason, reason);
  }
});

test('parseImport never touches the braille table', () => {
  const before = JSON.stringify(table);
  parse(B.buildExport(sample(), '2'));
  assert.equal(JSON.stringify(table), before);
});

/** 内存版 io：可模拟备份 / 保存失败。 */
function makeIo(current, opts) {
  opts = opts || {};
  const io = {
    disk: clone(current), backup: null, saves: [],
    async saveBackup(d) { if (opts.failBackup) return false; io.backup = clone(d); return true; },
    async saveProgress(d) {
      io.saves.push(clone(d));
      if (opts.failSaveAt && io.saves.length === opts.failSaveAt) return false;
      if (opts.throwOnSave && io.saves.length === 1) throw new Error('disk');
      io.disk = clone(d); return true;
    },
    async loadBackup() { return io.backup ? clone(io.backup) : null; },
    async clearBackup() { io.backup = null; return true; },
  };
  return io;
}

test('applyImport backs up first, then overwrites', async () => {
  const cur = sample();
  const next = P.createProgress(C);
  const io = makeIo(cur);
  const r = await B.applyImport(cur, next, io);
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(io.backup, cur);
  assert.deepEqual(io.disk, next);
});

test('applyImport: backup failure aborts before touching the record', async () => {
  const cur = sample();
  const io = makeIo(cur, { failBackup: true });
  const r = await B.applyImport(cur, P.createProgress(C), io);
  assert.deepEqual(r, { ok: false, reason: 'backup' });
  assert.equal(io.saves.length, 0);
  assert.deepEqual(io.disk, cur);
});

test('applyImport: save failure restores the previous record automatically', async () => {
  const cur = sample();
  const io = makeIo(cur, { failSaveAt: 1 });
  const r = await B.applyImport(cur, P.createProgress(C), io);
  assert.deepEqual(r, { ok: false, reason: 'save' });
  assert.deepEqual(io.saves[1], cur);
  assert.deepEqual(io.disk, cur);
});

test('applyImport: a throwing save is treated as failure and restores', async () => {
  const cur = sample();
  const io = makeIo(cur, { throwOnSave: true });
  const r = await B.applyImport(cur, P.createProgress(C), io);
  assert.equal(r.ok, false);
  assert.deepEqual(io.disk, cur);
});

test('undoImport restores the pre-import record and clears the backup', async () => {
  const cur = sample();
  const io = makeIo(cur);
  await B.applyImport(cur, P.createProgress(C), io);
  const r = await B.undoImport(io);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, cur);
  assert.deepEqual(io.disk, cur);
  assert.equal(io.backup, null);
  assert.deepEqual(await B.undoImport(io), { ok: false, reason: 'none' });
});

test('undoImport keeps the backup when writing it back fails', async () => {
  const cur = sample();
  const io = makeIo(cur);
  await B.applyImport(cur, P.createProgress(C), io);
  io.saves.length = 0;
  io.saveProgress = async () => false;
  const r = await B.undoImport(io);
  assert.deepEqual(r, { ok: false, reason: 'save' });
  assert.deepEqual(io.backup, cur);
});

test('a second import overwrites the previous backup', async () => {
  const first = sample();
  const io = makeIo(first);
  const second = P.createProgress(C);
  P.recordAnswer(second, table[2], false, C);
  await B.applyImport(first, second, io);
  await B.applyImport(second, P.createProgress(C), io);
  assert.deepEqual(io.backup, second);
});
