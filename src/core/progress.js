/**
 * 进度数据模型与计分（纯函数；会就地修改传入的 progress 并返回它）。
 * 渲染进程：window.BMProgress；Node：require()。
 *
 * progress = {
 *   version: 1,
 *   settings: { theme, seed, mirror, scope, roundLength, autoNext, timing, qtype, fx, haptics, style },
 *   symbols: { [id]: { sig, score, right, wrong } },
 *   lessons: { [key]: { sig, stars, bestAcc, bestAvgSec, plays } }
 * }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMProgress = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 1;
  const THEMES = ['system', 'light', 'dark'];
  const QTYPES = ['dots', 'choose', 'mix'];
  /** 视觉风格：material（默认）/ glass（玻璃）。旧存档没有该键 → material。 */
  const STYLES = ['material', 'glass'];
  /** 配色种子名（色值在 palette.js）。 */
  const SEED_NAMES = ['teal', 'indigo', 'green', 'terracotta'];

  /** @param {object} cfg 合并后的配置 */
  function defaultSettings(cfg) {
    return {
      theme: 'system',
      seed: SEED_NAMES[0],
      mirror: false,
      scope: 'all',
      roundLength: cfg.round.defaultLength,
      autoNext: true,
      timing: true,
      qtype: 'mix',
      fx: true,
      haptics: true,
      style: STYLES[0],
    };
  }

  /** 新的空进度。 */
  function createProgress(cfg, settings) {
    return { version: VERSION, settings: Object.assign(defaultSettings(cfg), settings || {}), symbols: {}, lessons: {} };
  }

  /** 符号签名：符号或点位在 CSV 中被改动后，旧记录作废。 */
  const symSig = (row) => row.symbol + '|' + row.dotsText;

  const clampInt = (v, lo, hi, dflt) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

  /**
   * 清洗读入的存档：未知字段丢弃，签名不符的记录丢弃，数值夹紧。
   * @param {*} raw JSON 对象（可为 null）
   * @param {object[]} rows 字表
   * @param {object[]} plan 课程表（planLessons 的结果）
   * @param {object} cfg
   * @param {string[]} categories 类别名
   */
  function normalizeProgress(raw, rows, plan, cfg, categories) {
    const p = createProgress(cfg);
    if (!raw || typeof raw !== 'object') return p;
    const s = raw.settings || {};
    const d = p.settings;
    if (THEMES.includes(s.theme)) d.theme = s.theme;
    if (SEED_NAMES.includes(s.seed)) d.seed = s.seed;
    if (typeof s.mirror === 'boolean') d.mirror = s.mirror;
    if (s.scope === 'all' || (categories || []).includes(s.scope)) d.scope = s.scope;
    if (cfg.round.lengths.includes(s.roundLength)) d.roundLength = s.roundLength;
    if (typeof s.autoNext === 'boolean') d.autoNext = s.autoNext;
    if (typeof s.timing === 'boolean') d.timing = s.timing;
    if (QTYPES.includes(s.qtype)) d.qtype = s.qtype;
    if (typeof s.fx === 'boolean') d.fx = s.fx;
    if (typeof s.haptics === 'boolean') d.haptics = s.haptics;
    if (STYLES.includes(s.style)) d.style = s.style;

    const syms = raw.symbols && typeof raw.symbols === 'object' ? raw.symbols : {};
    for (const row of rows) {
      const e = syms[row.id];
      if (!e || e.sig !== symSig(row)) continue;
      p.symbols[row.id] = {
        sig: e.sig,
        score: clampInt(e.score, cfg.score.min, cfg.score.max, 0),
        right: clampInt(e.right, 0, 1e9, 0),
        wrong: clampInt(e.wrong, 0, 1e9, 0),
      };
    }
    const les = raw.lessons && typeof raw.lessons === 'object' ? raw.lessons : {};
    for (const lesson of plan) {
      const e = les[lesson.key];
      if (!e || e.sig !== lesson.sig) continue;
      p.lessons[lesson.key] = {
        sig: e.sig,
        stars: clampInt(e.stars, 0, 3, 0),
        bestAcc: typeof e.bestAcc === 'number' && e.bestAcc >= 0 && e.bestAcc <= 1 ? e.bestAcc : 0,
        bestAvgSec: typeof e.bestAvgSec === 'number' && e.bestAvgSec >= 0 ? e.bestAvgSec : null,
        plays: clampInt(e.plays, 0, 1e9, 0),
      };
    }
    return p;
  }

  /** 读取（不存在则视为全 0）。 */
  function symState(progress, row) {
    return progress.symbols[row.id] || { sig: symSig(row), score: 0, right: 0, wrong: 0 };
  }
  function ensure(progress, row) {
    if (!progress.symbols[row.id]) progress.symbols[row.id] = symState(progress, row);
    return progress.symbols[row.id];
  }

  /**
   * 计分规则：答对 score+right（下限 min），答错 score+wrong（上限 max）。
   * @returns {number} 新分数
   */
  function nextScore(score, correct, cfg) {
    const v = score + (correct ? cfg.score.right : cfg.score.wrong);
    return Math.min(cfg.score.max, Math.max(cfg.score.min, v));
  }

  /** 练习/复习/错题：记录一次作答。 */
  function recordAnswer(progress, row, correct, cfg) {
    const e = ensure(progress, row);
    e.score = nextScore(e.score, correct, cfg);
    if (correct) e.right += 1; else e.wrong += 1;
    return e;
  }

  /** 闯关测验只记错：wrong+1，score 按答错规则加（上限 max）。答对不写。 */
  function recordTestMistake(progress, row, cfg) {
    const e = ensure(progress, row);
    e.wrong += 1;
    e.score = nextScore(e.score, false, cfg);
    return e;
  }

  /** 待加强：score > 0。 */
  const isWeak = (progress, row) => symState(progress, row).score > 0;
  const weakRows = (progress, rows) => rows.filter((r) => isWeak(progress, r));

  /**
   * 写入一次闯关结果：星只升不降，最佳正确率取高，最佳均时取低。
   * @param {{key:string, sig:string}} lesson
   * @param {{stars:number, acc:number, avgSec:number|null}} result
   * @returns {{entry: object, improved: boolean}}
   */
  function recordLessonResult(progress, lesson, result) {
    const old = progress.lessons[lesson.key] || { sig: lesson.sig, stars: 0, bestAcc: 0, bestAvgSec: null, plays: 0 };
    const entry = {
      sig: lesson.sig,
      stars: Math.max(old.stars, result.stars),
      bestAcc: Math.max(old.bestAcc, result.acc),
      bestAvgSec: result.avgSec == null ? old.bestAvgSec
        : old.bestAvgSec == null ? result.avgSec : Math.min(old.bestAvgSec, result.avgSec),
      plays: old.plays + 1,
    };
    progress.lessons[lesson.key] = entry;
    return { entry, improved: entry.stars > old.stars };
  }

  /** 清除进度：保留设置。 */
  function clearProgress(progress, cfg) {
    return createProgress(cfg, progress.settings);
  }

  return {
    VERSION, THEMES, QTYPES, STYLES, SEED_NAMES, defaultSettings, createProgress, normalizeProgress, symSig, symState,
    nextScore, recordAnswer, recordTestMistake, isWeak, weakRows, recordLessonResult, clearProgress,
  };
});
