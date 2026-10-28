/**
 * 自定义文本的标注（纯逻辑，不碰 DOM）：切句、把汉字文本变成 token（词 / 标点 / 数 / 空方 / 不支持的原文），
 * 并核对每个 token 能不能交给翻盲文引擎。
 *
 * 拼音与分词只来自注入的 provider（拼音库 / 人工 / AI），盲文只由 translate.js 计算，本文件不含任何点位、规则或拼音。
 * 引擎不认的内容逐处标出（kind + reason），不会静默跳过；只有用户明确点了「此处不练习」（skip）才不进答案，且仍可见。
 *
 * token：{k:'w', c:汉字, p:拼音（一字一音节，! 表示声调不省写）, a:'auto'|'edited'|'ai'}
 *        {k:'u', c:标点}  {k:'n', c:数字串}  {k:'b'} 显式空方  {k:'x', c:原文, skip?:true} 引擎不支持
 * 渲染进程：window.BMAnnotate；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMAnnotate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CJK = /[㐀-䶿一-鿿]/;
  /** 句末标点；其后紧跟的收尾引号 / 括号算在这一句里。 */
  const SENTENCE_END = new Set(['。', '！', '？', '!', '?']);
  const CLOSERS = new Set(['”', '’', '）', '］', '》', '〉', '」', '』', '】']);
  const CLAUSE = new Set(['，', '、', '；', '：']);
  /** 一句的字数上限：超过就在最近的逗号类标点处断开，没有就硬断。 */
  const MAX_SENTENCE = 80;

  const chars = (s) => Array.from(String(s));

  /**
   * 切句：按换行分段，再按句末标点切；超长的句子在逗号类标点处断开。
   * @param {string} text
   * @returns {string[]} 非空、已去首尾空白的句子
   */
  function splitSentences(text) {
    const out = [];
    const push = (s) => { const t = s.trim(); if (t) out.push(t); };
    const cap = (s) => {
      let a = chars(s);
      while (a.length > MAX_SENTENCE) {
        let cut = -1;
        for (let i = MAX_SENTENCE - 1; i > 0; i--) if (CLAUSE.has(a[i])) { cut = i + 1; break; }
        if (cut < 0) cut = MAX_SENTENCE;
        push(a.slice(0, cut).join(''));
        a = a.slice(cut);
      }
      push(a.join(''));
    };
    for (const para of String(text == null ? '' : text).replace(/\r\n?/g, '\n').split('\n')) {
      const a = chars(para);
      let cur = [];
      for (let i = 0; i < a.length; i++) {
        cur.push(a[i]);
        if (SENTENCE_END.has(a[i])) {
          while (i + 1 < a.length && (SENTENCE_END.has(a[i + 1]) || CLOSERS.has(a[i + 1]))) cur.push(a[++i]);
          cap(cur.join(''));
          cur = [];
        }
      }
      if (cur.length) cap(cur.join(''));
    }
    return out;
  }

  /**
   * 一句 → token 序列。
   * @param {string} raw
   * @param {{map: object, provider: {segment:(run:string)=>{chars:string, pinyin:string}[]}}} o
   * @returns {{ok:true, tokens:object[]}|{ok:false, reason:'provider', detail:string}}
   */
  function tokenize(raw, o) {
    const punct = Object.keys(o.map.punctuation).filter((k) => k !== 'note').sort((a, b) => b.length - a.length);
    const a = chars(raw);
    const tokens = [];
    let other = '';
    const flush = () => { if (other) { tokens.push({ k: 'x', c: other }); other = ''; } };
    let i = 0;
    while (i < a.length) {
      const rest = a.slice(i).join('');
      const p = punct.find((k) => rest.startsWith(k));
      if (p) { flush(); tokens.push({ k: 'u', c: p }); i += chars(p).length; continue; }
      if (CJK.test(a[i])) {
        flush();
        let j = i;
        while (j < a.length && CJK.test(a[j])) j++;
        const run = a.slice(i, j).join('');
        let words;
        try { words = o.provider.segment(run); } catch (_) { words = null; }
        if (words === null) {
          // 库对整段给不出拼音：逐字再试，仍不行的字单独标成「没有拼音」的不支持原文（逐处标出，不静默跳过、不拖垮整句）
          words = [];
          for (const ch of chars(run)) {
            try { const one = o.provider.segment(ch); words.push(Array.isArray(one) && one.length === 1 && one[0].chars === ch ? one[0] : { chars: ch, pinyin: null }); } catch (_) { words.push({ chars: ch, pinyin: null }); }
          }
        }
        if (!Array.isArray(words) || words.map((w) => w.chars).join('') !== run || words.some((w) => !w.chars || (w.pinyin !== null && (typeof w.pinyin !== 'string' || !w.pinyin)))) {
          return { ok: false, reason: 'provider', detail: 'mismatch' };
        }
        for (const w of words) tokens.push(w.pinyin === null ? { k: 'x', c: w.chars } : { k: 'w', c: w.chars, p: w.pinyin.normalize('NFC').toLowerCase(), a: 'auto' });
        i = j;
        continue;
      }
      if (/[0-9]/.test(a[i])) {
        flush();
        let j = i;
        while (j < a.length && /[0-9]/.test(a[j])) j++;
        tokens.push({ k: 'n', c: a.slice(i, j).join('') });
        i = j;
        continue;
      }
      if (/\s/.test(a[i])) { flush(); i++; continue; } // 空白只是分隔，不产生任何方（要空方请显式加「空方」）
      other += a[i];
      i++;
    }
    flush();
    return { ok: true, tokens: spaceTokens(tokens, o.map.punctuationSpacing) };
  }

  /**
   * 按标点的书写规定补空方（只补，不改已有的；已经有显式空方的地方不重复）：
   * 词（数、不支持的原文也算）与标点之间：标点的 before / after 为 true 才空一方；
   * 两个标点连用：前一个 after 且后一个 before 才在两者之间空一方（只空一方）。
   * spacing 来自 data/pinyin_map.json 的 punctuationSpacing；缺失或标点未列入 = 不自动空方。句首、句尾不补。
   */
  function spaceTokens(tokens, spacing) {
    if (!spacing || typeof spacing !== 'object') return tokens;
    const rule = (t) => (t && t.k === 'u' && t.c !== 'note' && Object.prototype.hasOwnProperty.call(spacing, t.c) ? spacing[t.c] : null);
    const out = [];
    for (let i = 0; i < tokens.length; i++) {
      const prev = tokens[i - 1];
      const t = tokens[i];
      if (prev && prev.k !== 'b' && t.k !== 'b') {
        const rp = rule(prev);
        const rt = rule(t);
        const pu = prev.k === 'u';
        const tu = t.k === 'u';
        let blank = false;
        if (pu && tu) blank = !!(rp && rp.after && rt && rt.before);
        else if (pu) blank = !!(rp && rp.after);
        else if (tu) blank = !!(rt && rt.before);
        if (blank) out.push({ k: 'b' });
      }
      out.push(t);
    }
    return out;
  }

  const classify = (c) => (CJK.test(c) ? 'no-pinyin' : /[A-Za-z]/.test(c) ? 'latin' : /[０-９]/.test(c) ? 'fullwidth-digit' : /[\u0000-\u007f]/.test(c) ? 'ascii-symbol' : 'symbol');

  /**
   * 引擎输入：连续的词 → 一个 text 记号（词间空格 = 词间空方）；标点 / 数 / 空方各自一个记号；skip 的不支持原文不进答案。
   * 每个记号带 src（对应的 token 下标），出错时能定位回去。
   */
  function engineTokens(tokens) {
    const out = [];
    let run = null;
    const closeRun = () => { if (run) { out.push({ type: 'text', pinyin: run.py.join(' '), chars: run.ch.join(''), src: run.src }); run = null; } };
    tokens.forEach((t, i) => {
      if (t.k === 'w') { if (!run) run = { py: [], ch: [], src: [] }; run.py.push(t.p); run.ch.push(t.c); run.src.push(i); return; }
      closeRun();
      if (t.k === 'u') out.push({ type: 'punct', char: t.c, src: [i] });
      else if (t.k === 'n') out.push({ type: 'number', text: t.c, src: [i] });
      else if (t.k === 'b') out.push({ type: 'blank', src: [i] });
    });
    closeRun();
    return out;
  }

  /**
   * 逐处核对一句。
   * @returns {{ok:boolean, issues:{i:number, kind:'pinyin'|'punct'|'number'|'unsupported'|'engine', reason:string, detail?:string}[], skipped:number[], result?:object, tokens?:object[]}}
   */
  function check(tokens, translator) {
    const issues = [];
    const skipped = [];
    const map = translator.map;
    tokens.forEach((t, i) => {
      if (t.k === 'w') {
        if (!t.c || !Array.from(t.c).every((ch) => CJK.test(ch))) issues.push({ i, kind: 'pinyin', reason: 'bad-chars' });
        else if (typeof t.p !== 'string' || !t.p.trim()) issues.push({ i, kind: 'pinyin', reason: 'empty' });
        else if (/\s/.test(t.p)) issues.push({ i, kind: 'pinyin', reason: 'space' });
        else {
          const r = translator.parse(t.p, { chars: t.c });
          if (!r.ok) issues.push({ i, kind: 'pinyin', reason: r.reason, detail: r.detail });
        }
      } else if (t.k === 'u') {
        if (t.c === 'note' || !Object.prototype.hasOwnProperty.call(map.punctuation, t.c)) issues.push({ i, kind: 'punct', reason: 'no-punct', detail: t.c });
      } else if (t.k === 'n') {
        if (!/^[0-9]+$/.test(t.c || '')) issues.push({ i, kind: 'number', reason: 'bad-number', detail: t.c });
      } else if (t.k === 'x') {
        if (t.skip === true) skipped.push(i); else issues.push({ i, kind: 'unsupported', reason: classify(t.c || ''), detail: t.c });
      }
    });
    if (issues.length) return { ok: false, issues, skipped };
    const et = engineTokens(tokens);
    if (!et.length) return { ok: false, issues: [{ i: 0, kind: 'engine', reason: 'empty' }], skipped };
    const res = translator.translate(et);
    if (!res.ok) {
      const src = et[res.token] ? et[res.token].src[0] : 0;
      return { ok: false, issues: [{ i: src, kind: 'engine', reason: res.reason, detail: res.detail }], skipped };
    }
    return { ok: true, issues: [], skipped, result: res, tokens: et };
  }

  /** 32 位 FNV-1a，十六进制（短内容签名；Node 与浏览器结果一致）。 */
  function hash(str) {
    let h = 0x811c9dc5;
    for (const ch of String(str)) {
      let c = ch.codePointAt(0);
      while (c > 0) { h ^= c & 0xff; h = Math.imul(h, 0x01000193) >>> 0; c = Math.floor(c / 256); }
    }
    return h.toString(16).padStart(8, '0');
  }

  const cellsKey = (cells) => cells.map((d) => (d.length ? d.join('') : '_')).join(' ');

  /** 题面上的拼音一行：词之间空格，标点 / 数字原样，空方画成 ␣，跳过的不支持原文画成 〔…〕。 */
  function pinyinLine(tokens) {
    let s = '';
    let prevWord = false;
    for (const t of tokens) {
      if (t.k === 'w') { s += (prevWord ? ' ' : '') + t.p; prevWord = true; continue; }
      prevWord = false;
      if (t.k === 'b') s += '␣';
      else if (t.k === 'x') s += t.skip ? '〔' + t.c + '〕' : t.c;
      else s += t.c;
    }
    return s;
  }

  return { CJK, MAX_SENTENCE, splitSentences, tokenize, spaceTokens, engineTokens, check, hash, cellsKey, pinyinLine, classify };
});
