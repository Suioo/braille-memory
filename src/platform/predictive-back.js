/**
 * 预测性返回（Android 14+ 的返回手势）：手指从屏幕边缘往里滑时，当前页面跟着缩小、让出一点位置（圆角渐增）；
 * 松手确认 → 真正返回上一级（页面自己的返回过渡），松手前拉回去 → 页面弹回原样。
 *
 * 原生侧（PredictiveBackPlugin.java）把手势进度推过来；这里只管页面的变形。不在根页时才向原生注册回调；
 * 回到根页就注销，让系统接管并播放自己的「返回桌面」预览。Android 14 以下 / 浏览器 / Electron 没有进度，空操作，
 * 返回仍走 app.js 里 @capacitor/app 的普通返回键监听。
 * 渲染进程：window.BMPredictiveBack；Node：require()（shape 可单测）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPredictiveBack = factory(root);
})(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  /**
   * 手势进度 0..1（和起始边 0 = 左 / 1 = 右）→ 变形参数。
   * 当前页：缩到 86%、向手指一侧让出最多 36 px、圆角最大 32 px、阴影渐深；曲线先快后缓。
   * 底下的上一级页面：从 92% 放大到 100%，由暗（亮度 70%）渐亮到正常。
   */
  function shape(progress, edge) {
    const p = Math.min(1, Math.max(0, Number.isFinite(+progress) ? +progress : 0));
    const e = 1 - Math.pow(1 - p, 2);
    return {
      scale: 1 - 0.2 * e, shift: (edge === 1 ? -1 : 1) * 56 * e, radius: 40 * e, shadow: 0.42 * e,
      underScale: 0.88 + 0.12 * e, underBright: 0.62 + 0.38 * e,
    };
  }

  const api = { shape, supported: false };
  if (!root || !root.document) return api;

  let env = null;
  let screen = null;
  let host = null;
  let under = null;
  let peek = null;
  let edge = 0;
  let enabledNow = null;
  let hasNative = false;

  const resetEl = (el) => {
    if (!el) return;
    for (const k of ['transform', 'borderRadius', 'overflow', 'transition', 'willChange', 'boxShadow', 'position', 'zIndex', 'opacity']) el.style[k] = '';
  };
  const cleanup = () => {
    if (under && under.parentNode) under.remove();
    if (peek && peek.dispose) { try { peek.dispose(); } catch (_) { /* 忽略 */ } }
    if (host) host.classList.remove('pb-active');
    under = null; peek = null;
  };
  const paint = (p, ed) => {
    if (!screen) return;
    const s = shape(p, ed);
    screen.style.transform = 'translateX(' + s.shift.toFixed(1) + 'px) scale(' + s.scale.toFixed(4) + ')';
    screen.style.borderRadius = s.radius.toFixed(1) + 'px';
    screen.style.overflow = 'hidden';
    screen.style.boxShadow = '0 ' + (24 * s.shadow / 0.42).toFixed(1) + 'px ' + (56 * s.shadow / 0.42).toFixed(1) + 'px rgba(0,0,0,' + s.shadow.toFixed(3) + ')';
    if (under) { under.style.transform = 'scale(' + s.underScale.toFixed(4) + ')'; under.style.filter = 'brightness(' + s.underBright.toFixed(3) + ')'; }
  };
  const call = (plugin, method, options) => {
    try { const pr = root.Capacitor.nativePromise(plugin, method, options); if (pr && pr.catch) pr.catch(() => {}); return pr; } catch (_) { return null; }
  };
  const SOFT = 'transform 220ms cubic-bezier(0.2, 0, 0, 1), border-radius 220ms cubic-bezier(0.2, 0, 0, 1), box-shadow 220ms, filter 220ms';

  function onStarted(d) {
    cleanup();
    screen = env.getScreen();
    host = env.getHost ? env.getHost() : null;
    if (!screen) return;
    edge = d && d.edge === 1 ? 1 : 0;
    screen.style.transition = 'none';
    screen.style.willChange = 'transform';
    screen.style.position = 'relative';
    screen.style.zIndex = '1';
    if (host) {
      host.classList.add('pb-active');
      try { peek = env.peek ? env.peek() : null; } catch (_) { peek = null; }
      if (peek && peek.el) {
        under = peek.el;
        under.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;transition:none;will-change:transform,filter;';
        host.insertBefore(under, host.firstChild);
        if (peek.attached) { try { peek.attached(); } catch (_) { /* 忽略 */ } }
      }
    }
    paint(d && d.progress, edge);
  }
  function onProgress(d) { if (screen) paint(d && d.progress, d && d.edge === 1 ? 1 : edge); }
  function onCancelled() {
    const el = screen;
    const u = under;
    screen = null;
    if (!el) { cleanup(); return; }
    el.style.transition = SOFT;
    el.style.transform = ''; el.style.borderRadius = ''; el.style.boxShadow = '';
    if (u) { u.style.transition = SOFT; u.style.transform = 'scale(0.88)'; u.style.filter = 'brightness(0.62)'; }
    setTimeout(() => { resetEl(el); cleanup(); }, 260);
  }
  function onInvoked() {
    const el = screen;
    const u = under;
    screen = null;
    if (!el) { cleanup(); env.back(); return; }
    // 确认：当前页滑出去、底下的页面放大到位，然后真正返回（返回过渡关掉，视觉上是连着的）
    // 从手势当前位置接着走：略再缩小、淡出（减速曲线，不先停顿再猛冲），底下的页面同时放大到位
    el.style.transition = 'transform 220ms cubic-bezier(0.2, 0, 0, 1), opacity 200ms ease-out, box-shadow 220ms';
    el.style.transform = 'translateX(' + (edge === 1 ? '-' : '') + '64px) scale(0.74)';
    el.style.opacity = '0';
    if (u) { u.style.transition = 'transform 220ms cubic-bezier(0.2, 0, 0, 1), filter 220ms'; u.style.transform = 'scale(1)'; u.style.filter = 'brightness(1)'; }
    setTimeout(() => {
      const before = env.currentView ? env.currentView() : null;
      env.back({ dir: 'none' });
      const after = env.currentView ? env.currentView() : null;
      if (before && before === after && el.isConnected) {
        // 返回被页面自己处理了（例如只是关掉确认行）：当前页回到原位
        el.style.transition = SOFT + ', opacity 160ms';
        el.style.transform = ''; el.style.borderRadius = ''; el.style.boxShadow = ''; el.style.opacity = '';
        setTimeout(() => { resetEl(el); cleanup(); }, 260);
      } else { cleanup(); }
    }, 215);
  }

  /** @param {{getScreen:()=>HTMLElement|null, getHost?:()=>HTMLElement|null, peek?:()=>{el:HTMLElement, dispose?:Function}|null, currentView?:()=>*, back:(opts?:object)=>*}} e */
  function init(e) {
    env = e;
    const cap = root.Capacitor;
    try { hasNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform() && typeof cap.addListener === 'function'); } catch (_) { hasNative = false; }
    api._sim = { start: onStarted, progress: onProgress, cancel: onCancelled, invoke: onInvoked }; // 供测试 / 浏览器里模拟手势
    if (!hasNative) return;
    api.supported = true;
    cap.addListener('PredictiveBack', 'backStarted', onStarted);
    cap.addListener('PredictiveBack', 'backProgress', onProgress);
    cap.addListener('PredictiveBack', 'backCancelled', onCancelled);
    cap.addListener('PredictiveBack', 'backInvoked', onInvoked);
  }

  /**
   * 页面切换后调用：canBack = 现在返回会不会做点什么（不在根页）。
   * 不在根页：注册预测性返回回调、保留 App 插件的返回键监听（Android 14 以下的兜底）；
   * 在根页：两者都关掉，系统接管（播放返回桌面预览并退出）。
   */
  function sync(canBack) {
    if (!hasNative || enabledNow === !!canBack) return;
    enabledNow = !!canBack;
    call('PredictiveBack', 'setEnabled', { enabled: enabledNow });
    call('App', 'toggleBackButtonHandler', { enabled: enabledNow });
  }

  api.init = init;
  api.sync = sync;
  return api;
});
