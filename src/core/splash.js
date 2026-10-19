/**
 * 启动画面的时间线与放行规则（纯逻辑，不碰 DOM；时间由调用方传入）。
 * 动画本身约 920 ms（6 个点依次亮起 → 标题淡入 → 停一下），然后整屏淡出 220 ms，合计 ≤ 1.2 s。
 * 淡出的开始时间 = 动画播完 与 首页就绪 中较晚的那个（不为等动画额外拖延，也不早于数据加载完）；
 * 点按画面可跳过（动画不用播完，首页一就绪立即淡出）；无论如何最多 3 s 就强制淡出（加载失败 / 很慢时不会卡住）。
 * 渲染进程：window.BMSplashPlan；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMSplashPlan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DOT_STAGGER_MS = 70;   // 相邻两个点亮起的间隔
  const DOT_MS = 200;          // 单个点亮起用时
  const DOTS = 6;
  const TITLE_AT_MS = 400;     // 标题开始淡入
  const TITLE_MS = 280;
  const ANIM_MS = 920;         // 动画总长（含最后停顿）
  const FADE_MS = 220;         // 整屏淡出
  const SKIP_FADE_MS = 120;    // 点按跳过 / 超时强制时的淡出
  const MAX_MS = 3000;         // 最长停留：超过就强制进入首页

  /**
   * 是否播放：只在冷启动、非截图 / e2e、没有开启减弱动效时播放。
   * @param {{shot?:*, reduced?:boolean, played?:boolean}} o
   */
  function shouldPlay(o) {
    return !o.shot && !o.reduced && !o.played;
  }

  /**
   * 淡出何时开始（相对 start 的毫秒数）；null = 还不能淡出（首页没好、也没到强制时间）。
   * @param {{ready:number|null, skippedAt:number|null}} st ready / skippedAt 都是相对 start 的毫秒数，没发生为 null
   * @returns {{at:number, fadeMs:number}|null}
   */
  function fadePlan(st) {
    const force = { at: MAX_MS, fadeMs: SKIP_FADE_MS };
    if (st.ready == null) return force; // 还没好：最迟到 MAX_MS 强制
    const skipped = st.skippedAt != null;
    const at = skipped ? Math.max(st.ready, st.skippedAt) : Math.max(st.ready, ANIM_MS);
    if (at >= MAX_MS) return force;
    return { at, fadeMs: skipped ? SKIP_FADE_MS : FADE_MS };
  }

  /** 6 个点的亮起开始时刻（点 1…6 依次）。 */
  const dotStartMs = (i) => i * DOT_STAGGER_MS;

  /** 正常时间线（无跳过、首页早已就绪）的总时长。 */
  const TOTAL_MS = ANIM_MS + FADE_MS;

  return { DOT_STAGGER_MS, DOT_MS, DOTS, TITLE_AT_MS, TITLE_MS, ANIM_MS, FADE_MS, SKIP_FADE_MS, MAX_MS, TOTAL_MS, shouldPlay, fadePlan, dotStartMs };
});
