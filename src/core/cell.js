/**
 * 盲文方的布局与判分（纯函数）。
 * 主进程/测试用 require()；渲染进程用 <script> 载入后挂在 window.BMCell。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMCell = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 点位编号 1..6。 */
  const DOT_NUMBERS = [1, 2, 3, 4, 5, 6];

  /**
   * 点位在 2×3 网格中的位置。默认左列 1-2-3、右列 4-5-6；
   * 镜像（扎写视角）只交换左右列，编号不变。
   * @param {number} n 点位编号 1..6
   * @param {boolean} mirror 是否镜像
   * @returns {{row:number, col:number}} 均从 1 开始
   */
  function dotPosition(n, mirror) {
    if (!Number.isInteger(n) || n < 1 || n > 6) throw new RangeError('dot ' + n);
    const row = ((n - 1) % 3) + 1;
    let col = n <= 3 ? 1 : 2;
    if (mirror) col = 3 - col;
    return { row, col };
  }

  /**
   * 整个盲文方的布局：每个点位的行列与是否凸起（大方格与迷你预览共用）。
   * @param {number[]} dots 凸起点位
   * @param {boolean} mirror 镜像
   * @returns {{n:number, row:number, col:number, raised:boolean}[]} 按编号 1..6
   */
  function cellLayout(dots, mirror) {
    const set = new Set(dots);
    return DOT_NUMBERS.map((n) => Object.assign({ n, raised: set.has(n) }, dotPosition(n, mirror)));
  }

  /**
   * 比较正确点位与作答点位。
   * @param {number[]} correct 正确点位
   * @param {number[]} selected 作答点位
   * @returns {{hit:number[], missed:number[], extra:number[], correct:boolean}}
   */
  function judge(correct, selected) {
    const c = new Set(correct);
    const s = new Set(selected);
    const hit = DOT_NUMBERS.filter((n) => c.has(n) && s.has(n));
    const missed = DOT_NUMBERS.filter((n) => c.has(n) && !s.has(n));
    const extra = DOT_NUMBERS.filter((n) => !c.has(n) && s.has(n));
    return { hit, missed, extra, correct: missed.length === 0 && extra.length === 0 };
  }

  return { DOT_NUMBERS, dotPosition, cellLayout, judge };
});
