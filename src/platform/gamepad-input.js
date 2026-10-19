/**
 * 手柄操控（平台层）：读手柄 → 统一快照 → core/padnav.js 的状态机 → 动作事件交给 onEvent（ui/gamepad-nav.js 处理）。
 *  - Electron / 浏览器：navigator.getGamepads()。手柄要先按一次键才会出现。只在有手柄连接且页面可见时才轮询：
 *    窗口有焦点用 requestAnimationFrame，失去焦点降到 250 ms 一次（且不产生事件），页面在后台完全不轮询。
 *  - 安卓（Capacitor）：WebView 不可靠地提供 Gamepad API，改由本地插件 GamepadHaptics（MainActivity 截获手柄的按键 / 摇杆事件）
 *    推送 'pad' 事件（按键位掩码 + 摇杆），这里只在有手柄按着方向时才开一个 33 ms 的定时器用于连发。
 *  - 窗口失去焦点 / 切到后台时不响应；回来后用 resync 把「已经按着的键」当作基线，不补发积压的按键。
 *  - 所有失败静默忽略。window.BMPadInput
 */
(function (root) {
  'use strict';
  const Nav = root.BMPadNav;
  const doc = root.document;
  const BLUR_POLL_MS = 250;
  const NATIVE_TICK_MS = 33;

  let input = null;
  let onEvent = null;
  let enabled = () => true;
  let started = false;
  let needResync = true;
  let timer = null;
  let raf = null;
  const nativePads = new Map();
  /** state.switch：当前连着 Switch Pro / Joy-Con（设置里「Switch 手柄按键」据此显示 / 隐藏）。 */
  const state = { switch: false };
  const listeners = new Set();
  function setSwitch(list) {
    const v = list.some((p) => !!p.kind);
    if (v === state.switch) return;
    state.switch = v;
    for (const cb of Array.from(listeners)) { try { cb(state); } catch (_) { /* 静默 */ } }
  }

  const now = () => (root.performance ? root.performance.now() : Date.now());
  const isNative = () => { try { return !!(root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()); } catch (_) { return false; } };
  const visible = () => !(doc && doc.hidden);
  const focused = () => visible() && (isNative() || typeof doc.hasFocus !== 'function' || doc.hasFocus());

  function dispatch(events) {
    if (!events.length || !onEvent || !enabled()) return;
    for (const ev of events) { try { onEvent(ev); } catch (_) { /* 一个动作失败不影响后面的 */ } }
  }

  // ---------- Electron / 浏览器 ----------
  const readPads = () => {
    try { return Array.from(root.navigator.getGamepads() || []).map(Nav.fromGamepad).filter(Boolean); } catch (_) { return []; }
  };
  function cancelTimers() {
    if (timer) { root.clearTimeout(timer); timer = null; }
    if (raf != null && root.cancelAnimationFrame) { root.cancelAnimationFrame(raf); raf = null; }
  }
  function frame() {
    timer = null; raf = null;
    const list = readPads();
    setSwitch(list);
    if (!list.length) { input.reset(); needResync = true; return; } // 没有手柄了：停止轮询，gamepadconnected 会重新开始
    if (!focused()) {
      needResync = true;
      if (visible()) timer = root.setTimeout(frame, BLUR_POLL_MS);
      return;
    }
    if (needResync) { input.resync(list, now()); needResync = false; } else dispatch(input.update(list, now()));
    schedule();
  }
  function schedule() {
    if (timer || raf != null || !visible()) return;
    if (root.requestAnimationFrame) raf = root.requestAnimationFrame(frame); else timer = root.setTimeout(frame, 16);
  }
  const kick = () => { cancelTimers(); needResync = true; frame(); };

  // ---------- 安卓原生 ----------
  function nativeStep() {
    timer = null;
    if (!visible()) return;
    const list = Array.from(nativePads.values());
    setSwitch(list);
    if (needResync) { input.resync(list, now()); needResync = false; } else dispatch(input.update(list, now()));
    if (input.holding) timer = root.setTimeout(nativeStep, NATIVE_TICK_MS);
  }
  function onNativePad(ev) {
    try {
      if (!ev || !visible()) return;
      if (ev.gone) { nativePads.delete('n:' + ev.id); } else { const p = Nav.fromNative(ev); if (p) nativePads.set(p.key, p); }
      if (timer) { root.clearTimeout(timer); timer = null; }
      nativeStep();
    } catch (_) { /* 静默 */ }
  }
  function startNative() {
    const cap = root.Capacitor;
    if (!cap || typeof cap.addListener !== 'function' || typeof cap.nativePromise !== 'function') return;
    cap.addListener('GamepadHaptics', 'pad', onNativePad);
    try { const p = cap.nativePromise('GamepadHaptics', 'setInput', { enabled: true }); if (p && p.catch) p.catch(() => {}); } catch (_) { /* 没有插件：保持 WebView 默认行为 */ }
  }

  /** env.switchKeycap()：Switch 手柄是否按键帽字母；env.onEvent(ev)：{type:'press',action} / {type:'dir',dir,repeat}；env.enabled()：是否响应（截图模式关闭）。 */
  function init(env) {
    if (started || !Nav) return;
    started = true;
    onEvent = env && env.onEvent;
    if (env && env.enabled) enabled = env.enabled;
    input = Nav.createPadInput({ switchKeycap: env && env.switchKeycap });
    const lose = () => { cancelTimers(); needResync = true; input.reset(); if (isNative()) { nativePads.clear(); setSwitch([]); } };
    const back = () => { needResync = true; if (isNative()) nativeStep(); else kick(); };
    root.addEventListener('blur', () => { needResync = true; if (!isNative()) { cancelTimers(); input.reset(); } });
    root.addEventListener('focus', back);
    if (doc) doc.addEventListener('visibilitychange', () => { if (doc.hidden) lose(); else back(); });
    if (isNative()) { startNative(); return; }
    if (!root.navigator || typeof root.navigator.getGamepads !== 'function') return;
    root.addEventListener('gamepadconnected', kick);
    root.addEventListener('gamepaddisconnected', kick);
    kick(); // 页面加载时手柄可能已经被识别
  }

  root.BMPadInput = {
    init, state,
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
    /** 测试 / 调试：当前是否在轮询。 */
    get polling() { return timer != null || raf != null; },
  };
})(typeof self !== 'undefined' ? self : this);
