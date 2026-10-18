/**
 * 震动适配：页面只调用 BMHaptics.play(kind, enabled)，不直接碰 Capacitor。
 * - 只有 Capacitor 原生平台（Android）supported = true；Electron / 浏览器是空操作。
 * - 走 Capacitor.nativePromise 调 @capacitor/haptics（无打包器，插件在原生侧注册）。
 * kind：tap（点点位，轻）| tick（滑动经过分段 / 迷你图翻面，轻）| correct（答对，轻两下）| wrong（答错，重一下）| pass（过关，成功通知）
 * 渲染进程：window.BMHaptics；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMHaptics = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /** @param {object} [env] { cap: Capacitor 对象, later: setTimeout 替身 }（测试注入） */
  function create(env) {
    env = env || {};
    const cap = env.cap;
    const later = env.later || ((fn, ms) => setTimeout(fn, ms));
    let supported = false;
    try { supported = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && typeof cap.nativePromise === 'function'); } catch (_) { supported = false; }

    const call = (method, options) => {
      try { const p = cap.nativePromise('Haptics', method, options); if (p && p.catch) p.catch(() => {}); } catch (_) { /* 忽略 */ }
    };
    const impact = (style) => call('impact', { style });

    return {
      supported,
      /** @returns {boolean} 是否真的发出了震动 */
      play(kind, enabled) {
        if (!supported || !enabled) return false;
        if (kind === 'tap' || kind === 'tick') impact('LIGHT');
        else if (kind === 'correct') { impact('LIGHT'); later(() => impact('LIGHT'), 80); }
        else if (kind === 'wrong') impact('HEAVY');
        else if (kind === 'pass') call('notification', { type: 'SUCCESS' });
        else return false;
        return true;
      },
    };
  }

  const api = { create };
  if (root) Object.assign(api, create({ cap: root.Capacitor }), { create });
  return api;
});
