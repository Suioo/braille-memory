'use strict';
// 盲文 → 拼音：正向翻译后再反查，应还原出同样的拼音（声调省写还原为被省的声调，轻声虚词按常用读法）。
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/core/backtranslate.js');
const { translator: tr, examples } = require('./helpers/fixtures.js');

const bt = B.createBackTranslator(tr);
const enc = (toks) => tr.translate(toks).cells.map((c) => (c.kind === 'space' ? [] : c.dots));

test('round trip: common words and sentences decode back to the same pinyin', () => {
  for (const [p, c] of [
    ['wǒmen yīqǐ xuéxí mángwén', '我们一起学习盲文'], ['nǐde shūbāo', '你的书包'], ["cí'ài shìyè", '慈爱事业'], ['tāyòng', '他用'],
    ['zhōnghuá rénmín gònghéguó', '中华人民共和国'], ['fēngfān hépíng', '风帆和平'], ['jiāxiāng qùnián', '家乡去年'],
    ['lǜsè kuàilè', '绿色快乐'], ["nǚ'ér zěnmeyàng", '女儿怎么样'],
  ]) assert.equal(bt.decode(enc([{ type: 'text', pinyin: p, chars: c }])).pinyin, p, c);
});

test('rule examples round-trip (tone kept / omitted per the rules)', () => {
  let n = 0;
  for (const e of examples) {
    if (!/^[\u3400-\u9fff]+$/.test(e.chars) || /!/.test(e.pinyin)) continue;
    const cells = enc([{ type: 'text', pinyin: e.pinyin, chars: e.chars }]);
    const d = bt.decode(cells);
    assert.equal(d.unknown, 0, e.chars);
    // 反查结果再正向翻译，盲方必须完全一样（读法可以是同形的另一种，但不能改变盲文）
    const again = enc([{ type: 'text', pinyin: d.pinyin, chars: e.chars }]);
    assert.deepEqual(again, cells, e.chars + ' ' + d.pinyin);
    n++;
  }
  assert.ok(n > 40);
});

test('punctuation, numbers, contractions, unknown cells', () => {
  const cells = enc([{ type: 'text', pinyin: 'hǎo', chars: '好' }, { type: 'punct', char: '，' }, { type: 'number', text: '1949' }, { type: 'punct', char: '。' }]);
  assert.equal(bt.decode(cells).pinyin, 'hǎo，1949。');
  const d = bt.decode(enc([{ type: 'text', pinyin: 'nǐde', chars: '你的' }]));
  assert.deepEqual(d.words[0].items.map((x) => x.char), ['你', '的']);
  assert.equal(bt.decode([[4, 6], [4, 6]]).unknown, 2);
});

test('input parsing: dot numbers and Unicode braille; Unicode output', () => {
  assert.deepEqual(bt.parseInput('1345 35 0 145'), [[1, 3, 4, 5], [3, 5], [], [1, 4, 5]]);
  assert.deepEqual(bt.parseInput('⠝⠔⠀⠙'), [[1, 3, 4, 5], [3, 5], [], [1, 4, 5]]);
  assert.equal(bt.parseInput('1347 2'), null);
  assert.equal(bt.toUnicode([[1, 3, 4, 5], [3, 5], [], [1, 4, 5]]), '⠝⠔⠀⠙');
});
