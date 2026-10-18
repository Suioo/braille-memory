'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/core/interact.js');
const { cellLayout } = require('../src/core/cell.js');

// 三段，宽 80，间隔 2，从 x=100 开始
const RECTS = [{ left: 100, right: 180 }, { left: 182, right: 262 }, { left: 264, right: 344 }];

test('segmentIndexFromX: inside, gaps, clamped ends', () => {
  assert.equal(I.segmentIndexFromX(140, RECTS), 0);
  assert.equal(I.segmentIndexFromX(222, RECTS), 1);
  assert.equal(I.segmentIndexFromX(300, RECTS), 2);
  assert.equal(I.segmentIndexFromX(181, RECTS), 1);   // 缝：离右段边缘 1，离左段边缘 1 -> 相等取右
  assert.equal(I.segmentIndexFromX(180.5, RECTS), 0); // 更靠左段
  assert.equal(I.segmentIndexFromX(-50, RECTS), 0);
  assert.equal(I.segmentIndexFromX(9999, RECTS), 2);
  assert.equal(I.segmentIndexFromX(10, []), -1);
});

test('exceedsSlide: horizontal threshold and dominance', () => {
  assert.equal(I.exceedsSlide(5, 0), false);
  assert.equal(I.exceedsSlide(6, 0), true);
  assert.equal(I.exceedsSlide(-7, 2), true);
  assert.equal(I.exceedsSlide(8, 12), false); // 竖直为主：让给滚动
  assert.equal(I.exceedsSlide(0, 0), false);
  assert.equal(I.exceedsSlide(10, 0, 12), false);
});

test('hoverIndex: abandons when pointer leaves vertically', () => {
  const box = { top: 200, bottom: 250 };
  assert.equal(I.hoverIndex(300, 225, RECTS, box), 2);
  assert.equal(I.hoverIndex(300, 250 + 48, RECTS, box), 2);
  assert.equal(I.hoverIndex(300, 250 + 49, RECTS, box), -1);
  assert.equal(I.hoverIndex(300, 200 - 49, RECTS, box), -1);
});

test('mini orient: starts as the view, toggles to the other, resets', () => {
  for (const view of [false, true]) {
    const o = I.createMiniOrient(view);
    assert.equal(o.mirror, view);
    assert.equal(o.flipped, false);
    assert.equal(o.toggle(), true);
    assert.equal(o.mirror, !view);
    o.toggle();
    assert.equal(o.mirror, view);
    o.toggle(); o.reset();
    assert.equal(o.mirror, view);
    assert.equal(o.flipped, false);
  }
});

test('mini orient: flipped mirror view lays out exactly like the reading view', () => {
  const dots = [1, 3, 4];
  const o = I.createMiniOrient(true);
  o.toggle();
  assert.deepEqual(cellLayout(dots, o.mirror), cellLayout(dots, false));
});
