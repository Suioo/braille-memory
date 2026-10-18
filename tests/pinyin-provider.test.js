'use strict';
// 拼音库适配：只验证「分词 + 带调拼音」，盲文一律由 translate.js 算。夹具来自 rules.json 的例词。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createProvider } = require('../src/core/pinyin-provider.js');
const A = require('../src/core/annotate.js');
const { examples, translator, pmap } = require('./helpers/fixtures.js');

const VENDOR = path.join(__dirname, '..', 'src', 'vendor');
const lib = require(path.join(VENDOR, 'pinyin-pro.js'));
const provider = createProvider(lib);

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
  const bad = createProvider({ segment: () => [{ origin: '我', result: 'wǒ' }], pinyin: () => ['wǒ', 'x'] });
  assert.throws(() => bad.segment('我'));
  const wrong = createProvider({ segment: () => [{ origin: '你', result: 'nǐ' }], pinyin: () => ['nǐ'] });
  assert.throws(() => wrong.segment('我'));
  const junk = createProvider({ segment: () => [{ origin: '我', result: '' }], pinyin: () => ['123'] });
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
