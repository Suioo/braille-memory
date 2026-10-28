'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createProbe } = require('../src/core/frameprobe.js');

/** 按给定的帧间隔序列喂一遍（第一个时间戳只是起点）。 */
function feed(p, gaps, t0) {
  let t = t0 || 1000;
  p.frame(t);
  for (const g of gaps) { t += g; p.frame(t); }
  return t;
}
const steady = (n, ms) => Array.from({ length: n }, () => ms);

test('steady 60 Hz: ~60 fps, no drops, refresh interval estimated from the data', () => {
  const p = createProbe();
  feed(p, steady(300, 16.7));
  const s = p.summary();
  assert.equal(s.frames, 300);
  assert.ok(s.fps >= 58 && s.fps <= 61, String(s.fps));
  assert.equal(s.drops, 0);
  assert.equal(s.longs, 0);
  assert.ok(s.refreshMs > 15 && s.refreshMs < 18, String(s.refreshMs));
});

test('a 120 Hz screen is recognised, so a 23 ms frame is a drop there but not on 60 Hz', () => {
  const p = createProbe();
  feed(p, steady(300, 8.3).concat([23]));
  assert.equal(p.summary().drops, 1);
  const q = createProbe();
  feed(q, steady(300, 16.7).concat([23]));
  assert.equal(q.summary().drops, 0);
});

test('drops, long frames and freezes are counted separately; gaps over 1 s (background) are ignored', () => {
  const p = createProbe();
  feed(p, steady(200, 16.7).concat([40, 60, 250, 5000, 16.7]));
  const s = p.summary();
  assert.equal(s.drops, 3);   // 40 / 60 / 250
  assert.equal(s.longs, 2);   // 60 / 250
  assert.equal(s.freezes, 1); // 250
  assert.equal(s.frames, 200 + 3 + 1); // 5000 ms 的间隔不算一帧
  assert.equal(s.worst, 250);
});

test('scenes: the page name, overridden by a tag while it lasts', () => {
  const p = createProbe();
  p.scene('round');
  let t = 1000; p.frame(t);
  for (let i = 0; i < 50; i++) { t += 16.7; p.frame(t); }
  p.tag('答对动画', t, 300);
  for (let i = 0; i < 10; i++) { t += 16.7; p.frame(t); }
  t += 45; p.frame(t); // 在标签内掉了一帧
  for (let i = 0; i < 60; i++) { t += 16.7; p.frame(t); } // 标签（300 ms）已过，回到页面名
  const r = p.report({ version: '9.9.9', style: 'glass', theme: 'dark', size: '400×800', dpr: 2 });
  assert.match(r, /v9\.9\.9/);
  assert.match(r, /风格 glass/);
  assert.match(r, /答对动画：\d+ \/ 1 \//); // 掉帧 1 次记在标签下
  assert.match(r, /round：\d+ \/ 0 \//);
  assert.match(r, /最差的几帧/);
});

test('worst frames keep only the top N, long-animation-frame records are sorted and trimmed', () => {
  const p = createProbe({ maxWorst: 3, maxLoaf: 2 });
  feed(p, steady(100, 16.7).concat([30, 90, 50, 70, 35]));
  const r = p.report({});
  const worstLines = r.split('最差的几帧')[1].split('\n').filter((l) => /^ {2}\d/.test(l));
  assert.equal(worstLines.length, 3);
  assert.match(worstLines[0], /^ {2}90 /);
  p.addLoaf({ duration: 80, blockingDuration: 20, startTime: 1, scripts: [{ sourceURL: 'file:///app/src/views/round.js', invoker: 'cb' }] });
  p.addLoaf({ duration: 120, blockingDuration: 70, startTime: 2, scripts: [] });
  p.addLoaf({ duration: 60, blockingDuration: 0, startTime: 3 });
  p.addLoaf(null);
  p.addLoaf({ duration: 0 });
  const l = p.report({}).split('long-animation-frame')[1].split('\n').filter((x) => /^ {2}\d/.test(x));
  assert.equal(l.length, 2);
  assert.match(l[0], /^ {2}120 \/ 70/);
  assert.match(l[1], /round\.js/);
});

test('reset clears everything; an empty probe reports zeros without throwing', () => {
  const p = createProbe();
  assert.deepEqual(p.summary(), { frames: 0, refreshMs: 16.7, fps: 0, p95: 0, p99: 0, worst: 0, drops: 0, longs: 0, freezes: 0 });
  assert.ok(p.report({}).includes('总计 0 帧'));
  feed(p, steady(20, 16.7));
  p.reset();
  assert.equal(p.summary().frames, 0);
  feed(p, steady(5, 16.7));
  assert.equal(p.summary().frames, 5);
});
