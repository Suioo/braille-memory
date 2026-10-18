'use strict';
// 拼音库适配：只验证「分词 + 带调拼音」，盲文一律由 translate.js 算。夹具来自 rules.json 的例词。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createProvider, exampleChunks } = require('../src/core/pinyin-provider.js');
const A = require('../src/core/annotate.js');
const { examples, translator, pmap } = require('./helpers/fixtures.js');

const VENDOR = path.join(__dirname, '..', 'src', 'vendor');
const lib = require(path.join(VENDOR, 'pinyin-pro.js'));
const chunks = exampleChunks(examples.filter((e) => /^[\u3400-\u9fff]+$/.test(e.chars)), translator.parse);
const wordsFromRules = chunks.flat();
// 与应用里一致：系统分词器 + 规则例词作为已知词
const provider = createProvider(lib, { words: wordsFromRules });

test('vendored pinyin-pro matches the sha256 and version on record, and node_modules copy', () => {
  const rec = JSON.parse(fs.readFileSync(path.join(VENDOR, 'VENDOR.json'), 'utf8')).libs.find((l) => l.name === 'pinyin-pro');
  assert.equal(rec.version, '3.29.5');
  assert.equal(rec.license, 'MIT');
  const buf = fs.readFileSync(path.join(VENDOR, rec.as));
  assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), rec.sha256);
  assert.equal(buf.length, rec.bytes);
  assert.ok(fs.existsSync(path.join(VENDOR, 'pinyin-pro.LICENSE')));
  const nm = path.join(__dirname, '..', 'node_modules', 'pinyin-pro', 'dist', 'index.js');
  if (fs.existsSync(nm)) assert.deepEqual(fs.readFileSync(nm), buf);
});

test('segment returns words covering the run exactly, one string of toned pinyin per word', () => {
  const r = provider.segment('我喜欢数学');
  assert.equal(r.map((w) => w.chars).join(''), '我喜欢数学');
  for (const w of r) assert.match(w.pinyin, /^[\p{L}\p{M}]+$/u);
  assert.deepEqual(provider.segment(''), []);
});

test('polyphones follow context; tone sandhi is off (本调); neutral tone unmarked', () => {
  const py = (s) => provider.segment(s).map((w) => w.pinyin).join(' ');
  assert.match(py('银行'), /yínháng/);
  assert.match(py('一个'), /yī/);
  assert.match(py('不对'), /bù/);
  assert.ok(py('衣裳').endsWith('shang'));
});

test('erhua 儿 stays its own syllable', () => {
  assert.equal(provider.segment('花儿').map((w) => w.pinyin).join('|').replace(/\|/g, ''), 'huāér');
});

test('bad lib or inconsistent output throws instead of guessing', () => {
  assert.throws(() => createProvider(null));
  assert.throws(() => createProvider({}));
  const bad = createProvider({ pinyin: () => ['wǒ', 'x'] });
  assert.throws(() => bad.segment('我'));
  const junk = createProvider({ pinyin: () => ['123'] });
  assert.throws(() => junk.segment('我'));
});

test('real-library annotate → check pipeline produces engine-ready sentences for common text', () => {
  const r = A.tokenize('我喜欢读书。', { map: pmap, provider });
  assert.equal(r.ok, true);
  const c = A.check(r.tokens, translator);
  assert.equal(c.ok, true, JSON.stringify(c.issues));
  assert.ok(c.result.cells.length > 0);
});

