'use strict';
// 手柄震动的纯逻辑：触感事件 → 步骤、限流 / 抢占、多手柄选择、开关显示。手柄一律用假对象。
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../src/core/haptics.js');
const { mergeConfig } = require('../src/core/config.js');

const G = mergeConfig(require('../data/config.json')).config.haptics.gamepad;

/** 假手柄：actuator.effects 决定能震什么；press() / push() 模拟输入。 */
function fakePad(index, id, effects, o) {
  o = o || {};
  const played = [];
  const pad = {
    index, id, connected: true, timestamp: 0, buttons: Array.from({ length: 4 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], played,
    vibrationActuator: effects === null ? undefined : { type: 'dual-rumble', effects, playEffect(type, params) { played.push({ type, params }); if (o.throws) throw new Error('boom'); return o.rejects ? Promise.reject(new Error('x')) : Promise.resolve('complete'); }, reset() { return Promise.resolve('complete'); } },
  };
  return pad;
}
const press = (p, i, on = true) => { p.buttons[i] = { pressed: on, value: on ? 1 : 0 }; };

test('eventForKind: existing haptic kinds map onto gamepad events', () => {
  assert.equal(H.eventForKind('tap'), 'tick');
  assert.equal(H.eventForKind('tick'), 'tick');
  assert.equal(H.eventForKind('correct'), 'correct');
  assert.equal(H.eventForKind('correct', { streak: 1 }), 'correct');
  assert.equal(H.eventForKind('correct', { streak: 2 }), 'streak');
  assert.equal(H.eventForKind('correct', { streak: 7 }), 'streak');
  assert.equal(H.eventForKind('wrong'), 'wrong');
  assert.equal(H.eventForKind('pass'), 'ramp');
  assert.equal(H.eventForKind('record'), 'ramp');
  assert.equal(H.eventForKind('nope'), null);
  assert.equal(H.eventForKind(undefined), null);
});

test('config: data/config.json carries the gamepad block and normalizeConfig fills / clamps anything wrong', () => {
  assert.ok(G && G.tick && G.correct && G.wrong && G.ramp && G.limits, 'haptics.gamepad exists in the merged config');
  const d = H.normalizeConfig(null);
  assert.equal(d.tick.durationMs, 20);
  assert.deepEqual(H.normalizeConfig(G), H.normalizeConfig(undefined), 'the shipped config equals the built-in defaults');
  const bad = H.normalizeConfig({ tick: { durationMs: -5, weak: 9 }, correct: { durationMs: 'x', strong: NaN }, ramp: { steps: 99, from: -1, to: 3 }, limits: { maxPatternMs: 1e9 } });
  assert.equal(bad.tick.durationMs, 1);
  assert.equal(bad.tick.weak, 1);
  assert.equal(bad.correct.durationMs, 60);
  assert.equal(bad.correct.strong, 0.25);
  assert.equal(bad.ramp.steps, 10);
  assert.equal(bad.ramp.from, 0);
  assert.equal(bad.ramp.to, 1);
  assert.equal(bad.limits.maxPatternMs, 2000);
});

test('buildPattern: tick = one very short pulse on the weak motor only', () => {
  const p = H.buildPattern('tick', G, { trigger: true });
  assert.equal(p.length, 1);
  assert.deepEqual([p[0].at, p[0].duration, p[0].strong], [0, 20, 0]);
  assert.ok(p[0].weak > 0 && p[0].weak <= 0.5);
  assert.deepEqual([p[0].leftTrigger, p[0].rightTrigger], [0, 0]);
});

test('buildPattern: correct = one crisp ~60 ms pulse, both motors light; triggers get a light tap only when the pad can', () => {
  const plain = H.buildPattern('correct', G, { trigger: false });
  assert.equal(plain.length, 1);
  assert.equal(plain[0].duration, 60);
  assert.ok(plain[0].strong > 0 && plain[0].strong <= 0.4 && plain[0].weak > 0 && plain[0].weak <= 0.4);
  assert.deepEqual([plain[0].leftTrigger, plain[0].rightTrigger], [0, 0]);
  const trig = H.buildPattern('correct', G, { trigger: true });
  assert.ok(trig[0].leftTrigger > 0 && trig[0].leftTrigger <= 0.3 && trig[0].rightTrigger === trig[0].leftTrigger);
  assert.equal(trig[0].duration, 60);
  assert.deepEqual(H.buildPattern('correct', G, undefined).map((s) => s.leftTrigger), [0]);
});

test('buildPattern: wrong = two heavier pulses (80 ms, 60 ms gap, 80 ms), strong motor dominant', () => {
  const p = H.buildPattern('wrong', G, { trigger: true });
  assert.equal(p.length, 2);
  assert.deepEqual([p[0].at, p[0].duration, p[1].at, p[1].duration], [0, 80, 140, 80]);
  for (const s of p) { assert.ok(s.strong > s.weak, 'strong motor leads'); assert.deepEqual([s.leftTrigger, s.rightTrigger], [0, 0]); }
  const c = H.buildPattern('correct', G, {})[0];
  assert.ok(p[0].strong > c.strong, 'heavier than a correct answer');
});

test('buildPattern: streak / ramp = a short rising sequence within ~200 ms, weak to strong', () => {
  for (const ev of ['streak', 'ramp']) {
    const p = H.buildPattern(ev, G, { trigger: true });
    assert.ok(p.length >= 3);
    const end = p[p.length - 1].at + p[p.length - 1].duration;
    assert.ok(end <= 210 && end >= 190, 'total ' + end);
    for (let i = 1; i < p.length; i++) {
      assert.ok(p[i].weak > p[i - 1].weak && p[i].strong > p[i - 1].strong, 'strictly rising');
      assert.equal(p[i].at, p[i - 1].at + p[i - 1].duration, 'contiguous');
    }
    assert.ok(p[0].weak <= 0.3 && p[p.length - 1].weak >= 0.8);
  }
  assert.deepEqual(H.buildPattern('unknown', G, {}), []);
});

test('buildPattern: never longer than limits.maxPatternMs (steps beyond are dropped, the last is truncated)', () => {
  const short = Object.assign({}, G, { limits: { tickMinIntervalMs: 45, maxPatternMs: 100 } });
  const p = H.buildPattern('wrong', short, {});
  assert.deepEqual(p.map((s) => [s.at, s.duration]), [[0, 80]], 'the second pulse starts at 140 ms ≥ cap → dropped');
  const r = H.buildPattern('ramp', short, {});
  assert.ok(r.every((s) => s.at + s.duration <= 100));
});

/** 假环境：手动推进时间。 */
function fakeEnv() {
  const e = { t: 0, calls: [], stops: 0, pending: [], nextId: 1 };
  e.now = () => e.t;
  e.play = (s) => { e.calls.push([e.t, s]); };
  e.stop = () => { e.stops++; };
  e.later = (fn, ms) => { const h = { id: e.nextId++, at: e.t + ms, fn }; e.pending.push(h); return h; };
  e.cancelLater = (h) => { e.pending = e.pending.filter((x) => x !== h); };
  e.advance = (ms) => { const end = e.t + ms; for (;;) { const due = e.pending.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0]; if (!due) break; e.pending = e.pending.filter((x) => x !== due); e.t = due.at; due.fn(); } e.t = end; };
  return e;
}

