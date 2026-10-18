'use strict';
// 测试夹具：一律从真实 data/braille_table.csv 推出，不手写任何点位。
const fs = require('node:fs');
const path = require('node:path');
const { parseTable, categoriesOf } = require('../../src/core/csv.js');
const { DEFAULTS, mergeConfig } = require('../../src/core/config.js');
const { planLessons } = require('../../src/core/course.js');

const ROOT = path.join(__dirname, '..', '..');
const table = parseTable(fs.readFileSync(path.join(ROOT, 'data', 'braille_table.csv'), 'utf8')).rows;
const cats = categoriesOf(table);
const cfg = () => mergeConfig(JSON.parse(JSON.stringify(DEFAULTS))).config;
const rowsById = new Map(table.map((r) => [r.id, r]));
const plan = planLessons(table, DEFAULTS.lessonSize);
/** 与正确点位不同的一个作答（去掉第一个点；单点符号则换成另一个点）。 */
function wrongDots(row) {
  if (row.dots.length > 1) return row.dots.slice(1);
  return [row.dots[0] === 1 ? 2 : 1];
}
module.exports = { ROOT, table, cats, cfg, rowsById, plan, wrongDots };