test('accuracy vs rules.json example words (report; floor guards regressions)', () => {
  let total = 0; let same = 0; const diff = [];
  const seen = new Set();
  for (const e of examples) {
    if (!/^[㐀-鿿]+$/.test(e.chars) || /[\s'!-]/.test(e.pinyin) || seen.has(e.chars)) continue;
    seen.add(e.chars);
    total++;
    let got;
    try { got = provider.segment(e.chars).map((w) => w.pinyin).join(''); } catch (_) { got = '(error)'; }
    if (got === e.pinyin.normalize('NFC')) same++; else diff.push(e.chars + ' 例=' + e.pinyin + ' 库=' + got);
  }
  console.log('# 拼音库 vs 例词：' + same + '/' + total + (diff.length ? '；不同：' + diff.join('；') : ''));
  assert.ok(total >= 20);
  assert.ok(same / total >= 0.8, 'accuracy floor');
});

const wordsOf = (run, p) => (p || provider).segment(run).map((w) => w.chars);
const norm = (s) => s.normalize('NFC');

test('the library is NOT a segmenter: pinyin-pro segment() returns single characters (documents why we segment ourselves)', () => {
  assert.deepEqual(lib.segment('我们一起学习盲文').map((x) => x.origin), Array.from('我们一起学习盲文'));
});

test('segmentation: 我们一起学习盲文。 → 我们 / 一起 / 学习 / 盲文, pinyin joined inside a word', () => {
  const r = provider.segment('我们一起学习盲文');
  assert.deepEqual(r.map((w) => w.chars), ['我们', '一起', '学习', '盲文']);
  assert.deepEqual(r.map((w) => w.pinyin), ['wǒmen', 'yīqǐ', 'xuéxí', 'mángwén'].map(norm));
  const t = A.tokenize('我们一起学习盲文' + Object.keys(pmap.punctuation).find((k) => pmap.punctuation[k] === '句号'), { map: pmap, provider });
  assert.equal(t.ok, true);
  assert.deepEqual(t.tokens.filter((x) => x.k === 'w').map((x) => x.c), ['我们', '一起', '学习', '盲文']);
});

test('without a system segmenter: single characters, never an exception; known words still merge', () => {
  const p0 = createProvider(lib, { segmenter: null, words: wordsFromRules });
  assert.deepEqual(wordsOf('我喜欢', p0), ['我', '喜', '欢']);
  assert.deepEqual(wordsOf('阅读', p0), ['阅读'], 'rules.json example word merges from single characters');
  assert.deepEqual(wordsOf('图书馆', p0), ['图书馆']);
});

test('the merge only joins whole segmenter pieces, longest known word first', () => {
  const seg = (run) => (run === '甲乙丙丁' ? ['甲', '乙', '丙', '丁'] : Array.from(run));
  const p1 = createProvider(lib, { segmenter: seg, words: ['甲乙', '甲乙丙', '丙丁'] });
  assert.deepEqual(wordsOf('甲乙丙丁', p1), ['甲乙丙', '丁']);
  const bad = createProvider(lib, { segmenter: () => ['错'], words: [] });
  assert.deepEqual(wordsOf('甲乙', bad), ['甲', '乙'], 'segmenter output that does not rebuild the text is ignored');
});

test('multi-syllable example words (阅读 / 图书馆 / 中华人民共和国 …): split exactly where rules.json writes them apart — one word inside, blank cells only between words', () => {
  const ex = examples.filter((e) => /^[\u3400-\u9fff]{2,}$/.test(e.chars));
  const group = new Map(ex.map((e) => [e.chars, exampleChunks([e], translator.parse)[0]]));
  for (const c of ['阅读', '图书馆', '中华人民共和国']) assert.ok(group.get(c), c + ' is a rules.json example');
  assert.deepEqual(group.get('阅读'), ['阅读']);
  assert.deepEqual(group.get('图书馆'), ['图书馆']);
  assert.ok(group.get('中华人民共和国').length > 1, 'the example itself is written as several words');
  let checked = 0;
  for (const e of ex) {
    const want = group.get(e.chars);
    if (!want) continue;
    const t = A.tokenize(e.chars, { map: pmap, provider });
    assert.equal(t.ok, true, e.chars);
    assert.deepEqual(t.tokens.filter((x) => x.k === 'w').map((x) => x.c), want, e.chars);
    const c = A.check(t.tokens, translator);
    if (!c.ok) continue;
    // 格数 = 把例词的拼音直接交给引擎的格数（拼音相同时逐方一致）：词内没有多出空方
    const direct = translator.translate([{ type: 'text', pinyin: e.pinyin.normalize('NFC'), chars: e.chars }]);
    if (direct.ok && t.tokens.filter((x) => x.k === 'w').map((x) => x.p).join(' ') === e.pinyin.normalize('NFC')) assert.deepEqual(c.result.cells.map((x) => x.dots), direct.cells.map((x) => x.dots), e.chars);
    checked++;
  }
  assert.ok(checked >= 20, 'checked ' + checked);
});

test('a word made of two units written apart would get a blank cell between — which is exactly what a bad split causes', () => {
  const one = A.tokenize('阅读', { map: pmap, provider });
  const split = A.tokenize('阅读', { map: pmap, provider: createProvider(lib, { segmenter: null, words: [] }) });
  const cells = (t) => A.check(t.tokens, translator).result.cells.length;
  assert.equal(cells(split) - cells(one), 1, 'single-character words add exactly one blank cell');
});
