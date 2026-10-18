'use strict';
// 设置默认值 / 旧存档迁移；华丽动效与震动在关闭、减少动态、非原生平台时是空操作。
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/progress.js');
const Fx = require('../src/ui/fx.js');
const Hap = require('../src/platform/haptics.js');
const { table, cfg, plan, cats } = require('./helpers/fixtures.js');

const C = cfg();
const catNames = cats.map((c) => c.name);

test('new settings default ON; old saves without the keys load with defaults', () => {
  assert.equal(P.createProgress(C).settings.fx, true);
  assert.equal(P.createProgress(C).settings.haptics, true);
  const old = P.normalizeProgress({ settings: { theme: 'dark', mirror: true } }, table, plan, C, catNames);
  assert.equal(old.settings.fx, true);
  assert.equal(old.settings.haptics, true);
  assert.equal(old.settings.theme, 'dark');
});

test('new settings persist false and reject non-booleans', () => {
  const n = P.normalizeProgress({ settings: { fx: false, haptics: false } }, table, plan, C, catNames);
  assert.equal(n.settings.fx, false);
  assert.equal(n.settings.haptics, false);
  const bad = P.normalizeProgress({ settings: { fx: 'no', haptics: 0 } }, table, plan, C, catNames);
  assert.equal(bad.settings.fx, true);
  assert.equal(bad.settings.haptics, true);
});

/** 记录一切 DOM 触碰的假 document。 */
function fakeDoc() {
  const touched = [];
  const el = () => new Proxy({}, { get(_, k) { touched.push(String(k)); return () => el(); }, set() { touched.push('set'); return true; } });
  return { touched, documentElement: { classList: { toggle() { touched.push('toggle'); } } }, body: el(), createElement: () => { touched.push('create'); return el(); }, createTextNode: () => { touched.push('text'); return el(); } };
}

test('fx is a complete no-op when switched off', () => {
  const doc = fakeDoc();
  const fx = Fx.create({ doc, enabled: () => false, raf: () => assert.fail('raf'), later: () => assert.fail('later') });
  const target = { classList: { add() { assert.fail('add'); }, remove() { assert.fail('remove'); } }, textContent: '90%' };
  assert.equal(fx.active(), false);
  assert.equal(fx.burst([target]), false);
  assert.equal(fx.bump(target), false);
  assert.equal(fx.lift(target), false);
  assert.equal(fx.popStars(target), false);
  assert.equal(fx.countUp(target), false);
  assert.equal(fx.squash([target]), false);
  assert.equal(fx.ring(target), false);
  assert.equal(target.textContent, '90%');
  assert.deepEqual(doc.touched, []);
});

test('fx is a no-op under prefers-reduced-motion even when enabled', () => {
  const fx = Fx.create({ doc: fakeDoc(), enabled: () => true, reduced: () => true, raf: () => assert.fail('raf'), later: () => assert.fail('later') });
  assert.equal(fx.active(), false);
  assert.equal(fx.bump({ classList: { add() { assert.fail('add'); }, remove() { assert.fail('remove'); } } }), false);
  assert.equal(fx.countUp({ textContent: '80%' }), false);
});

test('fx countUp rolls odometer columns, restores the exact text; bump cleans up', () => {
  const timers = [];
  const fx = Fx.create({ doc: fakeDoc(), enabled: () => true, raf: () => {}, later: (f) => timers.push(f) });
  const attrs = {};
  const kids = [];
  const el = { textContent: '85%', offsetWidth: 1, setAttribute: (k, v) => { attrs[k] = v; }, removeAttribute: (k) => { delete attrs[k]; }, replaceChildren: () => { kids.length = 0; }, append: (...n) => kids.push(...n) };
  assert.equal(fx.countUp(el), true);
  assert.equal(attrs['aria-label'], '85%');
  assert.equal(kids.length, 4); // 前缀文本 + 2 列 + 后缀 '%'
  timers.forEach((f) => f());
  assert.equal(el.textContent, '85%');
  assert.equal(attrs['aria-label'], undefined);
  const cls = new Set();
  const b = { offsetWidth: 1, classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c) } };
  assert.equal(fx.bump(b), true);
  assert.ok(cls.has('fx-bump'));
  timers.forEach((f) => f());
  assert.equal(cls.has('fx-bump'), false);
});

