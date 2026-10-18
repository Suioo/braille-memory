'use strict';
// 数据完整性：真实字表必须能无错误解析。不断言任何具体符号的点位。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseTable, categoriesOf } = require('../src/core/csv.js');

test('data/braille_table.csv parses without errors or duplicate patterns', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'data', 'braille_table.csv'), 'utf8');
  const res = parseTable(text);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
  assert.ok(res.rows.length > 0);
  assert.ok(categoriesOf(res.rows).length > 0);
});