test('runner: first step is sent immediately, later steps on schedule (wrong → 2 pulses)', () => {
  const e = fakeEnv(); const r = H.createRunner(e);
  assert.equal(r.trigger('wrong', G, {}), true);
  assert.equal(e.calls.length, 1);
  e.advance(139); assert.equal(e.calls.length, 1);
  e.advance(1); assert.equal(e.calls.length, 2);
  assert.deepEqual([e.calls[1][0], e.calls[1][1].duration], [140, 80]);
});

test('runner: a new non-tick event preempts the old one — its unsent steps are cancelled, nothing queues up', () => {
  const e = fakeEnv(); const r = H.createRunner(e);
  r.trigger('wrong', G, {});
  e.advance(30);
  r.trigger('correct', G, {});
  assert.equal(e.pending.length, 0, 'the old second pulse was cancelled');
  e.advance(1000);
  assert.equal(e.calls.length, 2, 'wrong#1 + correct only');
  // 100 次连续触发：任何时刻待发步骤不会越积越多
  for (let i = 0; i < 100; i++) { r.trigger('wrong', G, {}); e.advance(5); assert.ok(e.pending.length <= 1); }
  e.advance(1000);
  assert.equal(e.pending.length, 0);
});

test('runner: tick throttling — ticks closer than the min interval are dropped; a tick never interrupts a longer pattern', () => {
  const e = fakeEnv(); const r = H.createRunner(e);
  assert.equal(r.trigger('tick', G, {}), true);
  e.advance(10); assert.equal(r.trigger('tick', G, {}), false);
  e.advance(40); assert.equal(r.trigger('tick', G, {}), true);
  // 快速拖过多项（每 8 ms 一次）：50 次里只会发出少数几次
  const e2 = fakeEnv(); const r2 = H.createRunner(e2); let sent = 0;
  for (let i = 0; i < 50; i++) { if (r2.trigger('tick', G, {})) sent++; e2.advance(8); }
  assert.ok(sent <= Math.ceil((50 * 8) / G.limits.tickMinIntervalMs) + 1 && sent >= 5, 'sent ' + sent);
  // 非 tick 序列播放期间 tick 被丢弃，播完后恢复
  const e3 = fakeEnv(); const r3 = H.createRunner(e3);
  r3.trigger('ramp', G, {});
  e3.advance(50); assert.equal(r3.trigger('tick', G, {}), false);
  e3.advance(200); assert.equal(r3.trigger('tick', G, {}), true);
  // tick 之后紧跟答对：答对不受 tick 限流影响
  const e4 = fakeEnv(); const r4 = H.createRunner(e4);
  r4.trigger('tick', G, {}); e4.advance(1);
  assert.equal(r4.trigger('correct', G, {}), true);
});

