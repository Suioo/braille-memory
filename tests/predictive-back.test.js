'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PB = require('../src/platform/predictive-back.js');

test('预测性返回：进度 0 不变形，进度 1 缩到 80%、让出 56px、圆角 40px，中间单调', () => {
  const a = PB.shape(0, 0);
  assert.deepEqual([a.scale, a.shift, a.radius, a.underScale, a.underBright], [1, 0, 0, 0.88, 0.62]);
  const z = PB.shape(1, 0);
  assert.ok(Math.abs(z.scale - 0.8) < 1e-9 && Math.abs(z.shift - 56) < 1e-9 && Math.abs(z.radius - 40) < 1e-9 && Math.abs(z.underScale - 1) < 1e-9 && Math.abs(z.underBright - 1) < 1e-9);
  let prev = PB.shape(0, 0);
  for (let i = 1; i <= 20; i++) {
    const s = PB.shape(i / 20, 0);
    assert.ok(s.scale <= prev.scale && s.shift >= prev.shift && s.radius >= prev.radius);
    prev = s;
  }
});

test('预测性返回：从右边缘滑动时向左让出；越界、非数字进度被限制', () => {
  assert.ok(PB.shape(1, 1).shift < 0);
  assert.equal(PB.shape(5, 0).scale, PB.shape(1, 0).scale);
  assert.equal(PB.shape(-3, 0).scale, 1);
  assert.equal(PB.shape('abc', 0).scale, 1);
});
