'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Ext = require('../src/core/ext.js');
const Pick = require('../src/core/pick.js');
const { extra, ext, table } = require('./helpers/fixtures.js');

test('build: categories keep file order and counts; ids indexed', () => {
  assert.deepEqual(ext.cats.map((c) => c.name), [...new Set(extra.map((r) => r.category))]);
  assert.equal(ext.cats.reduce((s, c) => s + c.count, 0), extra.length);
  assert.equal(ext.byId.size, extra.length);
});

test('ambiguity groups = same category AND same cells (derived from data, not hand-written)', () => {
  assert.ok(ext.groups.length > 0, 'the data has paired symbols with identical cells');
  for (const g of ext.groups) {
    assert.ok(g.ids.length >= 2);
    const rows = g.ids.map((id) => ext.byId.get(id));
    assert.ok(rows.every((r) => r.category === g.category && r.cellsText === g.cellsText));
  }
  const expected = new Set();
  for (const a of extra) for (const b of extra) if (a.id !== b.id && a.category === b.category && a.cellsText === b.cellsText) { expected.add(a.id); expected.add(b.id); }
  assert.deepEqual([...ext.ambiguous].sort((x, y) => x - y), [...expected].sort((x, y) => x - y));
  for (const r of extra) assert.equal(Ext.canChooseSymbol(ext, r), !expected.has(r.id));
});

test('the same cells in DIFFERENT categories are not ambiguous (category is always shown)', () => {
  const byCells = new Map();
  for (const r of extra) { const k = r.cellsText; (byCells.get(k) || byCells.set(k, []).get(k)).push(r); }
  const cross = [...byCells.values()].filter((v) => new Set(v.map((r) => r.category)).size > 1);
  for (const v of cross) for (const r of v) {
    const sameCat = v.filter((x) => x.category === r.category);
    assert.equal(ext.ambiguous.has(r.id), sameCat.length > 1);
  }
});

for (const [name, fn, who] of [['chooseCells', Ext.chooseCells, () => true], ['chooseSymbol', Ext.chooseSymbol, (r) => Ext.canChooseSymbol(ext, r)]]) {
  test(name + ': options stay in the target category, have distinct cells, include the target once', () => {
    let made = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const rng = Pick.makeRng(seed);
      for (const target of extra.filter(who)) {
        const opts = fn(ext, target, rng, 4);
        if (!opts) continue;
        made++;
        assert.ok(opts.length >= 2 && opts.length <= 4);
        assert.equal(opts.filter((o) => o.id === target.id).length, 1);
        assert.ok(opts.every((o) => o.category === target.category), 'single category');
        assert.equal(new Set(opts.map((o) => o.cellsText)).size, opts.length, 'distinct cells');
        assert.equal(opts.filter((o) => o.cellsText === target.cellsText).length, 1);
        if (name === 'chooseSymbol') assert.ok(opts.every((o) => Ext.canChooseSymbol(ext, o)), 'no ambiguous symbol in options');
        assert.ok(opts.every((o) => !table.some((m) => m.id === o.id)), 'never from the main table');
      }
    }
    assert.ok(made > 0);
  });

  test(name + ': deterministic for a fixed seed and puts the target in varying positions', () => {
    const t = extra.find(who);
    const a = fn(ext, t, Pick.makeRng(7), 4).map((o) => o.id);
    const b = fn(ext, t, Pick.makeRng(7), 4).map((o) => o.id);
    assert.deepEqual(a, b);
    const pos = new Set();
    for (let s = 1; s < 40; s++) pos.add(fn(ext, t, Pick.makeRng(s), 4).findIndex((o) => o.id === t.id));
    assert.ok(pos.size > 1);
  });
}

test('chooseSymbol: ambiguous symbols are never targets; chooseCells accepts them', () => {
  const rng = Pick.makeRng(3);
  for (const id of ext.ambiguous) {
    const r = ext.byId.get(id);
    assert.equal(Ext.chooseSymbol(ext, r, rng, 4), null);
    const opts = Ext.chooseCells(ext, r, rng, 4);
    assert.ok(opts && opts.filter((o) => o.cellsText === r.cellsText).length === 1);
  }
});

test('too few candidates → null (a category of one cannot make a choice question)', () => {
  const one = Ext.build([{ id: 1, category: 'x', cellsText: '1', symbol: 'a' }]);
  assert.equal(Ext.chooseCells(one, one.rows[0], Pick.makeRng(1), 4), null);
  assert.equal(Ext.chooseSymbol(one, one.rows[0], Pick.makeRng(1), 4), null);
});
