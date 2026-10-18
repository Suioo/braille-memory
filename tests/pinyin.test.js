'use strict';
// 拼音解析：一切拼音知识来自 pinyin_map.json；测试只用 rules.json 的例词与还原表本身。
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/core/pinyin.js');
const { mapText, pmap, rules, translator, examples } = require('./helpers/fixtures.js');

const marker = translator.marker;
const py = P.createPinyin(pmap, translator.finalNames, { marker });
const syl = (text, chars) => { const r = py.parse(text, { chars }); assert.equal(r.ok, true, text + ' ' + JSON.stringify(r)); return r.words.map((w) => w.syllables); };

test('loadMap: real file ok; missing is not an error; broken ones are reported', () => {
  assert.equal(P.loadMap(mapText).ok, true);
  assert.deepEqual(P.loadMap(null), { ok: false, missing: true, errors: [] });
  assert.deepEqual(P.loadMap('{x').errors, ['json']);
  const bad = (mut, want) => { const m = JSON.parse(mapText); mut(m); const r = P.loadMap(JSON.stringify(m)); assert.equal(r.ok, false, want); assert.ok(r.errors.includes(want), r.errors.join()); };
  bad((m) => { delete m.zeroInitial; }, 'zeroInitial');
  bad((m) => { m.toneMarks.a = ['x']; }, 'toneMarks');
  bad((m) => { delete m.toneNames['3']; }, 'toneNames');
  bad((m) => { m.initialsLongestFirst = ['b', 'zh']; }, 'initialsLongestFirst-order');
  bad((m) => { m.vAsUmlaut = { note: 'x' }; }, 'vAsUmlaut');
  bad((m) => { delete m.numbers; }, 'numbers');
});

test('zeroInitial: every y/w spelling in the map restores its full final', () => {
  for (const [k, v] of Object.entries(pmap.zeroInitial)) {
    const s = py.parseSyllable(k);
    assert.deepEqual(s, { initial: null, final: v, zero: true }, k);
  }
});

test('afterInitial / uAsU_umlaut: restored after an initial, exactly as the map says', () => {
  for (const [k, v] of Object.entries(pmap.afterInitial)) {
    // j、q、x 后的 u 先按 uAsU_umlaut 还原为 ü，不走 afterInitial
    const hits = pmap.initialsLongestFirst.filter((i) => !(pmap.uAsU_umlaut.initials.includes(i) && Object.keys(pmap.uAsU_umlaut.map).includes(k)))
      .map((i) => py.parseSyllable(i + k)).filter(Boolean);
    assert.ok(hits.length > 0, k);
    for (const h of hits) assert.equal(h.final, v);
  }
  for (const ini of pmap.uAsU_umlaut.initials) for (const [k, v] of Object.entries(pmap.uAsU_umlaut.map)) {
    assert.equal(py.parseSyllable(ini + k).final, v, ini + k);
  }
});

test('after j / q / x a bare u-final other than the umlaut ones is not a syllable (e.g. no quang)', () => {
  const key = Object.keys(pmap.uAsU_umlaut.map)[0];
  const letter = key[0];
  for (const ini of pmap.uAsU_umlaut.initials) {
    for (const f of translator.finalNames) {
      if (f[0] !== letter || Object.keys(pmap.uAsU_umlaut.map).includes(f)) continue;
      assert.equal(py.parseSyllable(ini + f), null, ini + f);
    }
  }
});

test('finals with a y/w spelling are not syllables on their own; the others are zero-initial syllables', () => {
  const values = new Set(Object.values(pmap.zeroInitial));
  for (const f of translator.finalNames) {
    const s = py.parseSyllable(f);
    if (values.has(f)) assert.equal(s, null, f); else if (s) assert.deepEqual(s, { initial: null, final: f, zero: true });
  }
});

test('v is read as the umlaut letter, as the map says', () => {
  const [vk, vv] = Object.entries(pmap.vAsUmlaut).find(([k]) => k !== 'note');
  const withUmlaut = pmap.initialsLongestFirst.find((i) => py.parseSyllable(i + vv));
  const a = py.parse(withUmlaut + vk + 'ē');
  assert.equal(a.ok, false); // 不是合法音节也不会被猜：只验证 v 被认得
  const b = py.parse(withUmlaut + vk);
  assert.equal(b.ok, true);
  assert.equal(b.words[0].syllables[0].final, py.parseSyllable(withUmlaut + vv).final);
});

