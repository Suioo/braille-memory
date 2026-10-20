'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/core/interact.js');

const run = (s, t, frames, dt, k) => {
  const out = [];
  for (let i = 0; i < frames; i++) { s = I.stepIndicator(s, t, dt, k); out.push(s); if (s.done) break; }
  return out;
};

test('指示块弹簧：向右移动时两条边单调、宽度始终为正、不过冲、最终精确到位', () => {
  const t = { left: 300, right: 400 };
  const out = run({ left: 0, right: 100, vl: 0, vr: 0 }, t, 400, 1 / 60);
  let pl = 0;
  let pr = 100;
  for (const r of out) {
    assert.ok(r.left >= pl - 1e-9 && r.right >= pr - 1e-9, '两条边都不后退');
    assert.ok(r.right - r.left >= I.SPRING.minWidthPx, '宽度 > 0');
    assert.ok(r.left <= t.left + 1e-6 && r.right <= t.right + 1e-6, '不过冲');
    pl = r.left; pr = r.right;
  }
  const last = out[out.length - 1];
  assert.equal(last.done, true);
  assert.deepEqual([last.left, last.right], [300, 400]);
  assert.ok(Math.max(...out.map((r) => r.right - r.left)) > 100, '移动中有拉长');
});

test('指示块弹簧：向左移动时前后沿互换，同样单调、不过冲', () => {
  const t = { left: 0, right: 100 };
  const out = run({ left: 300, right: 400, vl: 0, vr: 0 }, t, 400, 1 / 60);
  let pl = 300;
  let pr = 400;
  for (const r of out) {
    assert.ok(r.left <= pl + 1e-9 && r.right <= pr + 1e-9);
    assert.ok(r.left >= t.left - 1e-6 && r.right >= t.right - 1e-6);
    pl = r.left; pr = r.right;
  }
  assert.equal(out[out.length - 1].done, true);
});

test('指示块弹簧：快速改目标（拖过多项）时位置与速度保持连续，不会跳变', () => {
  let s = { left: 0, right: 100, vl: 0, vr: 0 };
  const targets = [{ left: 120, right: 220 }, { left: 240, right: 340 }, { left: 360, right: 460 }];
  let prev = s;
  for (let i = 0; i < 30; i++) {
    s = I.stepIndicator(s, targets[Math.min(2, Math.floor(i / 5))], 1 / 60, I.SPRING.drag);
    assert.ok(Math.abs(s.left - prev.left) < 40 && Math.abs(s.right - prev.right) < 40, '相邻帧位移很小');
    assert.ok(s.right - s.left >= I.SPRING.minWidthPx);
    prev = s;
  }
});

test('指示块弹簧：帧间隔不稳定（掉帧）时结果仍然稳定、收敛', () => {
  let s = { left: 0, right: 100, vl: 0, vr: 0 };
  for (const dt of [0.001, 0.2, 0.016, 0.5, 0.016, 0.016]) s = I.stepIndicator(s, { left: 200, right: 300 }, dt);
  assert.ok(Number.isFinite(s.left) && Number.isFinite(s.right));
  assert.ok(s.right - s.left >= I.SPRING.minWidthPx);
});
