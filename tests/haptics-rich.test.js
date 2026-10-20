'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/core/haptics.js');

const cfg = { limits: { maxPatternMs: 700 } };

test('dotRows：阅读视角左列 1 2 3、右列 4 5 6；镜像互换左右', () => {
  assert.deepEqual(H.dotRows([1, 4, 5], false), [[true, true], [false, true], [false, false]]);
  assert.deepEqual(H.dotRows([1, 4, 5], true), [[true, true], [true, false], [false, false]]);
  assert.deepEqual(H.dotRows([], false), [[false, false], [false, false], [false, false]]);
});

test('点位节奏：一行一拍，左列强马达、右列弱马达，没有凸点的行留空白', () => {
  const rows = H.dotRows([1, 3, 5], false); // 左 1、3；右 5 → 行1 左，行2 右，行3 左
  const p = H.buildPattern('dots', cfg, null, { style: 'normal', rows });
  assert.equal(p.length, 3);
  assert.ok(p[0].strong > 0 && p[0].weak === 0);
  assert.ok(p[1].strong === 0 && p[1].weak > 0);
  assert.ok(p[2].strong > 0 && p[2].weak === 0);
  assert.ok(p[1].at > p[0].at && p[2].at > p[1].at);
  const gap = H.buildPattern('dots', cfg, null, { rows: H.dotRows([3], false) });
  assert.equal(gap.length, 1);
  assert.ok(gap[0].at > 0, '第 1、2 行空白，节拍位置保持不变');
  assert.deepEqual(H.buildPattern('dots', cfg, null, { rows: [] }), []);
});

test('震动风格：轻 < 标准 < 丰富；丰富的答对 / 答错 / 连对更有层次，且都不超过总时长上限', () => {
  const m = (style, ev) => Math.max(...H.buildPattern(ev, cfg, null, { style }).map((s) => Math.max(s.strong, s.weak)));
  assert.ok(m('soft', 'wrong') < m('normal', 'wrong'));
  assert.ok(m('normal', 'wrong') < m('rich', 'wrong'));
  assert.equal(H.buildPattern('correct', cfg, null, { style: 'normal' }).length, 1);
  assert.equal(H.buildPattern('correct', cfg, null, { style: 'rich' }).length, 2);
  assert.equal(H.buildPattern('wrong', cfg, null, { style: 'normal' }).length, 2);
  assert.equal(H.buildPattern('wrong', cfg, null, { style: 'rich' }).length, 3);
  assert.ok(H.buildPattern('ramp', cfg, null, { style: 'rich' }).length > H.buildPattern('ramp', cfg, null, { style: 'normal' }).length);
  for (const ev of ['tick', 'correct', 'wrong', 'streak', 'ramp']) {
    for (const st of ['soft', 'normal', 'rich']) {
      for (const s of H.buildPattern(ev, cfg, { trigger: true }, { style: st })) {
        assert.ok(s.strong >= 0 && s.strong <= 1 && s.weak >= 0 && s.weak <= 1);
        assert.ok(s.at + s.duration <= 700);
      }
    }
  }
});

test('触感种类 dots 映射到 dots 事件；不认识的风格按标准处理', () => {
  assert.equal(H.eventForKind('dots'), 'dots');
  assert.deepEqual(H.buildPattern('wrong', cfg, null, { style: 'bogus' }), H.buildPattern('wrong', cfg, null, { style: 'normal' }));
});
