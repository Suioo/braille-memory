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

// ---------- createSlideSession：按住滑动手势状态机 ----------
const BOX = { top: 10, bottom: 58 };
const down = (s, x, y, t) => s.down({ id: 1, x, y, t, rects: RECTS, box: BOX });

test('slide session (no hold): horizontal move past the threshold starts sliding, hover follows, release commits', () => {
  const s = I.createSlideSession();
  down(s, 140, 30, 0);
  assert.equal(s.phase, 'pending');
  assert.equal(s.move({ x: 143, y: 30, t: 20 }).phase, 'pending');
  const e = s.move({ x: 150, y: 31, t: 40 });
  assert.deepEqual([e.phase, e.entered, e.hover], ['sliding', true, 0]);
  const m = s.move({ x: 222, y: 31, t: 60 });
  assert.deepEqual([m.phase, m.hover, m.changed], ['sliding', 1, true]);
  assert.equal(s.move({ x: 225, y: 31, t: 80 }).changed, false);
  assert.deepEqual(s.up(), { phase: 'sliding', commit: true, index: 1 });
  assert.equal(s.phase, 'idle');
});

test('slide session (no hold): vertical-dominant movement hands the gesture to scrolling for good', () => {
  const s = I.createSlideSession();
  down(s, 140, 30, 0);
  assert.equal(s.move({ x: 142, y: 45, t: 20 }).phase, 'scrolling');
  assert.equal(s.move({ x: 300, y: 46, t: 40 }).phase, 'scrolling', 'a later horizontal move does not start sliding');
  assert.equal(s.up().commit, false);
});

test('slide session: a plain tap never commits (the click handler does it)', () => {
  const s = I.createSlideSession();
  down(s, 140, 30, 0);
  assert.deepEqual(s.up(), { phase: 'pending', commit: false, index: 0 });
});

test('slide session: dragging far above / below the control abandons (hover -1, no commit); coming back selects again', () => {
  const s = I.createSlideSession();
  down(s, 140, 30, 0);
  s.move({ x: 160, y: 30, t: 10 });
  assert.equal(s.move({ x: 222, y: 200, t: 20 }).hover, -1);
  assert.deepEqual(s.up(), { phase: 'sliding', commit: false, index: -1 });
  down(s, 140, 30, 0);
  s.move({ x: 160, y: 30, t: 10 });
  s.move({ x: 222, y: 300, t: 20 });
  assert.equal(s.move({ x: 222, y: 40, t: 30 }).hover, 1);
});

test('slide session (hold 150): a quick swipe is a scroll; holding first then dragging is a selection', () => {
  const quick = I.createSlideSession({ holdMs: 150 });
  down(quick, 140, 30, 0);
  assert.equal(quick.move({ x: 160, y: 30, t: 60 }).phase, 'scrolling', 'moved before 150 ms');
  assert.equal(quick.tick(200), null, 'a late timer does not revive it');
  assert.equal(quick.up().commit, false);

  const held = I.createSlideSession({ holdMs: 150 });
  down(held, 140, 30, 0);
  assert.equal(held.tick(100), null, 'timer too early');
  const e = held.tick(150);
  assert.deepEqual([e.phase, e.entered, e.hover], ['sliding', true, 0]);
  assert.equal(held.move({ x: 222, y: 31, t: 200 }).hover, 1);
  assert.deepEqual(held.up(), { phase: 'sliding', commit: true, index: 1 });
});

test('slide session (hold 150): moving a little during the hold still counts as holding; a drag right after the hold elapsed enters sliding even if the timer is late', () => {
  const a = I.createSlideSession({ holdMs: 150 });
  down(a, 140, 30, 0);
  assert.equal(a.move({ x: 143, y: 31, t: 100 }).phase, 'pending');
  assert.equal(a.tick(150).phase, 'sliding');
  const b = I.createSlideSession({ holdMs: 150 });
  down(b, 140, 30, 0);
  const m = b.move({ x: 230, y: 30, t: 180 }); // 定时器还没到，但已按满 150 ms
  assert.deepEqual([m.phase, m.entered, m.hover], ['sliding', true, 1]);
});

