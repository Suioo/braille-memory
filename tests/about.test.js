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
  let t = tapN(a, 6, 0, 500);
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
