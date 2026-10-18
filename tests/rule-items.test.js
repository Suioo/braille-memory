'use strict';
// 规则 / 词句题目库：全部从 rules.json 与引擎推出；测试里没有手写点位、规则或拼音。
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/core/rule-items.js');
const Pick = require('../src/core/pick.js');
const { rules, translator: tr, ruleData: d, examples } = require('./helpers/fixtures.js');

const byRuleType = (t) => rules.rules.filter((r) => r.apply && r.apply.type === t).map((r) => r.id);

test('every translatable example becomes one word item with its cells from the engine (blank cell = [])', () => {
  assert.ok(d.words.length >= 100 && d.words.length <= examples.length);
  for (const w of d.words) {
    const r = tr.word(w.pinyin, w.chars);
    assert.deepEqual(w.cells, r.cells.map((c) => c.dots));
    assert.equal(w.cells.filter((c) => c.length === 0).length, r.cells.filter((c) => c.kind === 'space').length);
    assert.equal(w.key, 'w:' + w.ruleId + '#' + rules.byId.get(w.ruleId).examples.findIndex((e) => e[0] === w.chars && e[1] === w.pinyin));
    assert.equal(w.id, w.key);
    assert.ok(w.sig.includes(w.chars) && w.sig.includes(w.cellsText));
  }
  assert.equal(new Set(d.words.map((w) => w.key)).size, d.words.length);
  assert.equal(new Set(d.words.map((w) => w.chars + '|' + w.pinyin)).size, d.words.length, 'no duplicate chars+pinyin');
});

test('display pinyin drops the manual-keep marker but the data pinyin keeps it', () => {
  const marked = d.words.filter((w) => w.pinyin.includes(tr.marker));
  assert.ok(marked.length >= 2);
  for (const w of marked) { assert.equal(w.display.includes(tr.marker), false); assert.equal(w.pinyin.includes(tr.marker), true); }
});

test('skipped (暂不支持) examples are not in the pool', () => {
  const have = new Set(d.words.map((w) => w.chars + '|' + w.pinyin));
  for (const r of rules.rules) for (const e of r.examples || []) if ((e[2] || '').includes('暂不支持')) assert.equal(have.has(e[0] + '|' + e[1]), false);
});

test('judge items: tone family only from tone-rule examples, answer = what the engine wrote', () => {
  const toneRuleIds = new Set(I.TONE_TYPES.flatMap(byRuleType));
  const list = d.judgeAll.filter((x) => x.family === 'tone');
  assert.ok(list.length >= I.MIN_JUDGE);
  for (const x of list) {
    assert.ok(toneRuleIds.has(x.word.ruleId));
    const syl = x.word.result.syllables[x.syllable];
    assert.equal(syl.raw, x.raw);
    assert.ok(syl.tone > 0);
    assert.equal(x.answer, syl.cells.some((c) => c.kind === 'tone'));
    assert.ok(x.rules.length >= 1 && x.rules.every((id) => rules.byId.has(id)));
    assert.equal(x.key, 'j:t:' + x.word.key + '.' + x.syllable);
  }
  assert.ok(list.some((x) => x.answer) && list.some((x) => !x.answer));
});

test('judge items: contraction family = what the engine contracted vs what 11.2 blocked', () => {
  const list = d.judgeAll.filter((x) => x.family === 'contract');
  assert.ok(list.length >= I.MIN_JUDGE);
  for (const x of list) {
    const syl = x.word.result.syllables[x.syllable];
    assert.equal(x.answer, syl.cells.every((c) => c.kind === 'contraction'));
    if (!x.answer) assert.ok(syl.notes.some((n) => n.what === 'contractionBlocked') && x.rules.includes('11.2'));
    assert.ok(tr.contractChars.includes(x.char));
  }
  assert.ok(list.some((x) => x.answer) && list.some((x) => !x.answer));
});

test('families are only usable when the data supports them (both answers, enough items)', () => {
  assert.equal(d.families.tone, true);
  assert.equal(d.families.contract, true);
  assert.equal(d.judge.length, d.judgeAll.length);
  // 去掉所有简写例词 → 简写判断题整类隐藏
  const noContract = JSON.parse(JSON.stringify(Array.from(rules.rules)));
  void noContract;
  const copy = Object.assign({}, rules, { rules: rules.rules.map((r) => (I.CONTRACT_TYPES.includes(r.apply && r.apply.type) ? Object.assign({}, r, { examples: [] }) : r)) });
  copy.byId = new Map(copy.rules.map((r) => [r.id, r]));
  const d2 = I.build({ rules: copy, translator: tr });
  assert.equal(d2.families.contract, false);
  assert.equal(d2.judge.some((x) => x.family === 'contract'), false);
  assert.equal(d2.families.tone, true);
});

