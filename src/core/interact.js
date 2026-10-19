/**
 * 交互纯逻辑（不碰 DOM）：分段按钮的「按住滑动」判定、迷你点图的朝向状态。
 * 渲染进程：window.BMInteract；Node / 测试：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMInteract = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 水平位移达到该像素数、且大于竖直位移，才算「开始滑动」；否则仍按点按 / 滚动处理。 */
  const SLIDE_THRESHOLD_PX = 6;
  /** 指针竖直方向离开控件超过该像素数，视为放弃（松手不选）。 */
  const SLIDE_SLACK_PX = 48;

  /**
   * 是否从点按转为滑动。
   * @param {number} dx 相对按下点的水平位移
   * @param {number} dy 相对按下点的竖直位移
   * @param {number} [threshold]
   */
  function exceedsSlide(dx, dy, threshold) {
    const t = threshold == null ? SLIDE_THRESHOLD_PX : threshold;
    return Math.abs(dx) >= t && Math.abs(dx) > Math.abs(dy);
  }

  /**
   * 指针 x 坐标落在哪个段（超出两端则取首 / 末段；段之间的缝取更近的一段）。
   * @param {number} x
   * @param {{left:number,right:number}[]} rects 各段的水平范围，从左到右
   * @returns {number} 段下标；rects 为空返回 -1
   */
  function segmentIndexFromX(x, rects) {
    if (!rects || !rects.length) return -1;
    if (x <= rects[0].left) return 0;
    const last = rects.length - 1;
    if (x >= rects[last].right) return last;
    for (let i = 0; i <= last; i++) {
      if (x >= rects[i].left && x < rects[i].right) return i;
      if (i < last && x >= rects[i].right && x < rects[i + 1].left) {
        return x - rects[i].right < rects[i + 1].left - x ? i : i + 1;
      }
    }
    return last;
  }

  /**
   * 滑动时指针下的段；竖直方向离开控件太远返回 -1（表示放弃）。
   * @param {number} x
   * @param {number} y
   * @param {{left:number,right:number}[]} rects
   * @param {{top:number,bottom:number}} box 控件的竖直范围
   * @param {number} [slack]
   */
  function hoverIndex(x, y, rects, box, slack) {
    const s = slack == null ? SLIDE_SLACK_PX : slack;
    if (y < box.top - s || y > box.bottom + s) return -1;
    return segmentIndexFromX(x, rects);
  }

  /**
   * 迷你点图的朝向状态：显示的朝向 = 当前视角，点一下换成另一个；换题 / 换视角时重建即复位。
   * @param {boolean} viewMirror 当前全局视角（true = 镜像）
   */
  function createMiniOrient(viewMirror) {
    let flipped = false;
    return {
      /** 迷你图当前是否按镜像排列。 */
      get mirror() { return flipped ? !viewMirror : !!viewMirror; },
      /** 是否处于「另一个视角」（aria-pressed）。 */
      get flipped() { return flipped; },
      toggle() { flipped = !flipped; return flipped; },
      reset() { flipped = false; },
    };
  }

  /**
   * 「按住滑动选择」手势的状态机（分段按钮、底部导航、类别芯片共用；纯逻辑，时间由调用方传入）。
   * phase：pending（刚按下，还没分出是点按、滚动还是滑动）→ sliding（滑动选择中）/ scrolling（交给浏览器滚动，本次手势不再处理）。
   *  - holdMs = 0（分段按钮、导航）：水平位移达到阈值且大于竖直位移 → sliding；竖直为主 → scrolling。
   *  - holdMs > 0（可横向滚动的芯片行）：按住满 holdMs 且没怎么动 → sliding；还没按满就移动超过阈值 → scrolling（快速划动仍是滚动）。
   * sliding 时 hover = 指针下的段（离开控件上下太远 = -1，松手即放弃）；松手只有 sliding 且 hover >= 0 才提交。
   * pointercancel（系统手势等）→ cancel()，由调用方恢复到按下前的选中项。
   * @param {{threshold?:number, holdMs?:number, slack?:number}} [o]
   */
  function createSlideSession(o) {
    o = o || {};
    const thr = o.threshold == null ? SLIDE_THRESHOLD_PX : o.threshold;
    const hold = o.holdMs || 0;
    const slack = o.slack == null ? SLIDE_SLACK_PX : o.slack;
    let s = null;
    const hoverAt = () => hoverIndex(s.x, s.y, s.rects, s.box, slack);
    const enter = () => { s.phase = 'sliding'; s.hover = segmentIndexFromX(s.x, s.rects); return { phase: 'sliding', hover: s.hover, changed: true, entered: true }; };
    const view = (changed) => ({ phase: s.phase, hover: s.hover, changed: !!changed, entered: false });
    return {
      get phase() { return s ? s.phase : 'idle'; },
      get hover() { return s ? s.hover : -1; },
      /** @param {{id:*, x:number, y:number, t:number, rects:{left:number,right:number}[], box:{top:number,bottom:number}}} p */
      down(p) {
        s = { id: p.id, x0: p.x, y0: p.y, t0: p.t, x: p.x, y: p.y, rects: p.rects, box: p.box, phase: 'pending', hover: segmentIndexFromX(p.x, p.rects) };
        return view(false);
      },
      /** 指针移动。返回 null = 没有进行中的手势。 */
      move(p) {
        if (!s) return null;
        s.x = p.x; s.y = p.y;
        if (s.phase === 'scrolling') return view(false);
        if (s.phase === 'pending') {
          const dx = p.x - s.x0; const dy = p.y - s.y0;
          const moved = Math.abs(dx) >= thr || Math.abs(dy) >= thr;
          if (hold > 0) {
            if (!moved) return view(false);
            if (p.t - s.t0 >= hold) return enter(); // 已按满：这次移动就是拖动
            s.phase = 'scrolling';
            return view(false);
          }
          if (exceedsSlide(dx, dy, thr)) return enter();
          if (moved && Math.abs(dy) > Math.abs(dx)) { s.phase = 'scrolling'; return view(false); }
          return view(false);
        }
        const h = hoverAt();
        const changed = h !== s.hover;
        s.hover = h;
        return view(changed);
      },
      /** 定时器到点（holdMs 之后调用）：没怎么动就进入滑动。 */
      tick(t) {
        if (!s || s.phase !== 'pending' || hold <= 0 || t - s.t0 < hold) return null;
        if (Math.abs(s.x - s.x0) >= thr || Math.abs(s.y - s.y0) >= thr) return null;
        return enter();
      },
      /** 重新测量（芯片行滚动、窗口尺寸变化、旋转）：滑动中按最新位置重算指针下的段。 */
      remeasure(rects, box) {
        if (!s) return null;
        s.rects = rects; s.box = box;
        if (s.phase !== 'sliding') return view(false);
        const h = hoverAt();
        const changed = h !== s.hover;
        s.hover = h;
        return view(changed);
      },
      /** 松手。commit = 是否提交 index。 */
      up() {
        if (!s) return { phase: 'idle', commit: false, index: -1 };
        const r = { phase: s.phase, commit: s.phase === 'sliding' && s.hover >= 0, index: s.hover };
        s = null;
        return r;
      },
      /** 取消（pointercancel / 失焦）：滑动中则要求恢复到按下前的选中项。 */
      cancel() {
        const was = s ? s.phase : 'idle';
        s = null;
        return { restore: was === 'sliding' };
      },
    };
  }

  return { SLIDE_THRESHOLD_PX, SLIDE_SLACK_PX, exceedsSlide, segmentIndexFromX, hoverIndex, createSlideSession, createMiniOrient };
});
