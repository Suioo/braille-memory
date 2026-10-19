/**
 * 启动画面（冷启动只播一次）：背景上 6 个盲文点依次亮起组成一个盲文方，「盲文记忆」淡入，整屏淡出进入首页。
 * 配色全部来自当前主题的 CSS 变量（风格 / 种子色 / 深浅色），不写死颜色；点的位置来自 core/cell.js 的布局函数，不含任何符号的点位。
 * 时间线与放行规则在 core/splash.js（有单元测试）；这里只管 DOM：
 *  - 淡出 = 动画播完 与 首页就绪 中较晚者；点按可跳过；最多 3 s 强制淡出，加载失败 / 很慢也不会卡住。
 *  - 画面期间底下的页面 inert（Tab / 点按 / 读屏都够不到），画面本身 aria-hidden（读屏不会读到里面的文字）；消失后焦点回到页面。
 *  - 截图 / e2e 模式、减弱动效、非冷启动：不播放，直接进入首页。
 *  - 安卓：画面绘制出来之后才隐藏原生启动屏（背景色与动画一致），避免「白屏 → 原生屏 → 网页」闪一下。
 * window.BMSplash
 */
(function (root) {
  'use strict';
  const { h } = root.BMDom;
  const Plan = root.BMSplashPlan;
  const { dotPosition } = root.BMCell;
  const doc = root.document;

  let played = false;   // 本次页面加载是否已经播过（只在冷启动播一次）
  let playing = false;
  let el = null;
  let startT = 0;
  let readyAt = null;
  let skippedAt = null;
  let fadeTimer = null;
  let fading = false;
  let nativeHidden = false;
  let failSafe = null;

  const now = () => (root.performance ? root.performance.now() : Date.now());
  const reduced = () => { try { return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; } };
  const appEl = () => doc.getElementById('app');

  /** 隐藏安卓原生启动屏（其它平台空操作；只做一次）。 */
  function hideNative() {
    if (nativeHidden) return;
    nativeHidden = true;
    try { if (root.bm && typeof root.bm.hideNativeSplash === 'function') root.bm.hideNativeSplash(); } catch (_) { /* 忽略 */ }
  }

  function build() {
    const cell = h('div', { class: 'splash-cell' });
    const dots = [1, 2, 3, 4, 5, 6].map((n) => {
      const p = dotPosition(n, false);
      const d = h('span', { class: 'splash-dot' });
      d.style.gridRow = String(p.row);
      d.style.gridColumn = String(p.col);
      cell.append(d);
      return d;
    });
    const title = h('div', { class: 'splash-title', text: root.STR ? root.STR.appName : '盲文记忆' });
    const node = h('div', { class: 'splash', 'aria-hidden': 'true' }, h('div', { class: 'splash-inner' }, cell, title));
    return { node, dots, title };
  }

  function finish() {
    if (!el) return;
    const node = el;
    el = null;
    playing = false;
    fading = false;
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    if (failSafe) { clearTimeout(failSafe); failSafe = null; }
    node.remove();
    const app = appEl();
    if (app) { app.inert = false; app.removeAttribute('aria-hidden'); }
    // 焦点回到正常位置：当前页面的 screen（与页面切换后的焦点处理一致）
    const scr = doc.querySelector('.screen');
    const a = doc.activeElement;
    if (scr && (!a || a === doc.body)) scr.focus({ preventScroll: true });
  }

  function fadeOut(ms) {
    if (!el || fading) return;
    fading = true;
    el.style.pointerEvents = 'none';
    const node = el;
    if (typeof node.animate !== 'function' || ms <= 0) { finish(); return; }
    const a = node.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)', fill: 'forwards' });
    a.onfinish = finish;
    a.oncancel = finish;
  }

  /** 按当前状态（就绪时间、是否被点按跳过）重新安排淡出。 */
  function plan() {
    if (!playing || fading) return;
    if (fadeTimer) { clearTimeout(fadeTimer); fadeTimer = null; }
    const p = Plan.fadePlan({ ready: readyAt, skippedAt });
    const delay = Math.max(0, p.at - (now() - startT));
    fadeTimer = setTimeout(() => { fadeTimer = null; fadeOut(p.fadeMs); }, delay);
  }

  /**
   * 冷启动时调用一次（设置已应用到主题之后）。返回是否播放。
   * @param {{shot?:*}} [o]
   */
  function start(o) {
    o = o || {};
    if (!Plan.shouldPlay({ shot: o.shot, reduced: reduced(), played })) { played = true; return false; }
    played = true;
    const b = build();
    el = b.node;
    playing = true;
    startT = now();
    readyAt = null;
    skippedAt = null;
    const app = appEl();
    if (app) { app.inert = true; app.setAttribute('aria-hidden', 'true'); }
    doc.body.append(el);
    // 6 个点依次亮起（只用 opacity / transform：在合成线程上跑，页面忙于初始化时动画也不卡）
    b.dots.forEach((d, i) => {
      d.animate([{ opacity: 0.16, transform: 'scale(0.55)' }, { opacity: 1, transform: 'scale(1.12)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }],
        { duration: Plan.DOT_MS, delay: Plan.dotStartMs(i), easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' });
    });
    b.title.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: Plan.TITLE_MS, delay: Plan.TITLE_AT_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'both' });
    // 点按任意处跳过
    el.addEventListener('pointerdown', skip);
    // 画面真正绘制出来（两帧之后）才隐藏原生启动屏
    const raf = root.requestAnimationFrame || ((f) => setTimeout(f, 16));
    raf(() => raf(hideNative));
    // 兜底：最多 MAX_MS 强制淡出；再保险——原生屏最迟也在 MAX_MS + 1 s 隐藏
    failSafe = setTimeout(() => { failSafe = null; hideNative(); if (playing) fadeOut(Plan.SKIP_FADE_MS); }, Plan.MAX_MS + 1000);
    plan();
    return true;
  }

  /** 首页（或错误提示）已经渲染：可以淡出了（也用于不播放时隐藏原生屏）。 */
  function ready() {
    hideNative();
    if (!playing) return;
    if (readyAt == null) readyAt = now() - startT;
    plan();
  }

  /** 放弃：启动太慢 / 出错时调用——本次不再播放；正在播放的快速淡出；原生启动屏一并隐藏。 */
  function giveUp() {
    played = true;
    hideNative();
    if (playing) fadeOut(Plan.SKIP_FADE_MS);
  }

  /** 跳过动画（点按 / 键盘 Enter、空格、Esc、返回键）。 */
  function skip() {
    if (!playing || fading) return;
    if (skippedAt == null) skippedAt = now() - startT;
    plan();
  }

  root.BMSplash = { start, ready, skip, giveUp, get active() { return playing; } };
})(typeof self !== 'undefined' ? self : this);
