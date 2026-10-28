'use strict';
// 标点前后空方：规则来自 data/pinyin_map.json 的 punctuationSpacing（教材《基础盲文》第26—34页）。测试只用真实数据里的标点与词，不手写点位。
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/annotate.js');
const { pmap, translator } = require('./helpers/fixtures.js');

const SP = pmap.punctuationSpacing;
const W = (c, p) => ({ k: 'w', c, p, a: 'auto' });
const U = (c) => ({ k: 'u', c });
const shape = (tokens) => tokens.map((t) => (t.k === 'b' ? '_' : t.c)).join('');
const sp = (tokens) => shape(A.spaceTokens(tokens, SP));
// 逐字提供拼音的假 provider（只给分词，拼音用于不依赖它的断言）
const prov = { segment: (run) => Array.from(run).map((c) => ({ chars: c, pinyin: 'a' })) };

test('data: every entry names a known punctuation mark and has boolean before / after', () => {
  const e = Object.entries(SP).filter(([k]) => k !== 'note');
  assert.ok(e.length >= 18);
  for (const [k, v] of e) { assert.ok(Object.prototype.hasOwnProperty.call(pmap.punctuation, k), k); assert.equal(typeof v.before, 'boolean'); assert.equal(typeof v.after, 'boolean'); }
});

test('comma / enumeration comma / semicolon / colon: no space before, one space after (a word follows)', () => {
  for (const c of ['，', '、', '；', '：']) assert.equal(sp([W('燕子', 'yànzi'), U(c), W('看见', 'kànjiàn')]), '燕子' + c + '_看见', c);
});

test('period / question mark / exclamation mark: no space on either side', () => {
  for (const c of ['。', '？', '！']) assert.equal(sp([W('燕子', 'yànzi'), U(c), W('看见', 'kànjiàn')]), '燕子' + c + '看见', c);
});

test('double quotes: space before the opening mark and after the closing mark (next to words)', () => {
  assert.equal(sp([W('他', 'tā'), U('“'), W('基础', 'jīchǔ'), U('”'), W('课程', 'kèchéng')]), '他_“基础”_课程');
  assert.equal(sp([U('“'), W('基础', 'jīchǔ'), U('”')]), '“基础”'); // 句首、句尾不补
});

test('brackets and the interpunct never add spaces; book-title marks follow the quote pattern', () => {
  assert.equal(sp([W('沪', 'hù'), U('（'), W('上海', 'shànghǎi'), U('）'), W('宁', 'níng')]), '沪（上海）宁');
  assert.equal(sp([W('海伦', 'hǎilún'), U('·'), W('凯勒', 'kǎilè')]), '海伦·凯勒');
  assert.equal(sp([W('小说', 'xiǎoshuō'), U('《'), W('蛙', 'wā'), U('》'), W('值得', 'zhídé')]), '小说_《蛙》_值得');
});

test('two marks in a row: only when the first wants a space after AND the second wants one before, and then just one space', () => {
  assert.equal(sp([W('说', 'shuō'), U('：'), U('“'), W('好', 'hǎo'), U('！'), U('”')]), '说：_“好！”');
  assert.equal(sp([W('好', 'hǎo'), U('，'), U('“'), W('好', 'hǎo'), U('”'), U('，'), W('是', 'shì')]), '好，_“好”，_是');
  assert.equal(sp([W('好', 'hǎo'), U('。'), U('“'), W('好', 'hǎo'), U('”')]), '好。“好”'); // 开号同前面占两方的标点之间不空
});

test('existing explicit blanks are kept, never doubled; unlisted marks and empty rules change nothing', () => {
  assert.equal(sp([W('燕子', 'yànzi'), U('，'), { k: 'b' }, W('看见', 'kànjiàn')]), '燕子，_看见');
  assert.equal(sp([W('他', 'tā'), U('……'), W('他', 'tā')]), '他……他');
  assert.equal(sp([W('他', 'tā'), U('‘'), W('他', 'tā')]), '他‘他');
  assert.equal(shape(A.spaceTokens([W('燕子', 'yànzi'), U('，'), W('看见', 'kànjiàn')], undefined)), '燕子，看见');
  assert.equal(shape(A.spaceTokens([], SP)), '');
});

test('tokenize applies the spacing, and the engine turns it into exactly one blank cell after the comma', () => {
  const t = A.tokenize('燕子，看见“树叶”。', { map: pmap, provider: { segment: (run) => (run === '燕子' ? [{ chars: '燕子', pinyin: 'yànzi' }] : run === '看见' ? [{ chars: '看见', pinyin: 'kànjiàn' }] : [{ chars: '树叶', pinyin: 'shùyè' }]) } });
  assert.equal(t.ok, true);
  assert.equal(shape(t.tokens), '燕子，_看见_“树叶”。');
  const st = A.check(t.tokens, translator);
  assert.equal(st.ok, true);
  const cells = st.result.cells;
  const blanks = cells.map((c, i) => (c.kind === 'space' ? i : -1)).filter((i) => i >= 0);
  assert.equal(blanks.length, 2); // 逗号后、「看见」与「“」之间
  assert.ok(cells[blanks[0] - 1].dots.length > 0 && cells[blanks[0] + 1].dots.length > 0);
  // 逗号与前面的词之间不空方：逗号方紧跟在「子」后面
  assert.equal(cells[blanks[0] - 1].kind !== 'space', true);
});

test('the example sentence from the textbook photo: blank after every comma / colon, none around ！”', () => {
  const raw = '稻田那边飞来两只燕子，看见树叶往下落，一边飞一边叫，好像在说：“电报来了，催我们赶快到南方去呢！”';
  const t = A.tokenize(raw, { map: pmap, provider: { segment: (run) => [{ chars: run, pinyin: 'a' }] } });
  const s = shape(t.tokens);
  assert.ok(s.includes('说：_“'), s);
  assert.ok(s.endsWith('呢！”'), s);
  assert.equal((s.match(/，_/g) || []).length, 4);
  assert.ok(!s.includes('！_') && !s.includes('_”'), s);
});
