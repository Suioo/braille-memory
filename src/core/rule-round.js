/**
 * 规则 / 词句的一轮练习 / 复习 / 错题（纯逻辑；写分写在 progress.rules，与其他记录分开）。
 * 题型：
 *  - translate 词句翻盲文：看汉字 + 拼音，逐方输入（含空方）；揭晓时指出第一个出错的方来自哪条规则
 *  - read      盲文读词：看点位串选汉字或拼音；选错时指出与答案第一个不同的方来自哪条规则
 *  - judge     规则判断：声调写不写 / 简写不简写（只在数据能支撑时出）
 * qtype：'translate' | 'read' | 'judge' | 'mix'；某题型没有可用题目时不出。
 * 渲染进程：window.BMRuleRound；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./rule-items.js'), require('./pick.js'), require('./progress.js'));
  } else root.BMRuleRound = factory(root.BMRuleItems, root.BMPick, root.BMProgress);
})(typeof self !== 'undefined' ? self : this, function (Items, Pick, Prog) {
  'use strict';

  const MODES = ['practice', 'review', 'wrong'];
  const TYPES = ['translate', 'read', 'judge'];

  /** 各题型的题目池。 */
  function poolOf(data, type) {
    if (type === 'judge') return data.judge;
    return data.words; // translate / read 都用例词（共用同一份进度）
  }
  /** 当前有题可出的题型。 */
  function availableTypes(data) {
    return TYPES.filter((t) => poolOf(data, t).length > (t === 'read' ? 1 : 0));
  }

  class RuleRound {
    /**
     * @param {object} o
     * @param {'practice'|'review'|'wrong'} o.mode
     * @param {object} o.data Items.build 的结果
     * @param {object} o.translator
     * @param {object} o.progress
     * @param {object} o.cfg
     * @param {number} o.length
     * @param {'translate'|'read'|'judge'|'mix'} o.qtype
     * @param {() => number} o.rng
     */
    constructor(o) {
      if (!MODES.includes(o.mode)) throw new Error('mode ' + o.mode);
      Object.assign(this, o);
      this.index = 0;
      this.current = null;
      this.log = [];
      this.lastKey = undefined;
      this.ended = false;
    }

    /** 本轮能出的题型（wrong 模式只算有待加强题目的题型）。 */
    types() {
      const avail = availableTypes(this.data);
      const want = this.qtype === 'mix' ? avail : avail.filter((t) => t === this.qtype);
      return this.mode === 'wrong' ? want.filter((t) => Prog.ruleWeakItems(this.progress, poolOf(this.data, t)).length > 0) : want;
    }
    pool(type) {
      const all = poolOf(this.data, type);
      return this.mode === 'wrong' ? Prog.ruleWeakItems(this.progress, all) : all;
    }

    /**
     * 出下一题；结束时返回 null。
     * @param {{type?: string, key?: string, ask?: string}} [force] 测试 / 截图用
     * @returns {{n:number, type:string, item:object, options?:object[], ask?:string}|null}
     */
    next(force) {
      if (this.ended) return null;
      const types = this.types();
      if (this.index >= this.length || !types.length) { this.ended = true; this.current = null; return null; }
      let type = force && force.type && types.includes(force.type) ? force.type : types[Math.floor(this.rng() * types.length)];
      const pool = this.pool(type);
      let item = force && force.key ? pool.find((x) => x.key === force.key) : null;
      if (!item) {
        const weight = this.mode === 'practice' ? () => 1 : (x) => 1 + Prog.ruleState(this.progress, x).score;
        item = Pick.pickWeighted(pool, weight, this.rng, this.lastKey);
      }
      const q = { type, item };
      if (type === 'read') {
        q.ask = force && force.ask ? force.ask : (this.rng() < 0.5 ? 'chars' : 'pinyin');
        q.options = Items.readOptions(this.data.words, item, q.ask, this.rng, this.cfg.options);
        if (!q.options) { q.type = 'translate'; q.ask = undefined; delete q.options; }
      }
      this.index++;
      this.lastKey = item.key;
      this.current = Object.assign({ n: this.index }, q);
      return this.current;
    }

    /**
     * 作答并写分。
     * @param {{cells?: number[][], key?: string, choice?: boolean}} answer translate: 各方（空方 []）；read: 选项的 key；judge: 选「是」(true) / 「否」(false)
     * @param {number} ms
     * @returns {{correct:boolean, type:string, item:object, judge?:object, explain?:object|null}}
     */
    answer(answer, ms) {
      const q = this.current;
      if (!q) throw new Error('no question');
      let correct;
      let judge = null;
      let explain = null;
      if (q.type === 'translate') {
        const cells = answer.cells || [];
        judge = Items.judgeCells(q.item.cells, cells);
        correct = judge.correct;
        if (!correct) explain = Items.explain(q.item.result, cells, this.translator);
      } else if (q.type === 'read') {
        const opt = q.options.find((o) => o.key === answer.key);
        correct = !!opt && opt.key === q.item.key;
        if (opt && !correct) explain = Items.explain(q.item.result, opt.word.cells, this.translator);
      } else {
        correct = answer.choice === q.item.answer;
        explain = { rules: q.item.rules.slice() };
      }
      Prog.recordRuleAnswer(this.progress, q.item, correct, this.cfg);
      this.log.push({ key: q.item.key, correct, ms: Math.max(0, ms) });
      this.current = null;
      return { correct, type: q.type, item: q.item, judge, explain };
    }

    summary() {
      const total = this.log.length;
      const correct = this.log.filter((x) => x.correct).length;
      const ms = this.log.reduce((s, x) => s + x.ms, 0);
      const wrongKeys = [...new Set(this.log.filter((x) => !x.correct).map((x) => x.key))];
      return { mode: this.mode, total, correct, acc: total ? correct / total : 0, totalSec: ms / 1000, avgSec: total ? ms / total / 1000 : 0, wrongKeys };
    }
  }

  return { MODES, TYPES, poolOf, availableTypes, RuleRound };
});
