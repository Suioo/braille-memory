/**
 * 手柄震动（平台层）：页面只调用 BMPadHaptics.play(kind, info)，不直接碰 Gamepad API / Capacitor 插件。
 *  - Electron / 浏览器：navigator.getGamepads() + gamepad.vibrationActuator.playEffect（dual-rumble；Xbox 的 trigger-rumble 加扳机点触）。
 *    手柄要先按一次键才会出现；只有连接着手柄时才轮询（10 Hz），页面在后台 / 没有手柄时不轮询。
 *  - DualSense：Chromium 没有它的震动，Windows 上由 platform/dualsense-hid.js 用 WebHID 直接发输出报告（见 docs/gamepad-haptics.md）。
 *  - 安卓（Capacitor）：本地插件 GamepadHaptics（android/…/GamepadHapticsPlugin.java，InputDevice 的 VibratorManager / Vibrator），
 *    不依赖 WebView 的 Gamepad API（WebView 只把按键事件转给手柄列表，见 docs/gamepad-haptics.md）。
 *  - 页面切到后台 / 窗口失去焦点 / 手柄断开：立即停震。所有失败静默忽略，不影响答题。
 * 事件 → 震动参数、限流、手柄选择等纯逻辑在 core/haptics.js（有单元测试）。
 * window.BMPadHaptics
 */
