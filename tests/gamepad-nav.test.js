'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Nav = require('../src/core/padnav.js');
const Cell = require('../src/core/cell.js');

/** 假的 Gamepad 对象：pressed = 按下的 standard 序号集合，axes = [lx, ly, rx, ry]。 */
function fakePad(id, pressed, axes, extra) {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: (pressed || []).includes(i), value: (pressed || []).includes(i) ? 1 : 0 }));
  return Object.assign({ index: 0, id, connected: true, mapping: 'standard', buttons, axes: axes || [0, 0, 0, 0] }, extra);
}
const snap = (gp) => Nav.fromGamepad(gp);
const press = (events) => events.filter((e) => e.type === 'press').map((e) => e.action);
const dirs = (events) => events.filter((e) => e.type === 'dir').map((e) => e.dir + (e.repeat ? '*' : ''));

// 三家手柄的 standard 布局：序号按物理位置，所以同一个序号 = 同一个动作
const FAMILIES = {
  'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)': { bottom: 'A', right: 'B' },
  'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)': { bottom: '×', right: '○' },
  'Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)': { bottom: 'B', right: 'A' },
  'Joy-Con (L) (STANDARD GAMEPAD Vendor: 057e Product: 2006)': { bottom: '(横握)', right: '(横握)' },
};

test('three families share one physical layout: bottom = confirm, right = back, left = X, top = Y', () => {
  for (const id of Object.keys(FAMILIES)) {
    const input = Nav.createPadInput();
    input.update([snap(fakePad(id, []))], 0);
    const seen = [];
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].forEach((i, k) => {
      const ev = input.update([snap(fakePad(id, [i]))], 10 + k * 20);
      seen.push(...press(ev));
      input.update([snap(fakePad(id, []))], 20 + k * 20);
    });
    assert.deepEqual(seen, ['confirm', 'back', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'start'], id);
  }
});

test('fromGamepad: only the standard mapping is used; analog trigger counts when value > 0.5', () => {
  assert.equal(snap(fakePad('Unknown', [0], null, { mapping: '' })), null);
  assert.equal(snap(fakePad('Gone', [0], null, { connected: false })), null);
  assert.equal(snap(null), null);
  const lt = fakePad('X', []);
  lt.buttons[6] = { pressed: false, value: 0.7 };
  assert.equal(snap(lt).buttons[6], true);
  lt.buttons[6] = { pressed: false, value: 0.3 };
  assert.equal(snap(lt).buttons[6], false);
  assert.equal(snap(fakePad('Short', [0], null, { buttons: [{ pressed: true, value: 1 }] })).buttons[1], false); // 键数不够：缺的算没按
});

test('native (Android) bitmask maps to the same layout', () => {
  const p = Nav.fromNative({ id: 3, name: 'Xbox', b: (1 << 0) | (1 << 12) | (1 << 9), lx: 0.5, ly: -1, rx: 0, ry: 0 });
  assert.equal(p.key, 'n:3');
  assert.deepEqual(p.buttons.map((b, i) => (b ? i : -1)).filter((i) => i >= 0), [0, 9, 12]);
  assert.deepEqual(p.axes, [0.5, -1, 0, 0]);
  assert.equal(Nav.fromNative(null), null);
});

test('stick dead zone is 0.5; dpad wins over the stick', () => {
  assert.equal(Nav.stickDir(0.49, 0, null, 0.5), null);
  assert.equal(Nav.stickDir(0.5, 0, null, 0.5), 'right');
  assert.equal(Nav.stickDir(-0.9, 0.2, null, 0.5), 'left');
  assert.equal(Nav.stickDir(0.1, -0.8, null, 0.5), 'up');
  assert.equal(Nav.stickDir(0, 0.8, null, 0.5), 'down');
  assert.equal(Nav.stickDir(0.6, 0.55, null, 0.5), 'right');       // 斜推：主轴大的赢
  assert.equal(Nav.stickDir(0.6, 0.7, 'right', 0.5), 'right');      // 已经向右，下轴没明显压过：保持
  assert.equal(Nav.stickDir(0.55, 0.9, 'right', 0.5), 'down');      // 被明显压过：改方向
  const input = Nav.createPadInput();
  input.update([snap(fakePad('p', []))], 0);
  assert.deepEqual(dirs(input.update([snap(fakePad('p', [15], [-1, 0, 0, 0]))], 16)), ['right']); // 十字键右 + 摇杆左 → 十字键
});

