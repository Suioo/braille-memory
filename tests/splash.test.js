'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/core/splash.js');

test('the nominal timeline is at most 1.2 s and every part fits inside it', () => {
  assert.ok(S.TOTAL_MS <= 1200, 'total ' + S.TOTAL_MS);
  assert.equal(S.TOTAL_MS, S.ANIM_MS + S.FADE_MS);
  const lastDotEnds = S.dotStartMs(S.DOTS - 1) + S.DOT_MS;
  assert.ok(lastDotEnds <= S.TITLE_AT_MS + S.TITLE_MS, 'the title finishes after the last dot lights');
  assert.ok(S.TITLE_AT_MS + S.TITLE_MS <= S.ANIM_MS);
  assert.deepEqual([0, 1, 5].map(S.dotStartMs), [0, S.DOT_STAGGER_MS, 5 * S.DOT_STAGGER_MS]);
  assert.equal(S.DOTS, 6);
});

test('shouldPlay: cold start only, never in shot / e2e mode, never with reduced motion, never twice', () => {
  assert.equal(S.shouldPlay({}), true);
  assert.equal(S.shouldPlay({ shot: 'learn' }), false);
  assert.equal(S.shouldPlay({ shot: '*batch*' }), false);
  assert.equal(S.shouldPlay({ shot: 'e2e:round-done' }), false);
  assert.equal(S.shouldPlay({ reduced: true }), false);
  assert.equal(S.shouldPlay({ played: true }), false);
  assert.equal(S.shouldPlay({ shot: null, reduced: false, played: false }), true);
});

test('fadePlan: fade starts when BOTH the animation is done and the first screen is ready — no extra waiting', () => {
  // 首页很快就好（200 ms）：仍要等动画播完
  assert.deepEqual(S.fadePlan({ ready: 200, skippedAt: null }), { at: S.ANIM_MS, fadeMs: S.FADE_MS });
  // 首页比动画晚（1500 ms）：就绪后立即淡出，不额外拖延
  assert.deepEqual(S.fadePlan({ ready: 1500, skippedAt: null }), { at: 1500, fadeMs: S.FADE_MS });
  // 刚好同时
  assert.deepEqual(S.fadePlan({ ready: S.ANIM_MS, skippedAt: null }), { at: S.ANIM_MS, fadeMs: S.FADE_MS });
});

test('fadePlan: a tap skips the animation (short fade, as soon as the screen is ready)', () => {
  assert.deepEqual(S.fadePlan({ ready: 100, skippedAt: 300 }), { at: 300, fadeMs: S.SKIP_FADE_MS }, 'ready first, tap later → at the tap');
  assert.deepEqual(S.fadePlan({ ready: 700, skippedAt: 300 }), { at: 700, fadeMs: S.SKIP_FADE_MS }, 'tap first → wait for ready only');
  assert.deepEqual(S.fadePlan({ ready: 50, skippedAt: 0 }), { at: 50, fadeMs: S.SKIP_FADE_MS });
});

test('fadePlan: never stuck — slow or failed loading is forced out at 3 s', () => {
  const force = { at: S.MAX_MS, fadeMs: S.SKIP_FADE_MS };
  assert.equal(S.MAX_MS, 3000);
  assert.deepEqual(S.fadePlan({ ready: null, skippedAt: null }), force, 'never ready');
  assert.deepEqual(S.fadePlan({ ready: null, skippedAt: 100 }), force, 'tapped but never ready');
  assert.deepEqual(S.fadePlan({ ready: 5000, skippedAt: null }), force, 'ready only after the cap');
  assert.deepEqual(S.fadePlan({ ready: 2999, skippedAt: null }), { at: 2999, fadeMs: S.FADE_MS });
  assert.deepEqual(S.fadePlan({ ready: 3000, skippedAt: null }), force);
});
