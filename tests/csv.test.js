'use strict';
// 字表解析单元测试。夹具中的符号均为虚构（甲/乙/丙），不对应任何真实盲文符号。
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, parseTable, categoriesOf } = require('../src/core/csv.js');

const HEADER = 'id,symbol,dots,source,category';
const fixture = (...lines) => [HEADER, ...lines].join('\r\n') + '\r\n';

test('parseCsv handles quotes, escaped quotes, CRLF and BOM', () => {
  const rows = parseCsv('﻿a,"b,c","d""e"\r\nf,g,h\n');
  assert.deepEqual(rows, [['a', 'b,c', 'd"e'], ['f', 'g', 'h']]);
});

test('parseTable returns rows with sorted numeric dots', () => {
  const res = parseTable(fixture('1,甲,31,src,类A', '2,"乙、丙",6,src,类B'));
  assert.deepEqual(res.errors, []);
  assert.equal(res.rows.length, 2);
  assert.deepEqual(res.rows[0].dots, [1, 3]);
  assert.equal(res.rows[0].dotsText, '13');
  assert.equal(res.rows[1].symbol, '乙、丙');
});

test('parseTable rejects bad dots, duplicate ids and missing columns', () => {
  assert.match(parseTable(fixture('1,甲,17,s,c')).errors[0], /^bad-dots/);
  assert.match(parseTable(fixture('1,甲,11,s,c')).errors[0], /^bad-dots/);
  assert.match(parseTable(fixture('1,甲,1,s,c', '1,乙,2,s,c')).errors[0], /^dup-id/);
  assert.match(parseTable('id,symbol,dots\n1,甲,1\n').errors[0], /^missing-column/);
});

test('parseTable warns on duplicate dot patterns', () => {
  const res = parseTable(fixture('1,甲,12,s,c', '2,乙,21,s,c'));
  assert.equal(res.rows.length, 2);
  assert.equal(res.warnings.length, 1);
});

test('categoriesOf keeps first-appearance order with counts', () => {
  const rows = parseTable(fixture('1,甲,1,s,类B', '2,乙,2,s,类A', '3,丙,3,s,类B')).rows;
  assert.deepEqual(categoriesOf(rows), [{ name: '类B', count: 2 }, { name: '类A', count: 1 }]);
});
