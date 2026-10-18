'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Seq = require('../src/core/seq.js');
const Cell = require('../src/core/cell.js');
const { extra, wrongDots } = require('./helpers/fixtures.js');

const multi = extra.filter((r) => r.cells.length >= 2);
const single = extra.filter((r) => r.cells.length === 1);

test('there are multi-cell and single-cell symbols to test with', () => {
  assert.ok(multi.length >= 2 && single.length >= 1);
});

test('judgeSeq: exact answer is correct for every symbol', () => {
  for (const r of extra) {
    const j = Seq.judgeSeq(r.cells, r.cells.map((c) => c.slice().reverse()));
    assert.equal(j.correct, true, r.symbol);
    assert.equal(j.firstWrong, -1);
    assert.equal(j.cells.length, r.cells.length);
  }
});

test('judgeSeq: reports which cell is wrong and how', () => {
  const r = multi[0];
  for (let i = 0; i < r.cells.length; i++) {
    const ans = r.cells.map((c, k) => (k === i ? wrongDots({ dots: c }) : c));
    const j = Seq.judgeSeq(r.cells, ans);
    assert.equal(j.correct, false);
    assert.equal(j.firstWrong, i);
    assert.equal(j.cells[i].correct, false);
    assert.deepEqual(j.cells[i], Cell.judge(r.cells[i], ans[i]));
    assert.ok(j.cells.every((x, k) => k === i || x.correct));
  }
});

test('judgeSeq: too few / too many cells are wrong; cell order matters', () => {
  const r = multi.find((x) => x.cells.length >= 2 && x.cells[0].join('') !== x.cells[1].join('')) || multi[0];
  const short = Seq.judgeSeq(r.cells, r.cells.slice(0, -1));
  assert.equal(short.correct, false);
  assert.equal(short.missingCells, 1);
  assert.equal(short.firstWrong, r.cells.length - 1);
  assert.equal(Seq.judgeSeq(r.cells, []).correct, false);
  assert.equal(Seq.judgeSeq(r.cells, undefined).missingCells, r.cells.length);
  const long = Seq.judgeSeq(r.cells, r.cells.concat([r.cells[0]]));
  assert.equal(long.correct, false);
  assert.equal(long.extraCells, 1);
  assert.equal(long.firstWrong, r.cells.length);
  assert.ok(long.cells.every((x) => x.correct));
  const swapped = Seq.judgeSeq(r.cells, r.cells.slice().reverse());
  assert.equal(swapped.correct, r.cells.every((c, i) => c.join('') === r.cells[r.cells.length - 1 - i].join('')));
});

test('displayOrder: reading = left to right; mirror = whole string right to left (first cell rightmost)', () => {
  assert.deepEqual(Seq.displayOrder(3, false), [0, 1, 2]);
  assert.deepEqual(Seq.displayOrder(3, true), [2, 1, 0]);
  assert.deepEqual(Seq.displayOrder(1, true), [0]);
  assert.deepEqual(Seq.displayOrder(0, true), []);
});

test('seqLayout: mirror reverses the cell order AND swaps columns inside each cell', () => {
  const r = multi[0];
  const read = Seq.seqLayout(r.cells, false);
  const mir = Seq.seqLayout(r.cells, true);
  assert.deepEqual(read.map((x) => x.index), r.cells.map((_, i) => i));
  assert.deepEqual(mir.map((x) => x.index), r.cells.map((_, i) => r.cells.length - 1 - i));
  for (const x of read) assert.deepEqual(x.layout, Cell.cellLayout(r.cells[x.index], false));
  for (const x of mir) assert.deepEqual(x.layout, Cell.cellLayout(r.cells[x.index], true));
  // 同一点位编号，镜像后列互换
  assert.notDeepEqual(read[0].layout, Seq.seqLayout(r.cells, true).find((x) => x.index === 0).layout);
});