test('fx odometer cells: 0..9 then up to the digit', () => {
  assert.deepEqual(Fx.odoCells(0), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
  const c = Fx.odoCells(7);
  assert.equal(c.length, 18);
  assert.equal(c[c.length - 1], 7);
});

test('fx particles: spawn is bounded, step applies drag + gravity and fades out within the cap', () => {
  let k = 0;
  const rand = () => ((k++ * 0.37) % 1);
  const ps = Fx.spawn(30, rand, ['#111', '#222'], { x: 100, y: 100 });
  assert.equal(ps.length, 30);
  assert.ok(ps.every((p) => p.life <= Fx.MAX_MS && p.life >= 500 && p.r >= 2 && p.r <= 6.5));
  assert.ok(new Set(ps.map((p) => p.r.toFixed(2))).size > 5, 'varied sizes');
  const p = { x: 0, y: 0, vx: 300, vy: 0, r: 3, life: 800, age: 0, c: '#000', rot: 0, vr: 0 };
  const a0 = Fx.step(p, 1 / 60);
  assert.equal(a0, 1);
  assert.ok(p.vx < 300 && p.vx > 0, 'drag slows');
  assert.ok(p.vy > 0, 'gravity pulls down');
  let t = 0; let a = 1;
  while (a > 0 && t < 120) { a = Fx.step(p, 1 / 60); t++; }
  assert.equal(a, 0);
  assert.ok(t / 60 <= 0.9, 'finishes within 900 ms');
});

test('fx burst: 20–40 particles, one canvas, cleaned by cancel()', () => {
  const made = [];
  const frames = [];
  const doc = {
    documentElement: { classList: { toggle() {} } },
    body: { append(n) { made.push(n); } },
    createElement(tag) {
      const n = { tag, style: { setProperty() {} }, classList: { add() {}, remove() {} }, setAttribute() {}, append() {}, remove() { n.removed = true; }, getContext: () => ({ scale() {}, clearRect() {} }) };
      return n;
    },
  };
  const rect = { left: 10, top: 10, width: 20, height: 20 };
  const dots = [1, 2, 3].map(() => ({ getBoundingClientRect: () => rect, style: { setProperty() {} }, classList: { add() {}, remove() {} }, offsetWidth: 1, closest: () => null }));
  const fx = Fx.create({ doc, enabled: () => true, raf: (f) => frames.push(f), later: () => {}, view: () => ({ w: 400, h: 800, dpr: 1 }), colors: () => ['#fff'], now: () => 0 });
  assert.equal(fx.burst(dots), true);
  assert.equal(made.filter((n) => n.tag === 'canvas').length, 1);
  assert.equal(frames.length, 1);
  fx.cancel();
  assert.equal(made[0].removed, true);
});

test('haptics: no-op off Android or when the setting is off', () => {
  assert.equal(Hap.create({}).supported, false);
  assert.equal(Hap.create({ cap: { isNativePlatform: () => false, nativePromise: () => assert.fail('call') } }).play('tap', true), false);
  const calls = [];
  const cap = { isNativePlatform: () => true, nativePromise: (p, m, o) => { calls.push([p, m, o]); return Promise.resolve(); } };
  const h = Hap.create({ cap, later: (f) => f() });
  assert.equal(h.supported, true);
  assert.equal(h.play('tap', false), false);
  assert.equal(calls.length, 0);
});

test('haptics patterns on native', () => {
  const calls = [];
  const cap = { isNativePlatform: () => true, nativePromise: (p, m, o) => { calls.push([p, m, o && (o.style || o.type)]); return Promise.resolve(); } };
  const h = Hap.create({ cap, later: (f) => f() });
  h.play('tap', true);
  h.play('tick', true);
  h.play('correct', true);
  h.play('wrong', true);
  h.play('pass', true);
  assert.equal(h.play('bogus', true), false);
  assert.deepEqual(calls.map((c) => c.slice(1).join(':')), ['impact:LIGHT', 'impact:LIGHT', 'impact:LIGHT', 'impact:LIGHT', 'impact:HEAVY', 'notification:SUCCESS']);
});

test('style setting: default material, old saves load as material, glass round-trips, junk rejected', () => {
  assert.equal(P.createProgress(C).settings.style, 'material');
  const old = P.normalizeProgress({ settings: { theme: 'dark', fx: false } }, table, plan, C, catNames);
  assert.equal(old.settings.style, 'material');
  assert.equal(P.normalizeProgress({ settings: { style: 'glass' } }, table, plan, C, catNames).settings.style, 'glass');
  assert.equal(P.normalizeProgress({ settings: { style: 'neon' } }, table, plan, C, catNames).settings.style, 'material');
});
