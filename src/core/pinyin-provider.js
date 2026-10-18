/**
 * 拼音库适配（纯逻辑）：把 pinyin-pro 的 segment / pinyin 包成 annotate.js 需要的 provider。
 * 只产出「分词 + 带调拼音」，从不产出点位。分词用库的 segment，拼音用整段一次取出（多音字按上下文判断），
 * 并关闭变调（toneSandhi:false）以得到本调——盲文要求写本调，轻声不标调。
 * 渲染进程：window.BMPinyinProvider；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPinyinProvider = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {{segment:Function, pinyin:Function}} lib pinyin-pro 的导出
   * @returns {{segment:(run:string)=>{chars:string, pinyin:string}[]}}
   */
  function createProvider(lib) {
    if (!lib || typeof lib.segment !== 'function' || typeof lib.pinyin !== 'function') throw new Error('no pinyin lib');
    return {
      segment(run) {
        const chars = Array.from(String(run));
        if (!chars.length) return [];
        const segs = lib.segment(run);
        const syl = lib.pinyin(run, { type: 'array', toneType: 'symbol', toneSandhi: false, v: false });
        if (!Array.isArray(segs) || !Array.isArray(syl) || syl.length !== chars.length || segs.map((s) => s.origin).join('') !== run) throw new Error('lib mismatch');
        const out = [];
        let at = 0;
        for (const s of segs) {
          const n = Array.from(s.origin).length;
          const py = syl.slice(at, at + n).join('').normalize('NFC').toLowerCase();
          if (!/^[\p{L}\p{M}]+$/u.test(py)) throw new Error('unexpected pinyin');
          out.push({ chars: s.origin, pinyin: py });
          at += n;
        }
        return out;
      },
    };
  }

  return { createProvider };
});
