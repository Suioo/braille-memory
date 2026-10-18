/**
 * 多方符号（点位序列）的纯逻辑：逐方判分、阅读 / 扎写视角下各方的排列。
 * 点位只来自 data/braille_extra.csv 解析出的 cells；本文件不含任何点位。
 * 渲染进程：window.BMSeq；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cell.js'));
  else root.BMSeq = factory(root.BMCell);
})(typeof self !== 'undefined' ? self : this, function (Cell) {
  'use strict';

  /**
   * 逐方判分：第 i 方的作答与第 i 方的正确点位比较（Cell.judge）；整串全对且方数相同才算对。
   * @param {number[][]} correct 正确的各方点位
   * @param {number[][]} answer 作答的各方点位（可短于或长于正确方数）
   * @returns {{cells: object[], missingCells: number, extraCells: number, firstWrong: number, correct: boolean}}
   *   cells[i] 是 Cell.judge 的结果（作答不足的方按空作答判，多出的方不在其中）；firstWrong = 第一个出错的方（0 起，全对为 -1）
   */
  function judgeSeq(correct, answer) {
    const ans = answer || [];
    const cells = correct.map((c, i) => Cell.judge(c, ans[i] || []));
    const missingCells = Math.max(0, correct.length - ans.length);
    const extraCells = Math.max(0, ans.length - correct.length);
    const firstWrong = cells.findIndex((j) => !j.correct);
    const ok = firstWrong < 0 && extraCells === 0;
    return { cells, missingCells, extraCells, firstWrong: ok ? -1 : (firstWrong >= 0 ? firstWrong : correct.length), correct: ok };
  }

  /**
   * 各方在屏幕上从左到右的显示顺序（下标指向「第几方」，输入顺序始终从第 1 方开始）。
   * 阅读视角：第 1 方在最左；扎写（镜像）视角：整串从右往左排，第 1 方在最右。
   * @param {number} n 方数
   * @param {boolean} mirror
   * @returns {number[]}
   */
  function displayOrder(n, mirror) {
    const order = Array.from({ length: n }, (_, i) => i);
    return mirror ? order.reverse() : order;
  }

  /**
   * 整串的显示布局：按显示顺序给出每一方的下标与单方布局（扎写时每方内部左右列也互换）。
   * @param {number[][]} cells
   * @param {boolean} mirror
   * @returns {{index:number, layout:object[]}[]} 从屏幕左到右
   */
  function seqLayout(cells, mirror) {
    return displayOrder(cells.length, mirror).map((index) => ({ index, layout: Cell.cellLayout(cells[index], mirror) }));
  }

  return { judgeSeq, displayOrder, seqLayout };
});
