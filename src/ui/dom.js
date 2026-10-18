/**
 * DOM / SVG 小工具与图标。window.BMDom
 * 所有来自 CSV 的文字一律用 textContent 写入（不拼 HTML）。
 */
(function (root) {
  'use strict';
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /**
   * 创建元素。attrs: class / text / on<事件> / 其它属性（false/null 跳过）。
   * @returns {HTMLElement}
   */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === false || v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(3)) if (kid != null && kid !== false) el.append(kid);
    return el;
  }

  /** 创建 SVG 元素。 */
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    for (const kid of kids) el.append(kid);
    return el;
  }

  const icon = (...paths) => s('svg', { viewBox: '0 0 24 24', class: 'ico', 'aria-hidden': 'true' }, ...paths);
  const P = (d, cls) => s('path', cls ? { d, class: cls } : { d });
  const ICON = {
    back: () => icon(P('M20 12H5M11 5l-7 7 7 7')),
    prev: () => icon(P('M15 5l-7 7 7 7')),
    next: () => icon(P('M9 5l7 7-7 7')),
    check: () => icon(P('M5.5 12.5l4 4 9-9')),
    cross: () => icon(P('M7 7l10 10M17 7L7 17')),
    plus: () => icon(P('M12 6v12M6 12h12')),
    lock: () => icon(s('rect', { x: 5.5, y: 10.5, width: 13, height: 10, rx: 2.5 }), P('M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5')),
    // 导航：学习 = 卡片，练习 = 笔，闯关 = 旗，我的 = 人
    learn: () => icon(s('rect', { x: 4, y: 3.5, width: 16, height: 17, rx: 3 }), P('M8 9h8M8 13h5')),
    practice: () => icon(P('M4.5 19.5l1-4.2L15.8 5a2 2 0 0 1 2.9 0l.3.3a2 2 0 0 1 0 2.9L8.7 18.5z'), P('M13.5 7.3l3.2 3.2')),
    course: () => icon(P('M6 21V3.5'), P('M6 4h11.5l-2.5 4.5 2.5 4.5H6')),
    me: () => icon(s('circle', { cx: 12, cy: 8, r: 4 }), P('M4 21a8 8 0 0 1 16 0')),
    mirror: () => icon(P('M12 3v18', 'dash'), P('M8 8l-4 4 4 4M16 8l4 4-4 4')),
    flip: () => icon(P('M4.5 11a7.5 7.5 0 0 1 13.4-4.6M19.5 4v4h-4'), P('M19.5 13a7.5 7.5 0 0 1-13.4 4.6M4.5 20v-4h4')),
    play: () => icon(P('M8 5.5v13l10.5-6.5z', 'fill')),
    review: () => icon(P('M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5')),
    hint: () => icon(P('M9.5 18h5M10.5 21h3'), P('M12 3a6 6 0 0 0-3.5 10.9V15.5h7v-1.6A6 6 0 0 0 12 3z')),
    timer: () => icon(s('circle', { cx: 12, cy: 13.5, r: 7.5 }), P('M12 9.5v4l2.5 1.5M9.5 2.5h5')),
  };

  /** 显示宽度：汉字记 1，其它记 0.6；用于选择符号字号档 s/m/l。 */
  function symClass(symbol) {
    let w = 0;
    for (const ch of symbol) w += /[　-鿿＀-￯]/.test(ch) ? 1 : 0.6;
    return w <= 3 ? 's' : w <= 6.5 ? 'm' : 'l';
  }

  /** 等两帧（布局与绘制完成）。 */
  const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  /** 重新触发一次 CSS 动画类。 */
  function replay(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  /** 秒数显示：< 10 保留 1 位小数。 */
  const fmtSec = (sec) => (sec < 10 ? sec.toFixed(1) : String(Math.round(sec)));

  root.BMDom = { h, s, ICON, symClass, nextFrame, replay, fmtSec };
})(typeof self !== 'undefined' ? self : this);