test('direction: fires at once, repeats after 400 ms every 120 ms, no backlog after a long pause', () => {
  const input = Nav.createPadInput();
  input.update([snap(fakePad('p', []))], 0);
  const held = () => snap(fakePad('p', [], [0, 0.9, 0, 0]));
  assert.deepEqual(dirs(input.update([held()], 100)), ['down']);
  assert.deepEqual(dirs(input.update([held()], 300)), []);
  assert.deepEqual(dirs(input.update([held()], 499)), []);
  assert.deepEqual(dirs(input.update([held()], 500)), ['down*']);
  assert.deepEqual(dirs(input.update([held()], 560)), []);
  assert.deepEqual(dirs(input.update([held()], 620)), ['down*']);
  assert.equal(input.holding, true);
  assert.deepEqual(dirs(input.update([held()], 5000)), ['down*']); // 一帧最多一次
  assert.deepEqual(dirs(input.update([held()], 5010)), []);
  input.update([snap(fakePad('p', []))], 5020);
  assert.equal(input.holding, false);
});

test('changing direction restarts the 400 ms delay', () => {
  const input = Nav.createPadInput();
  input.update([snap(fakePad('p', []))], 0);
  input.update([snap(fakePad('p', [], [0.9, 0, 0, 0]))], 10);
  assert.deepEqual(dirs(input.update([snap(fakePad('p', [], [0.9, 0, 0, 0]))], 450)), ['right*']);
  assert.deepEqual(dirs(input.update([snap(fakePad('p', [], [-0.9, 0, 0, 0]))], 460)), ['left']);
  assert.deepEqual(dirs(input.update([snap(fakePad('p', [], [-0.9, 0, 0, 0]))], 800)), []);
  assert.deepEqual(dirs(input.update([snap(fakePad('p', [], [-0.9, 0, 0, 0]))], 860)), ['left*']);
});

test('buttons fire on press only: holding confirm does not repeat', () => {
  const input = Nav.createPadInput();
  input.update([snap(fakePad('p', []))], 0);
  assert.deepEqual(press(input.update([snap(fakePad('p', [0]))], 10)), ['confirm']);
  for (let t = 20; t < 3000; t += 16) assert.deepEqual(press(input.update([snap(fakePad('p', [0]))], t)), []);
  input.update([snap(fakePad('p', []))], 3100);
  assert.deepEqual(press(input.update([snap(fakePad('p', [0]))], 3110)), ['confirm']);
});

test('keys already held when the pad appears or when the window returns do not fire', () => {
  const input = Nav.createPadInput();
  assert.deepEqual(input.update([snap(fakePad('p', [0, 3], [0.9, 0, 0, 0]))], 0), []);   // 刚出现就按着
  assert.deepEqual(input.update([snap(fakePad('p', [0, 3], [0.9, 0, 0, 0]))], 1000), []);  // 一直按着也不连发
  assert.deepEqual(input.update([snap(fakePad('p', [3], [0.9, 0, 0, 0]))], 1016), []);
  // 失焦期间按下又松开 / 一直按着：回来时 resync，之后只响应新的按下
  input.resync([snap(fakePad('p', [1], [0, -0.9, 0, 0]))], 2000);
  assert.deepEqual(input.update([snap(fakePad('p', [1], [0, -0.9, 0, 0]))], 3000), []);
  assert.deepEqual(input.update([snap(fakePad('p', [], [0, 0, 0, 0]))], 3016), []);
  assert.deepEqual(press(input.update([snap(fakePad('p', [1]))], 3032)), ['back']);
});

test('several pads are independent: any of them can drive; a vanished pad is forgotten', () => {
  const input = Nav.createPadInput();
  const a = (p, ax) => snap(fakePad('Xbox', p, ax, { index: 0 }));
  const b = (p, ax) => snap(fakePad('Wireless Controller', p, ax, { index: 1 }));
  input.update([a([]), b([])], 0);
  let ev = input.update([a([0]), b([])], 10);
  assert.deepEqual(ev.map((e) => e.action + '@' + e.pad.split(':')[0]), ['confirm@0']);
  ev = input.update([a([0]), b([1])], 20);
  assert.deepEqual(ev.map((e) => e.action + '@' + e.pad.split(':')[0]), ['back@1']);
  assert.equal(input.count, 2);
  input.update([b([])], 30);
  assert.equal(input.count, 1);
  assert.deepEqual(press(input.update([a([0]), b([])], 40)), []); // 重新出现的手柄：已按着的不算
});

// ---------- 就近选择 ----------
const rectOf = (col, row, w, h, x0, y0) => ({ left: (x0 || 0) + (col - 1) * 60, top: (y0 || 0) + (row - 1) * 60, right: (x0 || 0) + (col - 1) * 60 + (w || 50), bottom: (y0 || 0) + (row - 1) * 60 + (h || 50) });

