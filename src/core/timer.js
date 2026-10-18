/**
 * 可暂停的正向计时器（时钟可注入）。
 * 渲染进程：window.BMTimer；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMTimer = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  class Stopwatch {
    /** @param {() => number} [now] 毫秒时钟 */
    constructor(now) {
      this.now = now || (() => Date.now());
      this.reset();
    }
    /** 清零并停止。 */
    reset() { this.acc = 0; this.since = null; }
    /** 开始或继续计时。 */
    start() { if (this.since === null) this.since = this.now(); }
    /** 暂停（暂停期间不计时）。 */
    pause() {
      if (this.since !== null) { this.acc += this.now() - this.since; this.since = null; }
    }
    /** @returns {boolean} 是否在计时 */
    get running() { return this.since !== null; }
    /** @returns {number} 已计毫秒 */
    elapsed() { return this.acc + (this.since === null ? 0 : this.now() - this.since); }
    /** 停止并返回已计毫秒。 */
    stop() { this.pause(); return this.acc; }
  }

  return { Stopwatch };
});