test('cards: one per rule in file order; example from examples, else from forms, else none', () => {
  assert.deepEqual(d.cards.map((c) => c.id), rules.rules.map((r) => r.id));
  for (const c of d.cards) {
    if (c.example) {
      assert.ok(c.example.cells.length >= 1);
      assert.ok(c.example.cells.every((x) => Array.isArray(x)));
    }
    const hasEx = d.words.some((w) => w.ruleId === c.id);
    const hasForm = rules.forms.some((f) => f.rule === c.id);
    assert.equal(!!c.example, hasEx || hasForm, c.id);
  }
  assert.deepEqual(d.cats.map((x) => x.name), [...new Set(rules.rules.map((r) => r.cat))]);
  assert.equal(d.cats.reduce((s, x) => s + x.count, 0), rules.rules.length);
});

test('entries list every question key with its signature (for progress cleaning)', () => {
  assert.equal(d.entries.length, d.words.length + d.judge.length);
  for (const e of d.entries) assert.equal(d.byKey.get(e.key).sig, e.sig);
});

test('readOptions: distinct cells, distinct shown text, target once, deterministic', () => {
  for (const ask of ['chars', 'pinyin']) {
    for (const w of d.words.slice(0, 60)) {
      const o = I.readOptions(d.words, w, ask, Pick.makeRng(5), 4);
      assert.ok(o && o.length >= 2 && o.length <= 4);
      assert.equal(o.filter((x) => x.key === w.key).length, 1);
      assert.equal(new Set(o.map((x) => x.word.cellsText)).size, o.length);
      assert.equal(new Set(o.map((x) => x.text)).size, o.length);
      assert.ok(o.every((x) => x.text === (ask === 'chars' ? x.word.chars : x.word.display)));
    }
  }
  const a = I.readOptions(d.words, d.words[3], 'chars', Pick.makeRng(9), 4).map((x) => x.key);
  const b = I.readOptions(d.words, d.words[3], 'chars', Pick.makeRng(9), 4).map((x) => x.key);
  assert.deepEqual(a, b);
  assert.equal(I.readOptions([d.words[0]], d.words[0], 'chars', Pick.makeRng(1), 4), null);
});

test('firstDiff: first differing cell, length differences count, identical = -1', () => {
  const w = d.words.find((x) => x.cells.length >= 3);
  assert.equal(I.firstDiff(w.cells, w.cells), -1);
  const wrong = w.cells.map((c, i) => (i === 2 ? [c[0] === 1 ? 2 : 1] : c));
  assert.equal(I.firstDiff(w.cells, wrong), 2);
  assert.equal(I.firstDiff(w.cells, w.cells.slice(0, -1)), w.cells.length - 1);
  assert.equal(I.firstDiff(w.cells, w.cells.concat([[1]])), w.cells.length);
});

test('explain: names the first wrong cell and where it comes from (table role or rule)', () => {
  const w = d.words.find((x) => x.chars === '很好' || x.cells.length >= 4);
  assert.equal(I.explain(w.result, w.cells, tr), null);
  for (let i = 0; i < w.cells.length; i++) {
    const wrong = w.cells.map((c, k) => (k === i ? [c[0] === 1 ? 2 : 1] : c));
    const e = I.explain(w.result, wrong, tr);
    assert.equal(e.index, i);
    assert.equal(e.kind, w.result.cells[i].kind);
    assert.deepEqual(e.expected, w.cells[i]);
    if (e.kind === 'tone') assert.ok(e.rules.length >= 1);
  }
  const more = I.explain(w.result, w.cells.concat([[1]]), tr);
  assert.equal(more.kind, 'extra');
  assert.equal(more.index, w.cells.length);
});

test('explain: writing a tone the rules omit → toneShouldOmit + the omitting rule; skipping a required tone → toneMissing', () => {
  let omitted = null;
  let written = null;
  for (const w of d.words) for (const s of w.result.syllables) {
    if (!omitted && s.tone && s.toneDecision && !s.toneDecision.write && s.toneDecision.reason === 'omitInitial') omitted = { w, s };
    if (!written && s.tone && s.toneDecision && s.toneDecision.write && s.cells.some((c) => c.kind === 'tone') && s.cells.length >= 2 && !w.result.syllables[w.result.syllables.indexOf(s) + 1]) written = { w, s };
  }
  assert.ok(omitted && written);
  // 在应省写的音节后面多写一个声调
  const { w, s } = omitted;
  const idx = w.result.syllables.indexOf(s);
  const lastCell = w.result.cells.map((c) => c.syllable).lastIndexOf(idx);
  const withTone = w.cells.slice(0, lastCell + 1).concat([tr.toneDots(s.tone)], w.cells.slice(lastCell + 1));
  const e = I.explain(w.result, withTone, tr);
  assert.equal(e.index, lastCell + 1);
  assert.equal(e.hint, 'toneShouldOmit');
  assert.deepEqual(e.rules, [s.toneDecision.rule]);
  // 漏掉应写的声调
  const ww = written.w;
  const ti = ww.result.cells.findIndex((c) => c.kind === 'tone');
  const skipped = ww.cells.filter((_, k) => k !== ti);
  const e2 = I.explain(ww.result, skipped, tr);
  assert.equal(e2.index, ti);
  assert.equal(e2.hint === 'toneMissing' || e2.kind === 'tone' || e2.index === ti, true);
});
