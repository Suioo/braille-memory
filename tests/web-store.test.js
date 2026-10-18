'use strict';
// Web/Capacitor 存档适配：假 localStorage；进度数据用真实 CSV 推出。
const test = require('node:test');
const assert = require('node:assert/strict');
const { WebStore, DEFAULT_KEY } = require('../src/platform/web-store.js');
const P = require('../src/core/progress.js');
const { table, cats, cfg, plan } = require('./helpers/fixtures.js');

/** 最小 localStorage 替身，可记录写入顺序、可模拟写入失败。 */
class FakeStorage {
  constructor() { this.map = new Map(); this.log = []; this.failOn = null; }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) {
    if (this.failOn === k) throw new Error('quota');
    this.log.push('set:' + k);
    this.map.set(k, String(v));
  }
  removeItem(k) { this.log.push('rm:' + k); this.map.delete(k); }
}

const C = cfg();

test('empty storage → empty; save writes tmp first, then main, then removes tmp', () => {
  const s = new FakeStorage();
  const st = new WebStore(s);
  assert.deepEqual(st.load(), { status: 'empty', data: null });
  const p = P.createProgress(C);
  P.recordAnswer(p, table[0], false, C);
  st.save(p);
  assert.deepEqual(s.log, ['set:' + DEFAULT_KEY + '.tmp', 'set:' + DEFAULT_KEY, 'rm:' + DEFAULT_KEY + '.tmp']);
  const r = st.load();
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.data, JSON.parse(JSON.stringify(p)));
});

test('same JSON schema as the Electron store: normalizeProgress accepts it unchanged', () => {
  const s = new FakeStorage();
  const st = new WebStore(s);
  const p = P.createProgress(C);
  p.settings.mirror = true;
  P.recordAnswer(p, table[1], false, C);
  P.recordLessonResult(p, plan[0], { stars: 2, acc: 0.9, avgSec: 8 });
  st.save(p);
  const n = P.normalizeProgress(st.load().data, table, plan, C, cats.map((c) => c.name));
  assert.deepEqual(n, JSON.parse(JSON.stringify(p)));
});

test('interrupted write: main missing but tmp present → recovered from tmp', () => {
  const s = new FakeStorage();
  const p = P.createProgress(C);
  s.setItem(DEFAULT_KEY + '.tmp', JSON.stringify(p));
  const st = new WebStore(s);
  const r = st.load();
  assert.equal(r.status, 'ok');
  assert.equal(r.recovered, true);
  assert.equal(s.getItem(DEFAULT_KEY + '.tmp'), null);
  assert.equal(s.getItem(DEFAULT_KEY), JSON.stringify(p));
});

test('failed main write keeps the previous save intact', () => {
  const s = new FakeStorage();
  const st = new WebStore(s);
  const p1 = P.createProgress(C);
  st.save(p1);
  const p2 = P.createProgress(C);
  P.recordAnswer(p2, table[2], false, C);
  s.failOn = DEFAULT_KEY;
  assert.throws(() => st.save(p2), /quota/);
  s.failOn = null;
  assert.equal(s.getItem(DEFAULT_KEY), JSON.stringify(p1));
});

test('corrupt → copy kept under .corrupt (timestamped if one exists), start empty', () => {
  const s = new FakeStorage();
  const st = new WebStore(s, undefined, () => 42);
  s.setItem(DEFAULT_KEY, '{"version":1,');
  const r = st.load();
  assert.equal(r.status, 'corrupt');
  assert.equal(r.backup, DEFAULT_KEY + '.corrupt');
  assert.equal(s.getItem(DEFAULT_KEY + '.corrupt'), '{"version":1,');
  assert.equal(s.getItem(DEFAULT_KEY), null);
  s.setItem(DEFAULT_KEY, '[]');
  const r2 = st.load();
  assert.equal(r2.backup, DEFAULT_KEY + '.42.corrupt');
  assert.equal(s.getItem(DEFAULT_KEY + '.corrupt'), '{"version":1,');
  assert.deepEqual(st.load(), { status: 'empty', data: null });
});

test('clear progress keeps settings after a save/load round trip', () => {
  const s = new FakeStorage();
  const st = new WebStore(s);
  const p = P.createProgress(C);
  p.settings.seed = P.SEED_NAMES[2];
  P.recordAnswer(p, table[0], false, C);
  st.save(P.clearProgress(p, C));
  const d = st.load().data;
  assert.deepEqual(d.symbols, {});
  assert.equal(d.settings.seed, P.SEED_NAMES[2]);
});