test('pickNext: nearest on screen in the pressed direction, not Tab order', () => {
  const items = [
    { id: 'a', rect: { left: 0, top: 0, right: 100, bottom: 40 } },
    { id: 'b', rect: { left: 120, top: 0, right: 220, bottom: 40 } },
    { id: 'c', rect: { left: 0, top: 60, right: 100, bottom: 100 } },
    { id: 'd', rect: { left: 120, top: 60, right: 220, bottom: 100 } },
    { id: 'far', rect: { left: 0, top: 300, right: 100, bottom: 340 } },
  ];
  const from = items[0].rect;
  assert.equal(Nav.pickNext(from, items, 'right', 'a'), 'b');
  assert.equal(Nav.pickNext(from, items, 'down', 'a'), 'c');
  assert.equal(Nav.pickNext(items[3].rect, items, 'left', 'd'), 'c');
  assert.equal(Nav.pickNext(items[3].rect, items, 'up', 'd'), 'b');
  assert.equal(Nav.pickNext(from, items, 'left', 'a'), null);
  assert.equal(Nav.pickNext(from, items, 'up', 'a'), null);
  assert.equal(Nav.pickNext(items[2].rect, items, 'down', 'c'), 'far');
});

test('pickNext: prefers the aligned neighbour over a nearer but misaligned one', () => {
  const from = { left: 0, top: 100, right: 100, bottom: 140 };
  const items = [
    { id: 'diag', rect: { left: 110, top: 0, right: 210, bottom: 40 } },     // 右上，错开
    { id: 'row', rect: { left: 140, top: 100, right: 240, bottom: 140 } },   // 正右，稍远
  ];
  assert.equal(Nav.pickNext(from, items, 'right'), 'row');
});

/** 6 个点位按屏幕上的行列摆成按钮（和 widgets.js 的 dotPosition 同一个函数）。 */
function dotRects(mirror) {
  return Cell.DOT_NUMBERS.map((n) => { const p = Cell.dotPosition(n, mirror); return { id: n, rect: rectOf(p.col, p.row, 50, 50) }; });
}
const rectOfDot = (items, n) => items.find((x) => x.id === n).rect;

test('dots move by screen position: reading view (dots 1-2-3 on the left, 4-5-6 on the right)', () => {
  const items = dotRects(false);
  const go = (n, d) => Nav.pickNext(rectOfDot(items, n), items, d, n);
  assert.equal(go(1, 'right'), 4);
  assert.equal(go(1, 'down'), 2);
  assert.equal(go(2, 'down'), 3);
  assert.equal(go(3, 'right'), 6);
  assert.equal(go(5, 'left'), 2);
  assert.equal(go(4, 'up'), null);
  assert.equal(go(1, 'left'), null);
});

test('dots move by screen position: mirror view (columns swapped, so "right" from 4 is dot 1)', () => {
  const items = dotRects(true);
  const go = (n, d) => Nav.pickNext(rectOfDot(items, n), items, d, n);
  assert.equal(go(4, 'right'), 1);
  assert.equal(go(1, 'right'), null);
  assert.equal(go(1, 'left'), 4);
  assert.equal(go(6, 'right'), 3);
  assert.equal(go(5, 'right'), 2);
  assert.equal(go(5, 'down'), 6);
  assert.equal(go(2, 'up'), 1);
  // 同一个点在两种视角下，同一个方向得到的是不同的点
  const normal = dotRects(false);
  assert.notEqual(Nav.pickNext(rectOfDot(normal, 1), normal, 'right', 1), Nav.pickNext(rectOfDot(items, 1), items, 'right', 1));
});

test('cycle: clamps at the ends or wraps', () => {
  assert.equal(Nav.cycle(4, 0, -1, false), 0);
  assert.equal(Nav.cycle(4, 3, 1, false), 3);
  assert.equal(Nav.cycle(4, 3, 1, true), 0);
  assert.equal(Nav.cycle(4, 0, -1, true), 3);
  assert.equal(Nav.cycle(0, 0, 1, true), 0);
});

test('pickNext: no jumping to another row sideways (cone), but vertical still reaches far items', () => {
  // 两排：点位在中间，右边没有东西了；右上角有个很远的图标
  const dots = [{ id: 'd', rect: { left: 200, top: 400, right: 250, bottom: 450 } }];
  const icon = { id: 'icon', rect: { left: 360, top: 10, right: 400, bottom: 50 } };
  assert.equal(Nav.pickNext(dots[0].rect, [...dots, icon], 'right', 'd'), null);
  assert.equal(Nav.pickNext(dots[0].rect, [...dots, icon], 'up', 'd'), 'icon');   // 上方：锥内没有，放宽后仍到得了
  const wide = { id: 'wide', rect: { left: 0, top: 600, right: 420, bottom: 650 } };
  assert.equal(Nav.pickNext(dots[0].rect, [...dots, wide], 'down', 'd'), 'wide');  // 与之重叠的宽按钮
});
