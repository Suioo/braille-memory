'use strict';
// 分词校订（GF 0019—2018 第 12 章）：直接给出分词器的切分结果，检查校订后的词界和结构助词读音。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { refine, createProvider, exampleChunks } = require('../src/core/pinyin-provider.js');
const { examples, translator } = require('./helpers/fixtures.js');

/** 'chars:pinyin' 以空格分隔的词块 → refine 的输入 / 输出比较用字符串。 */
const parse = (s) => s.split(' ').map((w) => { const [c, p] = w.split(':'); return { c: Array.from(c), p: p.split('-') }; });
const show = (list) => list.map((x) => x.c.join('') + ':' + x.p.join('-')).join(' ');
const r = (s) => show(refine(parse(s)));

test('12.2.5 后附成分与多音节词连写；前附成分与后面的词连写', () => {
  assert.equal(r('老师:lǎo-shī 们:men 来:lái'), '老师们:lǎo-shī-men 来:lái');
  assert.equal(r('积极:jī-jí 性:xìng'), '积极性:jī-jí-xìng');
  assert.equal(r('现代:xiàn-dài 化:huà'), '现代化:xiàn-dài-huà');
  assert.equal(r('非:fēi 正式:zhèng-shì'), '非正式:fēi-zhèng-shì');
  assert.equal(r('他:tā 家:jiā'), '他:tā 家:jiā'); // 单音节词后的「家」不当后附成分
});

test('12.2.4 AABB 重叠被拆开时合回一块；ABAB 保持分写', () => {
  assert.equal(r('高:gāo 高兴:gāo-xìng 兴:xìng'), '高高兴兴:gāo-gāo-xìng-xìng');
  assert.equal(r('讨论:tǎo-lùn 讨论:tǎo-lùn'), '讨论:tǎo-lùn 讨论:tǎo-lùn');
});

test('12.2.6 数量、方位、每年 / 大红花一类紧密结构连写', () => {
  assert.equal(r('三:sān 个人:gè-rén'), '三个:sān-gè 人:rén');
  assert.equal(r('一本书:yī-běn-shū'), '一本:yī-běn 书:shū');
  assert.equal(r('屋:wū 里:lǐ'), '屋里:wū-lǐ');
  assert.equal(r('桌子:zhuō-zi 上有:shàng-yǒu 书:shū'), '桌子上:zhuō-zi-shàng 有:yǒu 书:shū');
  assert.equal(r('前:qián 天:tiān'), '前天:qián-tiān');
  assert.equal(r('小:xiǎo 鸟:niǎo'), '小鸟:xiǎo-niǎo');
  assert.equal(r('小:xiǎo 的:de'), '小:xiǎo 的:de');
});

test('动态助词「了、着、过」与前面的词连写', () => {
  assert.equal(r('吃了饭:chī-le-fàn'), '吃了:chī-le 饭:fàn');
  assert.equal(r('走:zǒu 着:zhe 去:qù'), '走着:zǒu-zhe 去:qù');
  assert.equal(r('看:kàn 过:guò 电影:diàn-yǐng'), '看过:kàn-guò 电影:diàn-yǐng');
});

test('结构助词「的、地、得」读轻声 de；「获得、目的」等实词读音不动', () => {
  assert.equal(r('跑得:pǎo-dé 快:kuài'), '跑得:pǎo-de 快:kuài');
  assert.equal(r('获得:huò-dé'), '获得:huò-dé');
  assert.equal(r('慢慢地:màn-màn-dì 走:zǒu'), '慢慢地:màn-màn-de 走:zǒu');
  assert.equal(r('认真:rèn-zhēn 地:dì 学习:xué-xí'), '认真:rèn-zhēn 地:de 学习:xué-xí');
  assert.equal(r('目的:mù-dì'), '目的:mù-dì');
  assert.equal(r('说:shuō 的话:de-huà'), '说:shuō 的:de 话:huà');
});

test('refine never reorders, drops or adds characters', () => {
  const inp = parse('一本书:yī-běn-shū 高:gāo 高兴:gāo-xìng 兴:xìng 地:dì 走:zǒu 了:le');
  const out = refine(inp);
  assert.equal(out.map((x) => x.c.join('')).join(''), inp.map((x) => x.c.join('')).join(''));
  for (const x of out) assert.equal(x.c.length, x.p.length);
});

test('rule examples (known words) keep their own segmentation through the real provider', () => {
  const lib = require(path.join(__dirname, '..', 'src', 'vendor', 'pinyin-pro.js'));
  const words = exampleChunks(examples.filter((e) => /^[㐀-鿿]+$/.test(e.chars)), translator.parse).flat();
  const provider = createProvider(lib, { words });
  for (const [chars, want] of [['孩子们', ['孩子们']], ['中华人民共和国', ['中华', '人民', '共和国']], ['研究研究', ['研究', '研究']], ['大红花', ['大红花']]]) {
    assert.deepEqual(provider.segment(chars).map((w) => w.chars), want, chars);
  }
});

test('相连的数词连写；单音节动词重叠后一个读轻声，名词重叠不变', () => {
  assert.equal(r('一:yī 二三四:èr-sān-sì 五:wǔ'), '一二三四五:yī-èr-sān-sì-wǔ');
  assert.equal(r('想想:xiǎng-xiǎng'), '想想:xiǎng-xiang');
  assert.equal(r('人人:rén-rén'), '人人:rén-rén');
});
