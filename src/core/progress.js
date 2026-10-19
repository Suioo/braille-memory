/**
 * 进度数据模型与计分（纯函数；会就地修改传入的 progress 并返回它）。
 * 渲染进程：window.BMProgress；Node：require()。
 *
 * progress = {
 *   version: 4,           // 1 → 2 新增 ext（扩展符号）；2 → 3 新增 rules（规则 / 词句）；3 → 4 新增 texts（自定义文本）；读入旧版本时原有记录逐字段保留
 *   settings: { theme, seed, mirror, scope, roundLength, autoNext, timing, qtype, fx, haptics, padHaptics, padSwitchKeys, style },
 *   symbols: { [id]: { sig, score, right, wrong } },
 *   lessons: { [key]: { sig, stars, bestAcc, bestAvgSec, plays } },
 *   ext: { symbols: { [id]: { sig, score, right, wrong } } },  // 扩展符号（data/braille_extra.csv），sig = 符号|各方点位
 *   rules: { items: { [key]: { sig, score, right, wrong } } },  // 规则 / 词句题目（data/rules.json 的例词与判断题），key 见 rule-items.js
 *   texts: { items: { [key]: { sig, score, right, wrong, lastMs?, bestMs?, timed? } },   // 自定义文本的句子（文本本身存在 texts 存储里，不在这里），key = t:<文本id>#<句id>；*Ms = 开「计时」时记的用时
 *           runs: { [textId]: { recent: [{at, n, ok, cells, ms}], best: {at, cpm, acc}|null, bestAcc } } }   // 每篇文本的计时成绩：最近 10 次、最佳速度（正确率 ≥ 80%）、最高正确率
 * }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMProgress = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VERSION = 4;
  /** 可读入的最低存档版本（旧版本读入时迁移到 VERSION）。 */
  const MIN_VERSION = 1;
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
      padHaptics: true, // 手柄震动（只在检测到能震的手柄时才在设置里显示）
      padSwitchKeys: 'keycap', // Switch 手柄键位：'keycap' 按键帽字母（A 确认 B 返回）/ 'position' 按物理位置（下方 B 确认、右边 A 返回）；只在检测到 Switch 手柄时才显示
      style: STYLES[0],
    };
  }

  /** 新的空进度。 */
  function createProgress(cfg, settings) {
    return { version: VERSION, settings: Object.assign(defaultSettings(cfg), settings || {}), symbols: {}, lessons: {}, ext: { symbols: {} }, rules: { items: {} }, texts: { items: {}, runs: {} } };
  }

  /** 符号签名：符号或点位在 CSV 中被改动后，旧记录作废。 */
  const symSig = (row) => row.symbol + '|' + row.dotsText;

  /** 扩展符号签名：符号或各方点位在 braille_extra.csv 中被改动后，旧记录作废。 */
  const extSymSig = (row) => row.symbol + '|' + row.cellsText;

  const clampInt = (v, lo, hi, dflt) => (Number.isInteger(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

  /**
   * 清洗读入的存档：未知字段丢弃，签名不符的记录丢弃，数值夹紧。
   * @param {*} raw JSON 对象（可为 null）
   * @param {object[]} rows 字表
   * @param {object[]} plan 课程表（planLessons 的结果）
   * @param {object} cfg
   * @param {string[]} categories 类别名
   * @param {object[]} [extraRows] 扩展符号表；省略（undefined）= 扩展表不可用，已有扩展记录原样保留（只做形状校验），不会因此丢档
   * @param {{key:string, sig:string}[]} [ruleEntries] 规则 / 词句题目清单；省略 = 规则数据不可用，已有记录原样保留
   * @param {{key:string, sig:string}[]} [textEntries] 自定义文本的题目清单（文本库 + 引擎推出）；省略 = 不可用（没有引擎 / 文本库），已有记录原样保留
   */
  function normalizeProgress(raw, rows, plan, cfg, categories, extraRows, ruleEntries, textEntries) {
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
    if (typeof s.padHaptics === 'boolean') d.padHaptics = s.padHaptics;
    if (s.padSwitchKeys === 'keycap' || s.padSwitchKeys === 'position') d.padSwitchKeys = s.padSwitchKeys;
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
    const ext = raw.ext && typeof raw.ext === 'object' && raw.ext.symbols && typeof raw.ext.symbols === 'object' ? raw.ext.symbols : {};
    if (Array.isArray(extraRows)) {
      for (const row of extraRows) {
        const e = ext[row.id];
        if (!e || e.sig !== extSymSig(row)) continue;
        p.ext.symbols[row.id] = extEntry(e, cfg);
      }
    } else {
      for (const id of Object.keys(ext)) {
        const e = ext[id];
        if (/^[1-9]\d{0,8}$/.test(id) && e && typeof e === 'object' && typeof e.sig === 'string') p.ext.symbols[id] = extEntry(e, cfg);
      }
    }
    const rit = raw.rules && typeof raw.rules === 'object' && raw.rules.items && typeof raw.rules.items === 'object' ? raw.rules.items : {};
    if (Array.isArray(ruleEntries)) {
      for (const it of ruleEntries) {
        const e = rit[it.key];
        if (!e || e.sig !== it.sig) continue;
        p.rules.items[it.key] = extEntry(e, cfg);
      }
    } else {
      for (const key of Object.keys(rit)) {
        const e = rit[key];
        if (RULE_KEY.test(key) && e && typeof e === 'object' && typeof e.sig === 'string') p.rules.items[key] = extEntry(e, cfg);
      }
    }
    const tit = raw.texts && typeof raw.texts === 'object' && raw.texts.items && typeof raw.texts.items === 'object' ? raw.texts.items : {};
    if (Array.isArray(textEntries)) {
      for (const it of textEntries) {
        const e = tit[it.key];
        if (!e || e.sig !== it.sig) continue;
        p.texts.items[it.key] = textEntry(e, cfg);
      }
    } else {
      for (const key of Object.keys(tit)) {
        const e = tit[key];
        if (RULE_KEY.test(key) && e && typeof e === 'object' && typeof e.sig === 'string') p.texts.items[key] = textEntry(e, cfg);
      }
    }
    // 计时成绩：只做形状清洗（文本被改到暂时没有可练句子也不丢历史）；已不存在的文本由 pruneTextRuns 清理
    const runs = raw.texts && typeof raw.texts === 'object' && raw.texts.runs && typeof raw.texts.runs === 'object' ? raw.texts.runs : {};
    for (const id of Object.keys(runs)) {
      const r = TEXT_ID.test(id) ? normRuns(runs[id]) : null;
      if (r) p.texts.runs[id] = r;
    }
    return p;
  }

  /** 规则题目的 key 形状（规则数据不可用时用来过滤明显的垃圾）。 */
  const RULE_KEY = /^[a-z]:[0-9A-Za-z.#:_\-]{1,80}$/;

  function extEntry(e, cfg) {
    return {
      sig: e.sig,
      score: clampInt(e.score, cfg.score.min, cfg.score.max, 0),
      right: clampInt(e.right, 0, 1e9, 0),
      wrong: clampInt(e.wrong, 0, 1e9, 0),
    };
  }

  const TEXT_ID = /^t_[0-9a-z]{3,12}$/;
  /** 单句用时上限（30 分钟）：防止离开没点提交的长时间空转污染成绩。 */
  const MAX_SENTENCE_MS = 30 * 60 * 1000;
  const RUNS_KEEP = 10;
  /** 好成绩的正确率门槛：速度再快，错太多的不算最佳。 */
  const BEST_MIN_ACC = 0.8;
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const optMs = (v) => (Number.isInteger(v) && v >= 0 && v <= MAX_SENTENCE_MS ? v : undefined);
  function textEntry(e, cfg) {
    const o = extEntry(e, cfg);
    const last = optMs(e.lastMs);
    const best = optMs(e.bestMs);
    if (last !== undefined) o.lastMs = last;
    if (best !== undefined) o.bestMs = best;
    if (last !== undefined || best !== undefined) o.timed = clampInt(e.timed, 1, 1e9, 1);
    return o;
  }
  function normRun(r) {
    if (!isObj(r) || typeof r.at !== 'string') return null;
    const n = r.n;
    const cells = r.cells;
    const ms = r.ms;
    if (![n, cells, ms].every((v) => Number.isInteger(v) && v >= 1) || n > 1e6 || cells > 1e7 || ms > 1e10) return null;
    return { at: r.at.slice(0, 40), n, ok: clampInt(r.ok, 0, n, 0), cells, ms };
  }
  const runCpm = (r) => r.cells / (r.ms / 60000);
  const round1 = (x) => Math.round(x * 10) / 10;
  function normRuns(raw) {
    if (!isObj(raw)) return null;
    const recent = (Array.isArray(raw.recent) ? raw.recent : []).map(normRun).filter(Boolean).slice(-RUNS_KEEP);
    const b = raw.best;
    const best = isObj(b) && typeof b.at === 'string' && typeof b.cpm === 'number' && b.cpm > 0 && b.cpm < 1e6 && typeof b.acc === 'number' && b.acc >= BEST_MIN_ACC && b.acc <= 1
      ? { at: b.at.slice(0, 40), cpm: round1(b.cpm), acc: b.acc } : null;
    const bestAcc = typeof raw.bestAcc === 'number' && raw.bestAcc >= 0 && raw.bestAcc <= 1 ? raw.bestAcc : 0;
    if (!recent.length && !best && !bestAcc) return null;
    return { recent, best, bestAcc };
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

  // ---------- 扩展符号（与主表记录分开存放，计分规则相同） ----------
  function extState(progress, row) {
    return progress.ext.symbols[row.id] || { sig: extSymSig(row), score: 0, right: 0, wrong: 0 };
  }
  function ensureExt(progress, row) {
    if (!progress.ext.symbols[row.id]) progress.ext.symbols[row.id] = extState(progress, row);
    return progress.ext.symbols[row.id];
  }
  /** 扩展符号：记录一次作答（答对 score+right，答错 score+wrong）。 */
  function recordExtAnswer(progress, row, correct, cfg) {
    const e = ensureExt(progress, row);
    e.score = nextScore(e.score, correct, cfg);
    if (correct) e.right += 1; else e.wrong += 1;
    return e;
  }
  const extWeakRows = (progress, rows) => rows.filter((r) => extState(progress, r).score > 0);

  // ---------- 规则 / 词句（单独存放，计分规则相同；item = rule-items.js 的题目，带 key 与 sig） ----------
  function ruleState(progress, item) {
    return progress.rules.items[item.key] || { sig: item.sig, score: 0, right: 0, wrong: 0 };
  }
  function recordRuleAnswer(progress, item, correct, cfg) {
    if (!progress.rules.items[item.key]) progress.rules.items[item.key] = ruleState(progress, item);
    const e = progress.rules.items[item.key];
    e.sig = item.sig;
    e.score = nextScore(e.score, correct, cfg);
    if (correct) e.right += 1; else e.wrong += 1;
    return e;
  }
  const ruleWeakItems = (progress, items) => items.filter((it) => ruleState(progress, it).score > 0);

  // ---------- 自定义文本的句子（与其他记录分开；item 带 key 与 sig） ----------
  function textState(progress, item) {
    return progress.texts.items[item.key] || { sig: item.sig, score: 0, right: 0, wrong: 0 };
  }
  /** ms 只在开了「计时」时传：记最近一次与最快一次（只算答对的最快）。 */
  function recordTextAnswer(progress, item, correct, cfg, ms) {
    if (!progress.texts.items[item.key]) progress.texts.items[item.key] = textState(progress, item);
    const e = progress.texts.items[item.key];
    e.sig = item.sig;
    e.score = nextScore(e.score, correct, cfg);
    if (correct) e.right += 1; else e.wrong += 1;
    if (Number.isFinite(ms) && ms > 0) {
      const t = Math.min(MAX_SENTENCE_MS, Math.round(ms));
      e.lastMs = t;
      e.timed = (e.timed || 0) + 1;
      if (correct && (e.bestMs === undefined || t < e.bestMs)) e.bestMs = t;
    }
    return e;
  }
  /**
   * 记一次文本练习成绩（一轮里这篇文本的句子合计）。run = {at, n, ok, cells, ms}。
   * @returns {{run:object, newBest:boolean, newBestAcc:boolean}|null} 数据无效返回 null
   */
  function recordTextRun(progress, textId, run) {
    const r = normRun(run);
    if (!r || !TEXT_ID.test(textId)) return null;
    const cur = progress.texts.runs[textId] || { recent: [], best: null, bestAcc: 0 };
    const acc = r.ok / r.n;
    const cpm = round1(runCpm(r));
    const newBest = acc >= BEST_MIN_ACC && (!cur.best || cpm > cur.best.cpm);
    const newBestAcc = acc > cur.bestAcc;
    progress.texts.runs[textId] = {
      recent: cur.recent.concat([r]).slice(-RUNS_KEEP),
      best: newBest ? { at: r.at, cpm, acc } : cur.best,
      bestAcc: newBestAcc ? acc : cur.bestAcc,
    };
    return { run: r, newBest, newBestAcc };
  }
  const textRuns = (progress, textId) => progress.texts.runs[textId] || null;
  /** 丢掉已不在文本库里的文本的计时成绩（导入 / 撤销后调用）。 */
  function pruneTextRuns(progress, textIds) {
    for (const id of Object.keys(progress.texts.runs)) if (!textIds.has(id)) delete progress.texts.runs[id];
  }
  const textWeakItems = (progress, items) => items.filter((it) => textState(progress, it).score > 0);
  /** 删除一篇文本时一并删掉它的句子记录。 */
  function removeTextProgress(progress, textId) {
    const pre = 't:' + textId + '#';
    for (const k of Object.keys(progress.texts.items)) if (k.startsWith(pre)) delete progress.texts.items[k];
    delete progress.texts.runs[textId];
  }

  /** 清除进度：保留设置。 */
  function clearProgress(progress, cfg) {
    return createProgress(cfg, progress.settings);
  }

  return {
    VERSION, MIN_VERSION, THEMES, QTYPES, STYLES, SEED_NAMES, defaultSettings, createProgress, normalizeProgress, symSig, symState,
    nextScore, recordAnswer, recordTestMistake, isWeak, weakRows, recordLessonResult, clearProgress,
    extSymSig, extState, recordExtAnswer, extWeakRows, ruleState, recordRuleAnswer, ruleWeakItems,
    textState, recordTextAnswer, recordTextRun, textRuns, pruneTextRuns, textWeakItems, removeTextProgress, runCpm, MAX_SENTENCE_MS, RUNS_KEEP, BEST_MIN_ACC,
  };
});
