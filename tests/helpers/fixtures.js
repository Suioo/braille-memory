'use strict';
// 测试夹具：一律从真实 data/braille_table.csv 推出，不手写任何点位。
const fs = require('node:fs');
const path = require('node:path');
const { parseTable, categoriesOf } = require('../../src/core/csv.js');
const { DEFAULTS, mergeConfig } = require('../../src/core/config.js');
const { planLessons } = require('../../src/core/course.js');
const { loadExtra } = require('../../src/core/csv.js');
const Ext = require('../../src/core/ext.js');
const Rules = require('../../src/core/rules.js');
const Pinyin = require('../../src/core/pinyin.js');
const Translate = require('../../src/core/translate.js');
const RuleItems = require('../../src/core/rule-items.js');

const ROOT = path.join(__dirname, '..', '..');
const table = parseTable(fs.readFileSync(path.join(ROOT, 'data', 'braille_table.csv'), 'utf8')).rows;
const cats = categoriesOf(table);
const cfg = () => mergeConfig(JSON.parse(JSON.stringify(DEFAULTS))).config;
const rowsById = new Map(table.map((r) => [r.id, r]));
/** 扩展符号表（data/braille_extra.csv）及其分组。 */
const extraRes = loadExtra(fs.readFileSync(path.join(ROOT, 'data', 'braille_extra.csv'), 'utf8'), table);
const extra = extraRes.rows;
const ext = Ext.build(extra);
const plan = planLessons(table, DEFAULTS.lessonSize);
/** 与正确点位不同的一个作答（去掉第一个点；单点符号则换成另一个点）。 */
function wrongDots(row) {
  if (row.dots.length > 1) return row.dots.slice(1);
  return [row.dots[0] === 1 ? 2 : 1];
}
/** 规则数据、拼音还原表与翻盲文引擎（都读 data/ 下的真实文件）。 */
const rulesText = fs.readFileSync(path.join(ROOT, 'data', 'rules.json'), 'utf8');
const mapText = fs.readFileSync(path.join(ROOT, 'data', 'pinyin_map.json'), 'utf8');
const rules = Rules.parseRules(rulesText);
const pmap = Pinyin.loadMap(mapText).map;
const translator = Translate.createTranslator({ table, extra, rules, map: pmap });
/** 全部带汉字的例词（跳过说明里写「暂不支持」的）：{rule, chars, pinyin, note}。 */
const examples = rules.rules.flatMap((r) => (r.examples || []).filter((e) => !(e[2] || '').includes(Rules.UNSUPPORTED_MARK))
  .map((e) => ({ rule: r.id, chars: e[0], pinyin: e[1], note: e[2] || '' })));
const ruleData = RuleItems.build({ rules, translator });
/**
 * 测试用拼音提供者：词典全部来自 rules.json 的例词（汉字 → 拼音，跳过带空格 / 声调标记 / 撇号的），最长匹配分词；
 * 词典里没有的汉字抛错（模拟「提供者给不出拼音」）。它只给拼音与分词，不碰盲文。
 */
const dict = new Map();
for (const e of examples) {
  if (/[\s'!]/.test(e.pinyin) || !/^[\u3400-\u9fff]+$/.test(e.chars) || dict.has(e.chars)) continue;
  dict.set(e.chars, e.pinyin);
}
const dictProvider = {
  segment(run) {
    const a = Array.from(run);
    const out = [];
    for (let i = 0; i < a.length;) {
      let hit = null;
      for (let n = Math.min(6, a.length - i); n >= 1 && !hit; n--) { const w = a.slice(i, i + n).join(''); if (dict.has(w)) hit = w; }
      if (!hit) throw new Error('no pinyin for ' + a[i]);
      out.push({ chars: hit, pinyin: dict.get(hit) });
      i += Array.from(hit).length;
    }
    return out;
  },
};
module.exports = { ROOT, table, cats, cfg, rowsById, plan, wrongDots, extraRes, extra, ext, rulesText, mapText, rules, pmap, translator, examples, ruleData, dict, dictProvider };
