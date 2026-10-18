'use strict';
// 扩展符号表解析与真实数据校验。不断言任何具体符号的点位。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseCells, parseExtra, loadExtra } = require('../src/core/csv.js');
const { table, extra, extraRes } = require('./helpers/fixtures.js');

const HEAD = 'id,symbol,cells,source,category,note\n';

test('parseCells: splits cells, normalizes order, rejects bad input', () => {
  assert.deepEqual(parseCells('1').cells, [[1]]);
  assert.equal(parseCells('45 12').cellsText, '45 12');
  assert.deepEqual(parseCells('3  6').cells, [[3], [6]]);
  const unsorted = parseCells('21 3');
  assert.deepEqual(unsorted.cells, [[1, 2], [3]]);
  assert.equal(unsorted.cellsText, '12 3');
  assert.equal(unsorted.sorted, false);
  for (const bad of ['', '  ', null, undefined, '0', '7', '11', '1a', '1,2', '1234567']) assert.equal(parseCells(bad), null, String(bad));
});

test('parseExtra: valid rows, note optional, error codes carry line numbers', () => {
  const ok = parseExtra(HEAD + '1,甲,12 3,来源,类,说明\n2,乙,5,来源,类,\n');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.rows.length, 2);
  assert.deepEqual(ok.rows[0].cells, [[1, 2], [3]]);
  assert.equal(ok.rows[0].cellsText, '12 3');
  assert.equal(ok.rows[0].note, '说明');
  assert.equal('dots' in ok.rows[0], false);
  assert.deepEqual(parseExtra('id,symbol,cells,source,category\n1,甲,12,s,类\n').errors, []);
  const bad = parseExtra(HEAD + 'x,甲,1,s,类,\n1,,1,s,类,\n1,甲,1,s,,\n1,甲,19,s,类,\n1,甲,1,s,类,\n1,乙,2,s,类,\n');
  assert.deepEqual(bad.errors, ['bad-id@2', 'empty-symbol@3', 'empty-category@4', 'bad-cells@5', 'dup-id@7']);
  assert.deepEqual(parseExtra('id,symbol\n').errors, ['missing-column:cells', 'missing-column:source', 'missing-column:category']);
  assert.deepEqual(parseExtra('').errors, ['empty']);
  assert.deepEqual(parseExtra(HEAD + '1,甲,21,s,类,\n').warnings, ['unsorted-cells@2']);
});

test('loadExtra: missing file is not an error; id clash with the main table is', () => {
  assert.deepEqual(loadExtra(null, table), { ok: false, missing: true, rows: [], errors: [] });
  const clash = loadExtra(HEAD + table[0].id + ',甲,1,s,类,\n', table);
  assert.equal(clash.ok, false);
  assert.deepEqual(clash.errors, ['id-clash:' + table[0].id]);
  assert.equal(loadExtra(HEAD, table).ok, false);
  const fine = loadExtra(HEAD + '9999,甲,1,s,类,\n', table);
  assert.equal(fine.ok, true);
  assert.equal(fine.rows.length, 1);
});

test('data/braille_extra.csv parses cleanly and never clashes with the main table', () => {
  const text = fs.readFileSync(path.join(__dirname, '..', 'data', 'braille_extra.csv'), 'utf8');
  const res = parseExtra(text);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.warnings, []);
  assert.equal(extraRes.ok, true);
  assert.ok(extra.length > 0);
  const main = new Set(table.map((r) => r.id));
  assert.ok(extra.every((r) => !main.has(r.id)));
  assert.ok(extra.every((r) => r.cells.length >= 1 && r.cells.every((c) => c.length >= 1)));
});
