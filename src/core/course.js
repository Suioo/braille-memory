/**
 * 分课闯关：课程表、解锁、评星、单课流程（学 → 练 → 测）。
 * 渲染进程：window.BMCourse；Node：require()。依赖 BMCell / BMPick。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./cell.js'), require('./pick.js'));
  } else root.BMCourse = factory(root.BMCell, root.BMPick);
})(typeof self !== 'undefined' ? self : this, function (Cell, Pick) {
  'use strict';

  /**
   * 按 CSV 类别（首次出现顺序）与行序分课：每类 L = ceil(c/size) 课，均分，
   * 余数给前面的课（各课相差不超过 1）。
   * @param {{id:number, category:string}[]} rows
   * @param {number} size 每课上限
   * @returns {{key:string, category:string, number:number, index:number, ids:number[], sig:string}[]}
   */
  function planLessons(rows, size) {
    const byCat = new Map();
    for (const r of rows) {
      if (!byCat.has(r.category)) byCat.set(r.category, []);
      byCat.get(r.category).push(r.id);
    }
    const plan = [];
    for (const [category, ids] of byCat) {
      const L = Math.ceil(ids.length / size);
      const base = Math.floor(ids.length / L);
      const rem = ids.length % L;
      let at = 0;
      for (let k = 0; k < L; k++) {
        const n = base + (k < rem ? 1 : 0);
        const part = ids.slice(at, at + n);
        at += n;
        plan.push({ key: category + '#' + (k + 1), category, number: k + 1, index: plan.length, ids: part, sig: part.join(',') });
      }
    }
    return plan;
  }

  /**
   * 每课状态：顺序解锁（第一课总是解锁；前一课 ≥1 星则解锁）。
   * @returns {{lesson:object, stars:number, unlocked:boolean, passed:boolean}[]}
   */
  function lessonStatus(plan, progress) {
    const out = [];
    for (let i = 0; i < plan.length; i++) {
      const e = progress.lessons[plan[i].key];
      const stars = e ? e.stars : 0;
      const unlocked = i === 0 || out[i - 1].passed;
      out.push({ lesson: plan[i], stars, unlocked, passed: stars >= 1 });
    }
    return out;
  }

  /**
   * 评星：依次检查阈值（过关 / 2 星 / 3 星），连续满足几档就几星；0 = 未过关。
   * timing=false 时只看正确率。
   * @param {number} acc 0..1
   * @param {number|null} avgSec
   * @param {{acc:number, avgSec:number}[]} thresholds
   * @param {boolean} timing
   */
  function starsFor(acc, avgSec, thresholds, timing) {
    let stars = 0;
    for (const t of thresholds) {
      const accOk = acc + 1e-9 >= t.acc;
      const timeOk = !timing || (avgSec != null && avgSec <= t.avgSec + 1e-9);
      if (accOk && timeOk) stars++; else break;
    }
    return stars;
  }

  /**
   * 单课流程状态机。不读写存档：测验答错时由调用方写 recordTestMistake。
   * phase: 'learn' → 'practice' → 'test' → 'done'
   */
  class LessonSession {
    /**
     * @param {object} lesson planLessons 的一项
     * @param {Map<number, object>} rowsById
     * @param {object} cfg 合并后的配置
     * @param {() => number} rng
     */
    constructor(lesson, rowsById, cfg, rng) {
      this.lesson = lesson;
      this.rows = lesson.ids.map((id) => rowsById.get(id));
      this.cfg = cfg;
      this.rng = rng;
      this.phase = 'learn';
      this.learnIndex = 0;
      this.clean = new Map(this.rows.map((r) => [r.id, 0]));
      this.queue = this.rows.slice();
      this.hinted = false;
      this.testItems = [];
      this.testIndex = 0;
      this.testLog = [];
    }

    /** 学习阶段当前卡片。 */
    get learnRow() { return this.phase === 'learn' ? this.rows[this.learnIndex] : null; }

    /** 学习阶段前后移动；越过最后一张进入练习。 */
    learnMove(delta) {
      if (this.phase !== 'learn') return;
      const i = this.learnIndex + delta;
      if (i < 0) return;
      if (i >= this.rows.length) { this.phase = 'practice'; return; }
      this.learnIndex = i;
    }

    /** 练习阶段当前题目的符号。 */
    get practiceRow() { return this.phase === 'practice' ? this.queue[0] : null; }

    /** 练习阶段每个符号已干净答对的次数。 */
    cleanCount(id) { return this.clean.get(id) || 0; }

    /** 练习阶段使用提示：本题即使答对也不算干净答对。 */
    useHint() { if (this.phase === 'practice') this.hinted = true; }

    /**
     * 练习阶段作答。
     * 答对且未提示：干净次数 +1，达到要求则移出队列，否则排到队尾。
     * 答错：干净次数清零，隔 requeueGap 个再出现；调用方应先显示该符号的学习卡。
     * @param {number[]} selected
     * @returns {{correct:boolean, judge:object, showCard:boolean, row:object}}
     */
    answerPractice(selected) {
      if (this.phase !== 'practice') throw new Error('not in practice');
      const row = this.queue.shift();
      const j = Cell.judge(row.dots, selected);
      const need = this.cfg.course.cleanCorrect;
      if (j.correct) {
        if (!this.hinted) this.clean.set(row.id, this.cleanCount(row.id) + 1);
        if (this.cleanCount(row.id) < need) this.queue.push(row);
      } else {
        this.clean.set(row.id, 0);
        this.queue.splice(Math.min(this.cfg.course.requeueGap, this.queue.length), 0, row);
      }
      this.hinted = false;
      if (this.queue.length === 0) this.startTest();
      return { correct: j.correct, judge: j, showCard: !j.correct, row };
    }

    /** 进入测验：每符号 testRepeats 次，打乱且尽量不相邻。 */
    startTest() {
      const items = [];
      for (let k = 0; k < this.cfg.course.testRepeats; k++) items.push(...this.rows);
      this.testItems = Pick.shuffleNoAdjacent(items, this.rng);
      this.testIndex = 0;
      this.testLog = [];
      this.phase = 'test';
    }

    /** 测验当前题。 */
    get testRow() { return this.phase === 'test' ? this.testItems[this.testIndex] : null; }

    /**
     * 测验作答。
     * @param {number[]} selected
     * @param {number} ms 本题用时（不含揭晓等待与暂停）
     * @returns {{correct:boolean, judge:object, row:object}}
     */
    answerTest(selected, ms) {
      if (this.phase !== 'test') throw new Error('not in test');
      const row = this.testItems[this.testIndex];
      const j = Cell.judge(row.dots, selected);
      this.testLog.push({ id: row.id, correct: j.correct, ms: Math.max(0, ms) });
      this.testIndex++;
      if (this.testIndex >= this.testItems.length) this.phase = 'done';
      return { correct: j.correct, judge: j, row };
    }

    /**
     * 测验结果。
     * @param {boolean} timing 是否计时
     * @returns {{total:number, correct:number, acc:number, avgSec:number|null, stars:number, wrongIds:number[]}}
     */
    result(timing) {
      const total = this.testLog.length;
      const correct = this.testLog.filter((x) => x.correct).length;
      const acc = total ? correct / total : 0;
      const avgSec = timing && total ? this.testLog.reduce((s, x) => s + x.ms, 0) / total / 1000 : null;
      const stars = starsFor(acc, avgSec, this.cfg.course.stars, timing);
      const wrongIds = [...new Set(this.testLog.filter((x) => !x.correct).map((x) => x.id))];
      return { total, correct, acc, avgSec, stars, wrongIds };
    }
  }

  return { planLessons, lessonStatus, starsFor, LessonSession };
});