test('tone marks → tone number; neutral tone = 0; raw keeps the written form', () => {
  const [w] = syl('hěnhǎo', '很好');
  assert.deepEqual(w.map((s) => [s.raw, s.tone]), [['hěn', 3], ['hǎo', 3]]);
  const [n] = syl('qǔzi', '曲子');
  assert.deepEqual(n.map((s) => [s.raw, s.tone]), [['qǔ', 3], ['zi', 0]]);
  for (const [base, marks] of Object.entries(pmap.toneMarks)) {
    marks.forEach((m, i) => {
      const t = py.parse(m, { chars: 'x' });
      if (t.ok) assert.equal(t.words[0].syllables[0].tone, i + 1, base + m);
    });
  }
});

test('spaces split words; apostrophe and hyphen only mark syllable boundaries (no cell, no word break)', () => {
  const [a, b] = syl('jīngzàng gāosù', '京藏高速');
  assert.equal(a.length, 2);
  assert.equal(b.length, 2);
  assert.equal(syl("cí'ài", '慈爱')[0].length, 2);
  const hy = syl('bā-jiǔ', '八九');
  assert.equal(hy.length, 1);
  assert.equal(hy[0].length, 2);
  assert.equal(syl('hěn   hǎo', '很好').length, 2);
});

test('the manual-keep marker flags the syllable before it', () => {
  const s = syl('dì' + marker + 'dào' + marker, '地道')[0];
  assert.deepEqual(s.map((x) => [x.raw, x.keepTone]), [['dì', true], ['dào', true]]);
  const one = syl('wèn' + marker, '问')[0];
  assert.equal(one[0].keepTone, true);
  assert.equal(syl('wèn', '问')[0][0].keepTone, false);
  assert.equal(py.parse(marker + 'wèn').ok, false);
  assert.equal(py.parse('wèn' + marker + marker).ok, false);
  const noMarker = P.createPinyin(pmap, translator.finalNames).parse('wèn' + marker);
  assert.equal(noMarker.ok, false);
});

test('chars pick the one valid segmentation and check the syllable count', () => {
  const r = py.parse('quánguó');
  assert.equal(r.ok, false);
  assert.equal(py.parse('quánguó', { chars: '全国' }).ok, true);
  assert.equal(py.parse('quánguó', { chars: '全国人' }).ok, false); // 三个字：没有唯一的三音节切分
  assert.equal(py.parse('quánguó', { chars: '全' }).reason, 'chars-mismatch');
});

test('every example from rules.json parses into exactly one syllable per character', () => {
  assert.ok(examples.length > 100);
  for (const e of examples) {
    const r = py.parse(e.pinyin, { chars: e.chars });
    assert.equal(r.ok, true, e.chars + ' ' + e.pinyin + ' ' + JSON.stringify(r));
    assert.equal(r.count, [...e.chars].length, e.chars);
  }
});

test('unsupported input is refused with a reason, never guessed', () => {
  const cases = [['', 'empty'], ['   ', 'empty'], ['tǔ·xīngqì', 'bad-char'], ['hao3', 'bad-char'], ['zxcv', 'bad-syllable'], ['ng', 'bad-syllable'], ['hěn?', 'bad-char'], ['1', 'bad-char']];
  for (const [t, reason] of cases) {
    const r = py.parse(t);
    assert.equal(r.ok, false, t);
    assert.equal(r.reason, reason, t);
  }
  assert.equal(py.parse(null).reason, 'empty');
});

test('all rule-listed syllables (apical / keep / omit lists) are parseable syllables', () => {
  const lists = [];
  for (const r of rules.rules) {
    if (r.apply.type === 'apical') lists.push(...r.apply.syllables);
    if (r.apply.type === 'omitTone') lists.push(...(r.apply.keepSyllables || []));
    if (r.apply.type === 'syllableTone') lists.push(...r.apply.omit, ...r.apply.keep);
  }
  assert.ok(lists.length > 10);
  for (const s of lists) assert.equal(py.parse(s, { chars: '字' }).ok, true, s);
});
