'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createTapCounter, createSecretSequence, displayVersion } = require('../src/core/about.js');

test('5 taps within 3 s trigger; fewer do not', () => {
  const c = createTapCounter();
  assert.deepEqual([0, 500, 1000, 1500].map((t) => c.tap(t)), [false, false, false, false]);
  assert.equal(c.tap(2000), true);
});

test('slow taps never trigger; sliding window and reset after trigger', () => {
  const c = createTapCounter();
  for (let t = 0; t < 20; t++) assert.equal(c.tap(t * 1000), false); // 1 s apart: 4 s span for any 5
  c.reset();
  c.tap(0); c.tap(5000); c.tap(5100); c.tap(5200);
  assert.equal(c.tap(5300), false); // first tap too old
  assert.equal(c.tap(5400), true); // window slides
  assert.equal(c.tap(5500), false); // cleared after trigger
});

test('displayVersion drops a trailing .0 patch', () => {
  assert.equal(displayVersion('1.9.0'), '1.9');
  assert.equal(displayVersion('1.9.1'), '1.9.1');
  assert.equal(displayVersion(''), '');
});

// 彩蛋序列：7 次点按（7 s 内）+ 随后按住 2 s
function tapN(s, n, t0, gap) {
  let t = t0;
  for (let i = 0; i < n; i++) { s.down(t); s.up(t + 80); t += gap; }
  return t;
}

test('secret: 7 taps in 7 s then 2 s hold completes via poll', () => {
  const s = createSecretSequence();
  const t = tapN(s, 7, 0, 500);
  s.down(t + 100);
  assert.equal(s.poll(t + 1000), false);
  assert.equal(s.poll(t + 2100), true);
  assert.equal(s.poll(t + 2200), false); // cleared
});

test('secret: release after the hold also completes; early release resets', () => {
  const a = createSecretSequence();
  let t = tapN(a, 7, 0, 300);
  a.down(t); assert.equal(a.up(t + 2000), true);
  const b = createSecretSequence();
  t = tapN(b, 7, 0, 300);
  b.down(t); assert.equal(b.up(t + 1900), false); // early release
  b.down(t + 2000); assert.equal(b.poll(t + 4100), false); // taps were reset, no longer armed
});

test('secret: fewer than 7 taps, too slow, or long press as a tap do not arm', () => {
  const a = createSecretSequence();
  let t = tapN(a, 5, 0, 500); // 5 次点按 + 第 6 下按住：还差一次（手法 b 需要前 6 次点按）
  a.down(t); assert.equal(a.poll(t + 3000), false);
  const b = createSecretSequence();
  t = tapN(b, 7, 0, 1200); // 7.2 s span
  b.down(t); assert.equal(b.poll(t + 3000), false);
  const c = createSecretSequence();
  for (let i = 0; i < 7; i++) { c.down(i * 1000); c.up(i * 1000 + 900); } // each press too long to be a tap
  c.down(8000); assert.equal(c.poll(11000), false);
});

test('secret: arming times out; cancel resets', () => {
  const a = createSecretSequence();
  const t = tapN(a, 7, 0, 300);
  a.down(t + 9000); assert.equal(a.poll(t + 11500), false); // armed > 7 s ago
  const b = createSecretSequence();
  const u = tapN(b, 7, 0, 300);
  b.down(u); b.cancel();
  b.down(u + 100); assert.equal(b.poll(u + 2500), false);
});

// 现行参数（SECRET）：5 秒内点按 5 次，随后按住约 1.5 秒
const { SECRET } = require('../src/core/about.js');
const mkSecret = () => createSecretSequence(SECRET);

test('SECRET is 5 taps in 5 s then a 1.5 s hold', () => {
  assert.deepEqual({ ...SECRET }, { taps: 5, windowMs: 5000, holdMs: 1500 });
});

test('secret (5/1.5): 5 taps within 5 s, then 1.5 s hold completes via poll or release', () => {
  const s = mkSecret();
  const t = tapN(s, 5, 0, 800);
  s.down(t + 100);
  assert.equal(s.poll(t + 1500), false);
  assert.equal(s.poll(t + 1600), true);
  assert.equal(s.poll(t + 1700), false); // 清零
  const r = mkSecret();
  const u = tapN(r, 5, 0, 800);
  r.down(u); assert.equal(r.up(u + 1500), true);
});

