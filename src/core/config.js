/**
 * 可调参数：默认值 + 与 data/config.json 合并校验（纯函数）。
 * 渲染进程：window.BMConfig；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMConfig = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 默认参数（与 data/config.json 保持一致）。 */
  const DEFAULTS = Object.freeze({
    lessonSize: 5,
    options: 4,
    score: { min: 0, max: 8, right: -1, wrong: 2 },
    round: { lengths: [10, 20], defaultLength: 10 },
    timing: { autoNextMs: 900, autoNextMirrorMs: 1500, inputGuardMs: 150 },
    // 手柄震动（Gamepad API / 安卓原生）：时长 ms、强度 0..1。tick = 拖动经过一项 / 点位点亮；correct = 答对；wrong = 答错（两次）；
    // ramp = 连对 / 过关 / 破纪录（逐渐增强）；limits = tick 最小间隔、单个序列最长时长。数值的含义与范围见 src/core/haptics.js。
    haptics: {
      gamepad: {
        tick: { durationMs: 20, weak: 0.35, strong: 0 },
        correct: { durationMs: 60, weak: 0.3, strong: 0.25, trigger: 0.2 },
        wrong: { durationMs: 80, gapMs: 60, weak: 0.25, strong: 0.75 },
        ramp: { totalMs: 200, steps: 4, from: 0.2, to: 0.9, strongShare: 0.8 },
        dots: { rowMs: 85, gapMs: 35, strength: 0.85 }, // 点位节奏：一行一拍的时长 / 间隔 / 强度
        limits: { tickMinIntervalMs: 45, maxPatternMs: 700 },
      },
    },
    course: {
      cleanCorrect: 2,
      requeueGap: 2,
      testRepeats: 2,
      // 依次为 过关(1 星)、2 星、3 星：正确率 ≥ acc 且 平均用时 ≤ avgSec
      stars: [
        { acc: 0.8, avgSec: 12 },
        { acc: 0.9, avgSec: 9 },
        { acc: 1.0, avgSec: 6 },
      ],
    },
  });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  /**
   * 把用户配置合并到默认值上。类型不对的字段忽略并记入 errors。
   * @param {object|null} raw 解析后的 config.json
   * @returns {{config: object, errors: string[]}}
   */
  function mergeConfig(raw) {
    const config = clone(DEFAULTS);
    const errors = [];
    if (raw == null) return { config, errors };
    if (typeof raw !== 'object' || Array.isArray(raw)) return { config, errors: ['not-object'] };
    const walk = (dst, src, prefix) => {
      for (const [k, v] of Object.entries(src)) {
        const name = prefix + k;
        if (!(k in dst)) { errors.push('unknown:' + name); continue; }
        const d = dst[k];
        if (Array.isArray(d)) {
          if (!Array.isArray(v)) { errors.push('type:' + name); continue; }
          if (k === 'stars') {
            const ok = v.length === 3 && v.every((t) => t && isNum(t.acc) && isNum(t.avgSec));
            if (ok) dst[k] = v.map((t) => ({ acc: t.acc, avgSec: t.avgSec }));
            else errors.push('type:' + name);
          } else if (v.every(isNum) && v.length) dst[k] = v.slice();
          else errors.push('type:' + name);
        } else if (d && typeof d === 'object') {
          if (v && typeof v === 'object' && !Array.isArray(v)) walk(d, v, name + '.');
          else errors.push('type:' + name);
        } else if (isNum(d)) {
          if (isNum(v)) dst[k] = v; else errors.push('type:' + name);
        }
      }
    };
    walk(config, raw, '');
    if (config.lessonSize < 1) { config.lessonSize = DEFAULTS.lessonSize; errors.push('range:lessonSize'); }
    if (config.options < 2) { config.options = DEFAULTS.options; errors.push('range:options'); }
    if (config.score.min > config.score.max) { config.score = clone(DEFAULTS.score); errors.push('range:score'); }
    return { config, errors };
  }

  return { DEFAULTS, mergeConfig };
});
