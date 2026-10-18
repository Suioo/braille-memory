/**
 * 「关于」彩蛋的纯逻辑：连点计数（时钟可注入）与版本显示。
 * 渲染进程：window.BMAbout；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMAbout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 连点计数：最近 `count` 次点击跨度不超过 `windowMs`（滑动窗口）即触发；触发后清零。
   * @param {{count?:number, windowMs?:number}} [o]
   * @returns {{tap:(now:number)=>boolean, reset:()=>void}}
   */
  function createTapCounter(o) {
    const count = (o && o.count) || 5;
    const windowMs = (o && o.windowMs) || 3000;
    let times = [];
    return {
      /** 记一次点击，返回本次是否达到触发条件。 */
      tap(now) {
        times.push(now);
        if (times.length > count) times = times.slice(times.length - count);
        if (times.length === count && now - times[0] <= windowMs) { times = []; return true; }
        return false;
      },
      reset() { times = []; },
    };
  }

  /**
   * 彩蛋序列（纯逻辑，时钟可注入）：在 windowMs 内点按 taps 次（每次按下不超过 tapMaxMs），
   * 随后在 armMs 内再次按住 holdMs 以上即完成（手法 a：点满 taps 次后第 taps+1 下按住）；
   * 或者第 taps 下直接按住 holdMs 以上不松开（手法 b：前 taps-1 次是点按，且从第 1 次点按到本次按下不超过 windowMs）。中途超时、过早松开、取消都会整体清零。
   * 不产生任何对外反馈；仅 poll/up 在完成时返回 true。
   * @param {{taps?:number, windowMs?:number, tapMaxMs?:number, armMs?:number, holdMs?:number}} [o]
   */
  function createSecretSequence(o) {
    o = o || {};
    const taps = o.taps || 7, windowMs = o.windowMs || 7000, tapMaxMs = o.tapMaxMs || 600;
    const armMs = o.armMs || 7000, holdMs = o.holdMs || 2000;
    let times = [], armedAt = null, downAt = null;
    const reset = () => { times = []; armedAt = null; downAt = null; };
    return {
      /** 按下（指针或 Enter/Space）。 */
      down(now) {
        if (downAt !== null) return;
        if (armedAt !== null && now - armedAt > armMs) reset();
        downAt = now;
      },
      /** 按住期间轮询（定时器调用）；已武装且按住满 holdMs 返回 true 并清零。 */
      poll(now) {
        if (downAt === null || now - downAt < holdMs) return false;
        if (armedAt !== null) {
          if (now - armedAt > armMs) return false;
        } else if (!(times.length >= taps - 1 && downAt - times[0] <= windowMs)) return false;
        reset();
        return true;
      },
      /** 松开；返回是否因此完成（按住满 holdMs 后松开且尚未被 poll 处理）。 */
      up(now) {
        if (downAt === null) return false;
        const d = now - downAt;
        downAt = null;
        if (armedAt !== null) {
          if (now - armedAt - d <= armMs && d >= holdMs) { reset(); return true; }
          reset(); return false;
        }
        if (d >= holdMs && times.length >= taps - 1 && now - d - times[0] <= windowMs) { reset(); return true; } // 手法 b：第 taps 下按住后松开
        if (d > tapMaxMs) { times = []; return false; }
        times.push(now);
        times = times.filter((t) => now - t <= windowMs);
        if (times.length >= taps) { times = []; armedAt = now; }
        return false;
      },
      /** 取消（指针离开 / 失焦 / 系统取消）：视为过早松开。 */
      cancel() { downAt = null; if (armedAt !== null) reset(); },
      reset,
    };
  }

  /** 「关于」彩蛋的参数：5 秒内点按 5 次，随后按住约 1.5 秒。 */
  const SECRET = Object.freeze({ taps: 5, windowMs: 5000, holdMs: 1500 });

  /** 显示用版本：package.json 的 "1.9.0" 显示为 "1.9"；其他原样。 */
  function displayVersion(v) {
    return String(v || '').replace(/^(\d+\.\d+)\.0$/, '$1');
  }

  return { createTapCounter, createSecretSequence, displayVersion, SECRET };
});
