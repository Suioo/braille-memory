/**
 * 一轮练习 / 复习 / 错题（纯逻辑，写分通过 BMProgress）。
 * 渲染进程：window.BMRound；Node：require()。
 *
 * mode:
 *  - 'practice' 范围内均匀抽题
 *  - 'review'   范围内按 1+score 加权抽题（间隔复习）
 *  - 'wrong'    只抽待加强（score>0），没有待加强时提前结束
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cell.js'), require('./pick.js'), require('./progress.js'));
  } else root.BMRound = factory(root.BMCell, root.BMPick, root.BMProgress);
})(typeof self !== 'undefined' ? self : this, function (Cell, Pick, Prog) {
  'use strict';

  const MODES = ['practice', 'review', 'wrong'];

  class Round {
    /**
     * @param {object} o
     * @param {'practice'|'review'|'wrong'} o.mode
     * @param {object[]} o.rows 当前范围内的符号
     * @param {object[]} o.table 全表（干扰项兜底）
     * @param {object} o.progress 进度（会被写分）
     * @param {object} o.cfg
     * @param {number} o.length 题量
     * @param {'dots'|'choose'|'mix'} o.qtype
     * @param {() => number} o.rng
     */
    constructor(o) {
      if (!MODES.includes(o.mode)) throw new Error('mode ' + o.mode);
      Object.assign(this, o);
      this.index = 0;          // 已出题数
      this.current = null;
      this.log = [];           // {id, correct, ms}
      this.lastId = undefined;
      this.ended = false;
    }

    /** 当前可抽的符号。 */
    pool() {
      return this.mode === 'wrong' ? Prog.weakRows(this.progress, this.rows) : this.rows;
    }

    /**
     * 出下一题；结束时返回 null。
     * @param {{type?: string, rowId?: number}} [force] 截图/测试用：指定题型与符号
     * @returns {{n:number, row:object, type:'dots'|'choose', options:object[]|null}|null}
     */
    next(force) {
      if (this.ended) return null;
      const pool = this.pool();
      if (this.index >= this.length || pool.length === 0) { this.ended = true; this.current = null; return null; }
      let row = null;
      if (force && force.rowId != null) row = this.rows.find((r) => r.id === force.rowId) || null;
      if (!row) {
        const weight = this.mode === 'practice' ? () => 1 : (r) => 1 + Prog.symState(this.progress, r).score;
        row = Pick.pickWeighted(pool, weight, this.rng, this.lastId);
      }
      let type = (force && force.type) || this.qtype;
      if (type === 'mix') type = this.rng() < 0.5 ? 'dots' : 'choose';
      let options = null;
      if (type === 'choose') {
        options = Pick.makeOptions(row, this.rows, this.table, this.rng, this.cfg.options);
        if (options.length < 2) { type = 'dots'; options = null; }
      }
      this.index++;
      this.lastId = row.id;
      this.current = { n: this.index, row, type, options };
      return this.current;
    }

    /**
     * 作答并写分。
     * @param {{dots?: number[], optionId?: number}} answer
     * @param {number} ms 用时
     * @returns {{correct:boolean, judge:object|null, row:object}}
     */
    answer(answer, ms) {
      const q = this.current;
      if (!q) throw new Error('no question');
      let correct;
      let judge = null;
      if (q.type === 'dots') {
        judge = Cell.judge(q.row.dots, answer.dots || []);
        correct = judge.correct;
      } else {
        const opt = q.options.find((r) => r.id === answer.optionId);
        correct = !!opt && opt.dotsText === q.row.dotsText;
      }
      Prog.recordAnswer(this.progress, q.row, correct, this.cfg);
      this.log.push({ id: q.row.id, correct, ms: Math.max(0, ms) });
      this.current = null;
      return { correct, judge, row: q.row };
    }

    /** 本轮统计。 */
    summary() {
      const total = this.log.length;
      const correct = this.log.filter((x) => x.correct).length;
      const ms = this.log.reduce((s, x) => s + x.ms, 0);
      const wrongIds = [...new Set(this.log.filter((x) => !x.correct).map((x) => x.id))];
      return {
        mode: this.mode, total, correct,
        acc: total ? correct / total : 0,
        totalSec: ms / 1000,
        avgSec: total ? ms / total / 1000 : 0,
        wrongIds,
      };
    }
  }

  return { MODES, Round };
});
