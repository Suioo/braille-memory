/**
 * 文本练习的计时成绩（纯逻辑，不碰 DOM）：把一轮的作答日志按文本合计成一次「成绩」，并给出界面要显示的指标。
 * 「方」= 一个盲文方（含空方）；每方用时 = 总用时 / 方数；每分钟方数 = 方数 / 分钟；正确率 = 答对句数 / 作答句数。
 * 渲染进程：window.BMTextStats；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMTextStats = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 一轮日志 → 每篇文本一次成绩。
   * @param {{key:string, correct:boolean, ms:number}[]} log RuleRound.summary 前的 round.log
   * @param {Map<string,{textId:string, cells:number[][]}>} byKey 文本题目（key → 题目）
   * @param {string} at 时间戳（ISO）
   * @returns {{textId:string, run:{at:string,n:number,ok:number,cells:number,ms:number}}[]} 没有有效用时的文本不出成绩
   */
  function roundRuns(log, byKey, at, maxMs) {
    const by = new Map();
    for (const x of log) {
      const it = byKey.get(x.key);
      if (!it) continue;
      let r = by.get(it.textId);
      if (!r) { r = { at, n: 0, ok: 0, cells: 0, ms: 0 }; by.set(it.textId, r); }
      r.n += 1;
      if (x.correct) r.ok += 1;
      r.cells += it.cells.length;
      r.ms += Math.min(maxMs || Infinity, Math.max(0, Math.round(x.ms)));
    }
    return [...by].filter(([, r]) => r.n > 0 && r.cells > 0 && r.ms > 0).map(([textId, run]) => ({ textId, run }));
  }

  /** 指标：正确率、每分钟方数、每方用时（秒）、总用时（秒）。 */
  function metrics(run) {
    return { acc: run.n ? run.ok / run.n : 0, cpm: run.ms > 0 ? run.cells / (run.ms / 60000) : 0, secPerCell: run.cells ? run.ms / 1000 / run.cells : 0, totalSec: run.ms / 1000 };
  }

  /** 最近几次的每分钟方数（旧 → 新），给迷你折线用。 */
  const trend = (runs) => (runs ? runs.recent.map((r) => metrics(r).cpm) : []);

  return { roundRuns, metrics, trend };
});
