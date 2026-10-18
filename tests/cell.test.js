'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DOT_NUMBERS, dotPosition, judge } = require('../src/core/cell.js');

test('default layout: left column 1-2-3, right column 4-5-6', () => {
  assert.deepEqual(DOT_NUMBERS.map((n) => dotPosition(n, false).col), [1, 1, 1, 2, 2, 2]);
  assert.deepEqual(DOT_NUMBERS.map((n) => dotPosition(n, false).row), [1, 2, 3, 1, 2, 3]);
});

test('mirror swaps columns only, rows unchanged', () => {
  for (const n of DOT_NUMBERS) {
    const a = dotPosition(n, false);
    const b = dotPosition(n, true);
    assert.equal(b.row, a.row);
    assert.equal(b.col, 3 - a.col);
  }
});

test('dotPosition rejects numbers outside 1..6', () => {
  assert.throws(() => dotPosition(0, false), RangeError);
  assert.throws(() => dotPosition(7, false), RangeError);
});

test('judge splits hit / missed / extra', () => {
  const r = judge([1, 3, 5], [1, 2, 5]);
  assert.deepEqual(r, { hit: [1, 5], missed: [3], extra: [2], correct: false });
  assert.equal(judge([2, 4], [4, 2]).correct, true);
  assert.equal(judge([1], []).correct, false);
});

// 迷你预览与大方格共用的布局：用真实 CSV 行推出。
const { cellLayout } = require('../src/core/cell.js');
const { table } = require('./helpers/fixtures.js');

test('cellLayout: raised flags equal the CSV dots for every row', () => {
  for (const row of table) {
    const lay = cellLayout(row.dots, false);
    assert.deepEqual(lay.map((d) => d.n), DOT_NUMBERS);
    assert.deepEqual(lay.filter((d) => d.raised).map((d) => d.n), row.dots);
  }
});

test('cellLayout mirror: same raised dots, columns swapped, rows kept', () => {
  for (const row of table) {
    const a = cellLayout(row.dots, false);
    const b = cellLayout(row.dots, true);
    a.forEach((d, i) => {
      assert.equal(b[i].raised, d.raised);
      assert.equal(b[i].row, d.row);
      assert.equal(b[i].col, 3 - d.col);
    });
  }
});