test('runner: backend errors (sync throw, rejected promise, throwing stop) are swallowed', async () => {
  const e = fakeEnv();
  e.play = () => { throw new Error('boom'); };
  e.stop = () => { throw new Error('boom2'); };
  const r = H.createRunner(e);
  assert.doesNotThrow(() => r.trigger('wrong', G, {}));
  assert.doesNotThrow(() => { e.advance(300); });
  assert.doesNotThrow(() => r.stop());
  const e2 = fakeEnv(); e2.play = () => Promise.reject(new Error('nope'));
  const r2 = H.createRunner(e2);
  r2.trigger('correct', G, {});
  await new Promise((res) => setImmediate(res)); // 没有未处理的 rejection：否则 node:test 会失败
});

test('runner.stop: cancels unsent steps and stops the backend (background / blur / disconnect)', () => {
  const e = fakeEnv(); const r = H.createRunner(e);
  r.trigger('wrong', G, {});
  r.stop();
  assert.equal(e.stops, 1);
  assert.equal(e.pending.length, 0);
  e.advance(500);
  assert.equal(e.calls.length, 1, 'the second pulse never fires');
  assert.equal(r.trigger('tick', G, {}), true, 'usable again right after stop');
});

test('padSupport: no actuator / dual-rumble / trigger-rumble (which also implies dual-rumble)', () => {
  assert.deepEqual(H.padSupport(fakePad(0, 'a', null)), { supported: false, dual: false, trigger: false });
  assert.deepEqual(H.padSupport(null), { supported: false, dual: false, trigger: false });
  assert.deepEqual(H.padSupport(fakePad(0, 'a', ['dual-rumble'])), { supported: true, dual: true, trigger: false });
  assert.deepEqual(H.padSupport(fakePad(0, 'a', ['trigger-rumble'])), { supported: true, dual: true, trigger: true });
  assert.deepEqual(H.padSupport(fakePad(0, 'a', ['dual-rumble', 'trigger-rumble'])), { supported: true, dual: true, trigger: true });
  assert.deepEqual(H.padSupport({ vibrationActuator: { type: 'vibration', playEffect() {} } }), { supported: false, dual: false, trigger: false });
  assert.deepEqual(H.padSupport({ vibrationActuator: { type: 'dual-rumble', playEffect() {} } }), { supported: true, dual: true, trigger: false });
});

