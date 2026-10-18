'use strict';
// 平台适配层（Web / Capacitor）的记录导出与撤销备份：在 vm 里加载 web.js，注入假环境。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { WebStore } = require('../src/platform/web-store.js');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'platform', 'web.js'), 'utf8');

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

/** vm 里的对象原型不同，比较前统一转成本 realm 的普通 JSON。 */
const plain = (v) => JSON.parse(JSON.stringify(v));

function load(extra) {
  const storage = new FakeStorage();
  const root = Object.assign({ BMWebStore: { WebStore }, localStorage: storage, BMCsv: {}, BMConfig: {} }, extra);
  root.self = root;
  vm.runInNewContext(SRC, root);
  return { bm: root.bm, storage };
}

test('backup save / load / clear use a key separate from the main record', async () => {
  const { bm, storage } = load();
  assert.equal(await bm.loadBackup(), null);
  assert.equal(await bm.saveBackup({ version: 1, a: 1 }), true);
  assert.deepEqual(plain(await bm.loadBackup()), { version: 1, a: 1 });
  assert.equal(storage.getItem('braille-memory.progress'), null);
  assert.equal(await bm.saveProgress({ version: 1, b: 2 }), true);
  assert.deepEqual(plain(await bm.loadBackup()), { version: 1, a: 1 });
  assert.equal(await bm.clearBackup(), true);
  assert.equal(await bm.loadBackup(), null);
  assert.deepEqual(JSON.parse(storage.getItem('braille-memory.progress')), { version: 1, b: 2 });
});

test('saveBackup rejects non-objects', async () => {
  const { bm } = load();
  assert.equal(await bm.saveBackup(null), false);
  assert.equal(await bm.saveBackup('x'), false);
});

test('Android export: writes a cache file, then hands its uri to Share', async () => {
  const calls = [];
  const Capacitor = {
    isNativePlatform: () => true,
    nativePromise: async (plugin, method, options) => {
      calls.push([plugin, method, options]);
      return plugin === 'Filesystem' ? { uri: 'file:///cache/' + options.path } : {};
    },
  };
  const { bm } = load({ Capacitor });
  const r = await bm.exportRecord('{"x":1}', 'a.json');
  assert.deepEqual(plain(r), { ok: true });
  assert.deepEqual(plain(calls[0]), ['Filesystem', 'writeFile', { path: 'a.json', data: '{"x":1}', directory: 'CACHE', encoding: 'utf8' }]);
  assert.equal(calls[1][0], 'Share');
  assert.equal(calls[1][1], 'share');
  assert.equal(calls[1][2].url, 'file:///cache/a.json');
});

test('Android export: plugin failure → not ok; share cancel → canceled', async () => {
  const mk = (err) => ({ isNativePlatform: () => true, nativePromise: async (plugin) => { if (plugin === 'Share' || err.all) throw new Error(err.msg); return { uri: 'file:///x' }; } });
  assert.deepEqual(plain(await load({ Capacitor: mk({ msg: 'Share canceled' }) }).bm.exportRecord('{}', 'a.json')), { ok: false, canceled: true });
  assert.deepEqual(plain(await load({ Capacitor: mk({ msg: 'disk full', all: true }) }).bm.exportRecord('{}', 'a.json')), { ok: false });
});
