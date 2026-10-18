/**
 * 扩展符号的一轮练习 / 复习 / 错题（纯逻辑，写分通过 BMProgress 的 ext 记录，与主表记录分开）。
 * 题型：
 *  - 'dots'          看符号，逐方输入点位
 *  - 'chooseCells'   看符号，选正确的点位序列
 *  - 'chooseSymbol'  看点位序列，选符号（歧义组里的符号不出）
 * qtype：'dots' | 'choose'（两种选择题随机）| 'mix'（三种随机）；某题型凑不出选项时退回点位题。
 * 渲染进程：window.BMExtRound；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./seq.js'), require('./pick.js'), require('./progress.js'), require('./ext.js'));
  } else root.BMExtRound = factory(root.BMSeq, root.BMPick, root.BMProgress, root.BMExt);
})(typeof self !== 'undefined' ? self : this, function (Seq, Pick, Prog, Ext) {
  'use strict';

  const MODES = ['practice', 'review', 'wrong'];

  class ExtRound {
    /**
     * @param {object} o
     * @param {'practice'|'review'|'wrong'} o.mode
     * @param {object[]} o.rows 当前范围内的扩展符号
     * @param {object} o.ext Ext.build(全部扩展符号) 的结果（干扰项取自同类别）
     * @param {object} o.progress 进度（会被写分）
     * @param {object} o.cfg
     * @param {number} o.length 题量
     * @param {'dots'|'choose'|'mix'} o.qtype
     * @param {() => number} o.rng
     */
    constructor(o) {
      if (!MODES.includes(o.mode)) throw new Error('mode ' + o.mode);
      Object.assign(this, o);
      this.index = 0;
      this.current = null;
      this.log = [];
      this.lastId = undefined;
      this.ended = false;
    }

    pool() {
      return this.mode === 'wrong' ? Prog.extWeakRows(this.progress, this.rows) : this.rows;
    }

    /**
     * 出下一题；结束时返回 null。
     * @param {{type?: string, rowId?: number}} [force] 测试 / 截图用：指定题型与符号
     * @returns {{n:number, row:object, type:'dots'|'chooseCells'|'chooseSymbol', options:object[]|null}|null}
     */
    next(force) {
      if (this.ended) return null;
      const pool = this.pool();
      if (this.index >= this.length || pool.length === 0) { this.ended = true; this.current = null; return null; }
      let row = null;
      if (force && force.rowId != null) row = this.rows.find((r) => r.id === force.rowId) || null;
      if (!row) {
        const weight = this.mode === 'practice' ? () => 1 : (r) => 1 + Prog.extState(this.progress, r).score;
        row = Pick.pickWeighted(pool, weight, this.rng, this.lastId);
      }
      let type = (force && force.type) || this.qtype;
      if (type === 'mix') type = ['dots', 'chooseCells', 'chooseSymbol'][Math.floor(this.rng() * 3)];
      else if (type === 'choose') type = this.rng() < 0.5 ? 'chooseCells' : 'chooseSymbol';
      let options = null;
      if (type === 'chooseCells') options = Ext.chooseCells(this.ext, row, this.rng, this.cfg.options);
      else if (type === 'chooseSymbol') options = Ext.chooseSymbol(this.ext, row, this.rng, this.cfg.options);
      if (type !== 'dots' && !options) {
        // 另一种选择题能出就换，否则退回点位题
        const other = type === 'chooseCells' ? 'chooseSymbol' : 'chooseCells';
        options = other === 'chooseCells' ? Ext.chooseCells(this.ext, row, this.rng, this.cfg.options) : Ext.chooseSymbol(this.ext, row, this.rng, this.cfg.options);
        type = options ? other : 'dots';
      }
      this.index++;
      this.lastId = row.id;
      this.current = { n: this.index, row, type, options };
      return this.current;
    }

    /**
     * 作答并写分。
     * @param {{cells?: number[][], optionId?: number}} answer
     * @param {number} ms 用时
     * @returns {{correct:boolean, judge:object|null, row:object}} judge = Seq.judgeSeq 的结果（仅点位题）
     */
    answer(answer, ms) {
      const q = this.current;
      if (!q) throw new Error('no question');
      let correct;
      let judge = null;
      if (q.type === 'dots') {
        judge = Seq.judgeSeq(q.row.cells, answer.cells || []);
        correct = judge.correct;
      } else {
        const opt = q.options.find((r) => r.id === answer.optionId);
        correct = !!opt && opt.cellsText === q.row.cellsText;
      }
      Prog.recordExtAnswer(this.progress, q.row, correct, this.cfg);
      this.log.push({ id: q.row.id, correct, ms: Math.max(0, ms) });
      this.current = null;
      return { correct, judge, row: q.row };
    }

    summary() {
      const total = this.log.length;
      const correct = this.log.filter((x) => x.correct).length;
      const ms = this.log.reduce((s, x) => s + x.ms, 0);
      const wrongIds = [...new Set(this.log.filter((x) => !x.correct).map((x) => x.id))];
      return { mode: this.mode, total, correct, acc: total ? correct / total : 0, totalSec: ms / 1000, avgSec: total ? ms / total / 1000 : 0, wrongIds };
    }
  }

  return { MODES, ExtRound };
});
