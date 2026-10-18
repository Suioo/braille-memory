'use strict';
// 存档读写：只在系统临时目录下操作，绝不触碰真实 userData。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Store } = require('../src/main/store.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bm-store-'));

test('missing file → empty; save then load round-trips; no .tmp left', () => {
  const s = new Store(tmp());
  assert.deepEqual(s.load(), { status: 'empty', data: null });
  s.save({ version: 1, a: [1, 2] });
  assert.deepEqual(s.load(), { status: 'ok', data: { version: 1, a: [1, 2] } });
  s.save({ version: 1, a: [3] });
  assert.deepEqual(s.load().data, { version: 1, a: [3] });
  assert.equal(fs.existsSync(s.file + '.tmp'), false);
});

test('corrupt file is backed up as .corrupt and treated as empty', () => {
  const s = new Store(tmp());
  fs.writeFileSync(s.file, '{"version":1,', 'utf8');
  const r = s.load();
  assert.equal(r.status, 'corrupt');
  assert.equal(r.backup, s.file + '.corrupt');
  assert.equal(fs.readFileSync(r.backup, 'utf8'), '{"version":1,');
  assert.equal(fs.existsSync(s.file), false);
  fs.writeFileSync(s.file, '[]', 'utf8');
  const r2 = s.load();
  assert.equal(r2.status, 'corrupt');
  assert.notEqual(r2.backup, s.file + '.corrupt'); // 不覆盖第一个备份
  assert.ok(fs.existsSync(s.file + '.corrupt'));
});

test('save creates the directory if needed', () => {
  const dir = path.join(tmp(), 'nested', 'dir');
  new Store(dir).save({ ok: true });
  assert.ok(fs.existsSync(path.join(dir, 'progress.json')));
});
