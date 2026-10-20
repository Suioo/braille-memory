'use strict';
/**
 * 生成「整句翻盲文」核对表（给老师 / 同学对照标准和教材检查）：node tools/review-sheet.js > docs/review-sentences.md
 * 每句列出：自动分词与拼音、每个词的盲方点位（点位数字）及其依据（表 / 规则编号）。只读取项目里的数据与引擎，不含手写点位。
 */
const path = require('node:path');
const { examples, translator, pmap } = require('../tests/helpers/fixtures.js');
const { createProvider, exampleChunks } = require('../src/core/pinyin-provider.js');
const A = require('../src/core/annotate.js');
const lib = require(path.join(__dirname, '..', 'src', 'vendor', 'pinyin-pro.js'));
const words = exampleChunks(examples.filter((e) => /^[㐀-鿿]+$/.test(e.chars)), translator.parse).flat();
const provider = createProvider(lib, { words });

const SENTENCES = [
  '今天天气很好。', '我是特殊教育专业的学生。', '你的书包在桌子上。', '他们正在学习盲文。',
  '老师说：“请大家认真听。”', '我们一起去图书馆吧！', '明天你有时间吗？', '这个问题我也不知道。',
  '中华人民共和国成立于1949年。', '小朋友们高高兴兴地回家了。', '看看这个，想想那个。', '她的哥哥是一名医生。',
  '我喜欢吃苹果、香蕉和西瓜。', '学生们在操场上玩耍。', '一二三四五，上山打老虎。', '图书馆里很安静。',
  '我们要努力学习，天天向上。', '老师们高高兴兴地走进教室。', '他跑得很快。', '桌子上有三本书。', '妈妈给我买了一本新书。', '这是我的第一次尝试。', '祝你生日快乐！',
];

const out = [];
out.push('# 整句翻盲文核对表', '');
out.push('由 `node tools/review-sheet.js` 从当前程序生成，供特教专业老师 / 同学对照《国家通用盲文方案》（GF 0019—2018）和教材检查。');
out.push('点位用数字表示，「·」分隔同一方内的点，「 | 」分隔方，「␣」是空方（词间分写）。**请重点看：①分词是否该连写 / 分写 ②声调该不该省写 ③简写是否正确。**', '');
for (const s of SENTENCES) {
  const toks = A.tokenize(s, { map: pmap, provider });
  out.push('## ' + s);
  if (!toks.ok) { out.push('分词失败：' + toks.detail, ''); continue; }
  const chk = A.check(toks.tokens, translator);
  out.push('拼音（空格 = 分写）：`' + A.pinyinLine(toks.tokens) + '`', '');
  if (!chk.ok) { out.push('引擎不支持：' + JSON.stringify(chk.issues), ''); continue; }
  const cells = chk.result.cells.map((c) => (c.kind === 'space' ? '␣' : c.dots.join('') + (c.rule ? '〔' + c.rule + '〕' : '')));
  out.push('盲方：' + cells.join(' | '), '');
}
process.stdout.write(out.join('\n') + '\n');