(function (root) {
  'use strict';
  const Core = root.BMHapticsCore;
  const POLL_MS = 100;

  /** 状态：supported = 当前有能震的手柄；trigger = 它能震扳机；name = 手柄名（仅用于调试）。 */
  const state = { supported: false, trigger: false, name: '' };
  const listeners = new Set();
  let runner = null;
  let backend = null;
  let env = { getConfig: () => null, isEnabled: () => false };

  const notify = () => { for (const cb of Array.from(listeners)) { try { cb(state); } catch (_) { /* 静默 */ } } };
  const setState = (s) => {
    const changed = s.supported !== state.supported || s.trigger !== state.trigger || s.name !== state.name;
    state.supported = s.supported; state.trigger = s.trigger; state.name = s.name;
    if (!s.supported && runner) runner.stop(); // 手柄断开：停震
    if (changed) notify();
  };

  const isNative = () => { try { return !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()); } catch (_) { return false; } };

  /** Electron / 浏览器：Gamepad API。 */
  function gamepadApiBackend() {
    const nav = root.navigator;
    if (!nav || typeof nav.getGamepads !== 'function') return null;
    const DS = root.BMDualSense;
    const DSCore = root.BMDualSenseCore;
    // DualSense：Chromium 没有它的 vibrationActuator，WebHID 通道就绪（BMDualSense.ready）才算能震
    const tracker = Core.createPadTracker({
      extra: (p) => (DS && DSCore && DS.ready && DSCore.isDualSensePadId(p.id) ? { supported: true, dual: true, trigger: false, hid: true } : null),
    });
    if (DS) DS.onChange(() => kick());
    const now = () => (root.performance ? root.performance.now() : Date.now());
    let active = null;
    let timer = null;
    const pads = () => { try { return nav.getGamepads() || []; } catch (_) { return []; } };
    function refresh() {
      const snap = tracker.update(pads(), now());
      active = snap.active;
      setState(active ? { supported: true, trigger: active.caps.trigger, name: active.id } : { supported: false, trigger: false, name: '' });
      return snap;
    }
    function poll() {
      timer = null;
      const snap = refresh();
      schedule(snap.pads.length > 0);
    }
    function schedule(connected) {
      if (timer || !connected || (root.document && root.document.hidden)) return;
      timer = root.setTimeout(poll, POLL_MS);
    }
    const kick = () => { const snap = refresh(); schedule(snap.pads.length > 0); };
    root.addEventListener('gamepadconnected', kick);
    root.addEventListener('gamepaddisconnected', () => { kick(); if (!state.supported && runner) runner.stop(); });
    if (root.document) root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) kick(); });
    kick(); // 页面加载时手柄可能已经被识别
    return {
      play(step) {
        if (!active) return null;
        if (active.caps && active.caps.hid) { if (DS) DS.play(step); return null; }
        const p = pads()[active.index];
        const a = p && p.vibrationActuator;
        if (!a || typeof a.playEffect !== 'function') return null;
        const trig = state.trigger && (step.leftTrigger > 0 || step.rightTrigger > 0);
        const params = { startDelay: 0, duration: step.duration, strongMagnitude: step.strong, weakMagnitude: step.weak };
        if (trig) { params.leftTrigger = step.leftTrigger; params.rightTrigger = step.rightTrigger; }
        return a.playEffect(trig ? 'trigger-rumble' : 'dual-rumble', params);
      },
      stop() {
        if (DS) DS.stop();
        if (!active) return null;
        const p = pads()[active.index];
        const a = p && p.vibrationActuator;
        return a && typeof a.reset === 'function' ? a.reset() : null;
      },
    };
  }

  /** 安卓：本地 Capacitor 插件。 */
  function nativeBackend() {
    const cap = root.Capacitor;
    if (!cap || typeof cap.nativePromise !== 'function') return null;
    const call = (method, options) => { try { return cap.nativePromise('GamepadHaptics', method, options || {}); } catch (_) { return null; } };
    function refresh() {
      const p = call('getState');
      if (!p || typeof p.then !== 'function') return;
      p.then((r) => {
        // 最后有输入的手柄能震就用它，否则用第一个能震的（和插件里 target() 的选择一致）；一个能震的都没有就不显示开关
        const d = r && Array.isArray(r.devices) ? r.devices.find((x) => x.id === r.activeId && x.motors > 0) || r.devices.find((x) => x.motors > 0) : null;
        setState(d && d.motors > 0 ? { supported: true, trigger: false, name: d.name || '' } : { supported: false, trigger: false, name: '' });
      }, () => setState({ supported: false, trigger: false, name: '' }));
    }
    try { if (typeof cap.addListener === 'function') { cap.addListener('GamepadHaptics', 'changed', refresh); } } catch (_) { /* 退回只在启动 / 回到前台时刷新 */ }
    if (root.document) root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) refresh(); });
    refresh();
    return {
      play(step) { return call('vibrate', { strong: step.strong, weak: step.weak, duration: step.duration }); },
      stop() { return call('stop'); },
    };
  }

  /**
   * 初始化（只做一次）。env.getConfig() → data/config.json 的 haptics.gamepad；env.isEnabled() → 设置里「手柄震动」是否开着。
   * 「华丽动效」和系统减弱动效都不影响手柄震动，只看这个开关。
   */
  function init(e) {
    if (backend || !Core) return;
    env = Object.assign(env, e || {});
    runner = Core.createRunner({
      play: (s) => (backend ? backend.play(s) : null),
      stop: () => (backend ? backend.stop() : null),
      now: () => (root.performance ? root.performance.now() : Date.now()),
      later: (fn, ms) => root.setTimeout(fn, ms),
      cancelLater: (h) => root.clearTimeout(h),
    });
    if (root.BMDualSense && !isNative()) root.BMDualSense.init(); // Windows：DualSense 的 WebHID 震动通道（不可用时静默无震动）
    try { backend = isNative() ? nativeBackend() : gamepadApiBackend(); } catch (_) { backend = null; }
    const stopAll = () => { if (runner) runner.stop(); };
    root.addEventListener('blur', stopAll);
    root.addEventListener('pagehide', stopAll);
    if (root.document) root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) stopAll(); });
  }

  /** 触感事件入口（与手机震动共用 ctx.haptic 的 kind）。@returns {boolean} 是否真的发出了震动 */
  function play(kind, info) {
    try {
      if (!backend || !runner || !state.supported || !env.isEnabled()) return false;
      const event = Core.eventForKind(kind, info);
      if (!event) return false;
      return runner.trigger(event, env.getConfig(), { trigger: state.trigger });
    } catch (_) { return false; }
  }

  root.BMPadHaptics = {
    init, play,
    stop() { if (runner) runner.stop(); },
    state,
    /** 订阅「有没有能震的手柄」的变化；返回取消订阅函数。 */
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
})(typeof self !== 'undefined' ? self : this);