test('secret (5/1.5): 4 taps, taps spread over more than 5 s, or a hold shorter than 1.5 s do not complete', () => {
  const a = mkSecret();
  let t = tapN(a, 3, 0, 500); // 只有 3 次点按，第 4 下按住不够
  a.down(t); assert.equal(a.poll(t + 3000), false);
  const b = mkSecret();
  t = tapN(b, 5, 0, 1300); // 第 1 与第 5 次按下相隔 5.2 s（抬起相隔 5.2 s）
  b.down(t); assert.equal(b.poll(t + 3000), false);
  const c = mkSecret();
  t = tapN(c, 5, 0, 500);
  c.down(t); assert.equal(c.up(t + 1400), false);
  c.down(t + 2000); assert.equal(c.poll(t + 3600), false, 'an early release clears the taps');
});

test('secret (5/1.5): giving the hold too late (after the arm window) starts over; works again after a failed attempt', () => {
  const s = mkSecret();
  let t = tapN(s, 5, 0, 500);
  s.down(t + 9000); assert.equal(s.poll(t + 11000), false);
  s.up(t + 11000);
  t = tapN(s, 5, 20000, 500);
  s.down(t); assert.equal(s.poll(t + 1500), true);
});

test('secret (5/1.5): a cancel (pointer left, blur) after arming clears it; a further short tap after arming also starts over', () => {
  const s = mkSecret();
  let t = tapN(s, 5, 0, 400);
  s.down(t); s.cancel();
  s.down(t + 100); assert.equal(s.poll(t + 2000), false);
  const e = mkSecret();
  t = tapN(e, 6, 0, 400); // 第 6 次短按在武装之后：整体清零
  e.down(t); assert.equal(e.poll(t + 1500), false);
});

// 两种手法都要能触发：(a) 点满 5 次后第 6 下按住；(b) 第 5 下直接按住不松开
test('secret (5/1.5) method b: 4 taps then the 5th press held 1.5 s completes via poll (finger stays down)', () => {
  const s = mkSecret();
  const t = tapN(s, 4, 0, 500);
  s.down(t);
  assert.equal(s.poll(t + 1400), false);
  assert.equal(s.poll(t + 1500), true);
  assert.equal(s.poll(t + 1600), false); // 清零
});

test('secret (5/1.5) method b: releasing after the hold also completes; releasing early does not', () => {
  const a = mkSecret();
  let t = tapN(a, 4, 0, 500);
  a.down(t); assert.equal(a.up(t + 1500), true);
  const b = mkSecret();
  t = tapN(b, 4, 0, 500);
  b.down(t); assert.equal(b.up(t + 1400), false);
  b.down(t + 1500); assert.equal(b.poll(t + 3200), false, 'early release cleared the taps');
});

test('secret (5/1.5) method b: the 4 taps must fall within 5 s of the held press; too few taps never complete', () => {
  const a = mkSecret();
  let t = tapN(a, 4, 0, 1500); // 第 1 次点按抬起在 80ms，第 5 下按下在 6000ms：超出 5 s
  a.down(t); assert.equal(a.poll(t + 2000), false);
  const b = mkSecret();
  t = tapN(b, 2, 0, 400);
  b.down(t); assert.equal(b.poll(t + 5000), false);
  const c = mkSecret();
  t = tapN(c, 4, 0, 400);
  c.down(t); assert.equal(c.poll(t + 1500), true, 'control: within the window it works');
});

test('secret (5/1.5): a stale press (no up, e.g. after a pointercancel) completes by poll and a later cancel/reset leaves it reusable', () => {
  const s = mkSecret();
  let t = tapN(s, 5, 0, 400); // 手法 a：已武装
  s.down(t); // 之后 pointercancel：没有 up，只有定时器 poll
  assert.equal(s.poll(t + 1500), true);
  t += 5000;
  t = tapN(s, 4, t, 400);
  s.down(t); // 手法 b，同样没有 up
  assert.equal(s.poll(t + 1500), true);
  s.down(t + 9000); s.cancel(); // 视图在定时器到点仍未完成时清零
  s.down(t + 9100);
  assert.equal(s.poll(t + 9100 + 1500), false);
});