test('slide session: cancel (pointercancel / system gesture) asks to restore only when sliding', () => {
  const s = I.createSlideSession();
  down(s, 140, 30, 0);
  s.move({ x: 160, y: 30, t: 10 });
  assert.deepEqual(s.cancel(), { restore: true });
  assert.equal(s.phase, 'idle');
  down(s, 140, 30, 0);
  assert.deepEqual(s.cancel(), { restore: false });
  assert.deepEqual(s.cancel(), { restore: false });
  assert.equal(s.move({ x: 1, y: 1, t: 1 }), null);
});

test('slide session: remeasure (row scrolled, resized, rotated) recomputes the segment under the finger while sliding', () => {
  const s = I.createSlideSession({ holdMs: 150 });
  down(s, 222, 30, 0);
  assert.equal(s.tick(150).hover, 1);
  // 芯片行向左滚动了 100px：原来 x=222 下面是第 2 段，现在是第 3 段
  const shifted = RECTS.map((r) => ({ left: r.left - 100, right: r.right - 100 }));
  const r = s.remeasure(shifted, BOX);
  assert.deepEqual([r.hover, r.changed], [2, true]);
  assert.equal(s.remeasure(shifted, BOX).changed, false);
  // 控件整体上移：指针落到范围外 → 放弃
  assert.equal(s.remeasure(shifted, { top: 300, bottom: 348 }).hover, -1);
  // 还没开始滑动时只更新测量，不改变状态
  const p = I.createSlideSession();
  down(p, 140, 30, 0);
  assert.equal(p.remeasure(shifted, BOX).phase, 'pending');
});

// ---------- 拉伸跟随：前沿 / 后沿分配 ----------
test('STRETCH: front edge 240 ms, rear edge 360 ms starting 40 ms later, same soft-decelerate curve', () => {
  assert.deepEqual({ ...I.STRETCH }, { frontMs: 240, rearMs: 360, rearDelayMs: 40, ease: 'cubic-bezier(0.3, 0, 0, 1)' });
  assert.ok(I.STRETCH.rearDelayMs + I.STRETCH.rearMs > I.STRETCH.frontMs, 'the rear edge always arrives last');
});

test('stretchPlan: moving right → right edge leads, left edge follows; moving left swaps them', () => {
  const r = I.stretchPlan({ left: 10, right: 90 }, { left: 110, right: 200 });
  assert.deepEqual([r.dir, r.front, r.rear], [1, 'right', 'left']);
  assert.equal(r.transition, 'right 240ms cubic-bezier(0.3, 0, 0, 1), left 360ms cubic-bezier(0.3, 0, 0, 1) 40ms');
  const l = I.stretchPlan({ left: 110, right: 200 }, { left: 10, right: 90 });
  assert.deepEqual([l.dir, l.front, l.rear], [-1, 'left', 'right']);
  assert.equal(l.transition, 'left 240ms cubic-bezier(0.3, 0, 0, 1), right 360ms cubic-bezier(0.3, 0, 0, 1) 40ms');
});

test('stretchPlan: direction follows the centres, so a reversal in mid-flight swaps roles; overlapping and equal targets are fine', () => {
  // 指示块正在向右飞（当前看到 [50,140]），目标在它左边 → 向左：左边是前沿
  assert.equal(I.stretchPlan({ left: 50, right: 140 }, { left: 10, right: 90 }).front, 'left');
  // 目标与当前部分重叠、略偏右
  assert.equal(I.stretchPlan({ left: 10, right: 90 }, { left: 30, right: 110 }).front, 'right');
  // 目标不变（如同一项再点）：按向右处理，不会产生 NaN 或空串
  const same = I.stretchPlan({ left: 10, right: 90 }, { left: 10, right: 90 });
  assert.equal(same.dir, 1);
  assert.ok(same.transition.includes('right 240ms') && same.transition.includes('left 360ms'));
});
