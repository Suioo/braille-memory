/**
 * 拼音库适配（纯逻辑）：把 pinyin-pro 的 pinyin 与系统分词器包成 annotate.js 需要的 provider。
 * 只产出「分词 + 带调拼音」，从不产出点位。注意 pinyin-pro 的 segment 并不是分词（它几乎一字一段），所以分词用 Intl.Segmenter + 已知词表；拼音用整段一次取出（多音字按上下文判断），
 * 并关闭变调（toneSandhi:false）以得到本调——盲文要求写本调，轻声不标调。
 * 渲染进程：window.BMPinyinProvider；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPinyinProvider = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 盲文相关的常用词（只用于分词，不含任何点位）：通用分词器常把它们拆开。 */
  const DOMAIN_WORDS = ['盲文', '盲人', '盲校', '盲杖', '盲道'];
  const MAX_WORD = 10;

  /** 系统自带的词级分词器（Intl.Segmenter，Chromium / Electron / Android WebView 都有）；没有则返回 null。 */
  function defaultSegmenter() {
    try {
      if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
      const seg = new Intl.Segmenter('zh', { granularity: 'word' });
      return (run) => Array.from(seg.segment(run), (x) => x.segment);
    } catch (_) { return null; }
  }

  /**
   * 切词：先用分词器（通用词典）切成片段，再用已知词表（规则例词 + 盲文常用词）把相邻片段合并成更长的词（最长优先，只在片段边界合并）。
   * 分词器缺失或结果与原文不符时退回一字一词（用户可在详情里合并）。
   */
  function splitWords(run, segmenter, words) {
    let pieces;
    try { pieces = segmenter ? segmenter(run) : null; } catch (_) { pieces = null; }
    if (!Array.isArray(pieces) || pieces.join('') !== run || pieces.some((x) => !x)) pieces = Array.from(run);
    const out = [];
    for (let i = 0; i < pieces.length;) {
      let best = i;
      let acc = '';
      for (let j = i; j < pieces.length && Array.from(acc + pieces[j]).length <= MAX_WORD; j++) {
        acc += pieces[j];
        if (j > i && words.has(acc)) best = j;
      }
      out.push(pieces.slice(i, best + 1).join(''));
      i = best + 1;
    }
    return out;
  }

  /**
   * @param {{pinyin:Function}} lib pinyin-pro 的导出（只用它取带调拼音，多音字按整段上下文判断）
   * @param {{segmenter?:((run:string)=>string[])|null, words?:Iterable<string>}} [o] segmenter 省略 = 用 Intl.Segmenter；words = 额外的已知词（如规则例词）
   * @returns {{segment:(run:string)=>{chars:string, pinyin:string}[]}}
   */
  function createProvider(lib, o) {
    if (!lib || typeof lib.pinyin !== 'function') throw new Error('no pinyin lib');
    o = o || {};
    const segmenter = o.segmenter === undefined ? defaultSegmenter() : o.segmenter;
    const words = new Set(DOMAIN_WORDS);
    for (const w of o.words || []) if (typeof w === 'string' && Array.from(w).length >= 2) words.add(w);
    return {
      segment(run) {
        const chars = Array.from(String(run));
        if (!chars.length) return [];
        const syl = lib.pinyin(run, { type: 'array', toneType: 'symbol', toneSandhi: false, v: false });
        if (!Array.isArray(syl) || syl.length !== chars.length) throw new Error('lib mismatch');
        const out = [];
        let at = 0;
        for (const w of splitWords(run, segmenter, words)) {
          const n = Array.from(w).length;
          const py = syl.slice(at, at + n).join('').normalize('NFC').toLowerCase();
          if (!/^[\p{L}\p{M}]+$/u.test(py)) throw new Error('unexpected pinyin');
          out.push({ chars: w, pinyin: py });
          at += n;
        }
        return out;
      },
    };
  }

  /**
   * 例词 → 按它自己的分写拆成的词块（拼音里的空格 = 词间空方，如「中华 人民 共和国」），用作已知词表。
   * 拼音解析交给调用方（translator.parse）；解析失败 / 汉字数与音节数对不上的例词跳过。
   * @param {{chars:string, pinyin:string}[]} entries
   * @param {(pinyin:string, o:{chars:string})=>{ok:boolean, words?:{syllables:object[]}[]}} parse
   * @returns {string[][]} 每个例词一个词块数组（含单字块；调用方按需过滤）
   */
  function exampleChunks(entries, parse) {
    const out = [];
    for (const e of entries) {
      const chars = Array.from(e.chars || '');
      let r;
      try { r = parse(e.pinyin, { chars: e.chars }); } catch (_) { r = null; }
      if (!r || !r.ok || !Array.isArray(r.words) || r.words.reduce((n, w) => n + w.syllables.length, 0) !== chars.length) continue;
      let at = 0;
      out.push(r.words.map((w) => { const c = chars.slice(at, at + w.syllables.length).join(''); at += w.syllables.length; return c; }));
    }
    return out;
  }

  return { createProvider, exampleChunks };
});