test('tracker: the pad that had input last is the one that vibrates; disconnect removes it', () => {
  const t = H.createPadTracker();
  const a = fakePad(0, 'Xbox', ['dual-rumble', 'trigger-rumble']);
  const b = fakePad(1, 'Pro Controller', ['dual-rumble']);
  let s = t.update([a, b], 100);
  assert.equal(s.pads.length, 2);
  assert.equal(s.active.index, 1, 'both just appeared: the one seen last wins the tie');
  press(a, 0); s = t.update([a, b], 200);
  assert.equal(s.active.index, 0, 'A had input after B');
  press(b, 1); s = t.update([a, b], 300);
  assert.equal(s.active.index, 1);
  s = t.update([a, b], 400);
  assert.equal(s.active.index, 1, 'no input: nothing changes');
  s = t.update([a, null], 500);
  assert.equal(s.active.index, 0, 'B disconnected → A');
  s = t.update([null, null], 600);
  assert.equal(s.active, null);
  assert.equal(H.switchVisible(s), false);
});

test('tracker: stick noise inside the deadzone is not input; a real stick move is', () => {
  const t = H.createPadTracker();
  const a = fakePad(0, 'A', ['dual-rumble']); const b = fakePad(1, 'B', ['dual-rumble']);
  t.update([a, b], 0);
  a.axes[0] = 0.12; assert.equal(t.update([a, b], 10).active.index, 1, 'noise on A does not take over');
  a.axes[0] = 0.9; assert.equal(t.update([a, b], 20).active.index, 0);
  a.axes[0] = 0.9; assert.equal(t.update([a, b], 30).active.index, 0, 'a held stick stays active');
});

test('tracker: pads without a vibration actuator are listed but never chosen; the switch stays hidden for them', () => {
  const t = H.createPadTracker();
  const ds = fakePad(0, 'Wireless Controller (DualSense)', null); // 例：Electron 在 Windows 上读得到、但没有 vibrationActuator
  let s = t.update([ds], 0);
  assert.equal(s.pads.length, 1);
  assert.equal(s.active, null);
  assert.equal(H.switchVisible(s), false);
  const x = fakePad(1, 'Xbox', ['dual-rumble']);
  press(ds, 2); s = t.update([ds, x], 10);
  assert.equal(s.active.index, 1, 'the unsupported pad had input more recently but cannot vibrate');
  assert.equal(H.switchVisible(s), true);
});

test('Joy-Con: two separate single Joy-Cons are two pads (only the one with the last input vibrates); a merged L+R pair is one pad', () => {
  const t = H.createPadTracker();
  const L = fakePad(0, 'Joy-Con (L) (STANDARD GAMEPAD Vendor: 057e Product: 2006)', ['dual-rumble']);
  const R = fakePad(1, 'Joy-Con (R) (STANDARD GAMEPAD Vendor: 057e Product: 2007)', ['dual-rumble']);
  let s = t.update([L, R], 0);
  press(L, 0); s = t.update([L, R], 50);
  assert.equal(s.pads.length, 2);
  assert.equal(s.active.index, 0);
  press(R, 0); s = t.update([L, R], 90);
  assert.equal(s.active.index, 1);
  // Chromium 把左右手同时连接时合并成一个手柄：只有一个对象，playEffect 由它拆给两边
  const pair = fakePad(0, 'Joy-Con L+R (STANDARD GAMEPAD Vendor: 057e Product: 200e)', ['dual-rumble']);
  const t2 = H.createPadTracker();
  s = t2.update([pair], 0);
  assert.equal(s.pads.length, 1);
  assert.equal(s.active.index, 0);
});

test('tracker: reconnecting under a new index is tracked as a new pad; keys do not collide between pads with the same id', () => {
  const t = H.createPadTracker();
  const a = fakePad(0, 'Same', ['dual-rumble']); const b = fakePad(1, 'Same', ['dual-rumble']);
  let s = t.update([a, b], 0);
  assert.equal(s.pads.length, 2);
  assert.notEqual(s.pads[0].key, s.pads[1].key);
  press(a, 0); s = t.update([a, b], 10);
  assert.equal(s.active.index, 0);
});
