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

  return { SLIDE_THRESHOLD_PX, SLIDE_SLACK_PX, exceedsSlide, segmentIndexFromX, hoverIndex, createMiniOrient };
});
