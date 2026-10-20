/**
 * 盲文 → 拼音（反向翻译，纯逻辑）：把一串盲方还原成带调拼音、标点和数字。
 *
 * 不另写一套规则：用正向引擎（translate.js）把所有可能的音节（声母 × 韵母 × 声调，含「后接韵母音节」「声调不省写」两种语境）
 * 以及简写字、特殊拼写、标点、数字都正向翻一遍，得到「盲方序列 → 读法」的反查表，再对每个词（空方之间）做最少记号的动态规划切分。
 * 因此正向规则怎么写，反查就怎么认：声调省写（如 f 声母省阴平）会还原成被省掉的那个声调；g/j、k/q、h/x 同形按后面的韵母区分。
 * 汉语盲文是拼音文字，除简写字（的、么、你、他、她、它）外还原不出汉字；需要汉字时由调用方另行推测（如 AI）。
 * 渲染进程：window.BMBackTranslate；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMBackTranslate = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const key = (cells) => cells.map((c) => c.slice().sort((a, b) => a - b).join('')).join(' ');
  const MAX_UNIT = 3; // 一个音节 / 标点最多几方
  /** 盲文里与「省写了声调的音节」同形、但实际多半读轻声的常用虚词：反查时优先读轻声（们、吗、呢、吧、么）。 */
  const NEUTRAL_FIRST = new Set(['men', 'ma', 'ne', 'ba', 'me']);

  /** 在拼写好的音节上标调（与《汉语拼音方案》的标调位置一致：a、e 优先，ou 标 o，否则标最后一个元音）。 */
  function markTone(s, tone, marks) {
    if (!tone) return s;
    let at = s.search(/[ae]/);
    if (at < 0) at = s.indexOf('ou');
    if (at < 0) for (let i = s.length - 1; i >= 0; i--) if ('iouü'.includes(s[i])) { at = i; break; }
    if (at < 0 || !marks[s[at]]) return null;
    return s.slice(0, at) + marks[s[at]][tone - 1] + s.slice(at + 1);
  }

  /**
   * 由正向引擎生成全部可能音节的拼写（不带调）。声母 j/q/x 只接 i、ü 开头的韵母，g/k/h 和舌尖声母不接（盲文里它们同形，靠这个区分）。
   * @returns {string[]}
   */
  function syllableInventory(tr) {
    const m = tr.map;
    const out = new Set();
    const zeroBy = new Map(Object.entries(m.zeroInitial).map(([sp, f]) => [f, sp])); // 韵母 → y/w 写法
    const afterBy = new Map(Object.entries(m.afterInitial).map(([sp, f]) => [f, sp])); // iou → iu …
    const umlautBy = new Map(Object.entries(m.uAsU_umlaut.map).map(([sp, f]) => [f, sp])); // ü → u（j q x 后）
    const finals = [...tr.finalNames];
    const iStart = (f) => /^[iü]/.test(f);
    for (const f of finals) {
      if (zeroBy.has(f)) out.add(zeroBy.get(f));
      else if (!iStart(f) && f !== 'ong' && !/^u/.test(f)) out.add(f); // a o e ai ei ao ou an en ang eng er 自成音节
    }
    const palatal = new Set(m.uAsU_umlaut.initials);
    for (const ini of m.initialsLongestFirst) {
      for (const f of finals) {
        if (f === 'er' || f === 'ueng') continue;
        if (palatal.has(ini) ? !iStart(f) : (iStart(f) && !/^[bpmdtnl]$/.test(ini))) continue;
        if (f === 'o' && !/^[bpmf]$/.test(ini)) continue; // o 只拼唇音（bo po mo fo），其余写 e（盲文里 o、e 同形）
        if (f === 'e' && /^[bpf]$/.test(ini)) continue;
        let sp = f;
        if (palatal.has(ini) && umlautBy.has(f)) sp = umlautBy.get(f);
        else if (afterBy.has(f)) sp = afterBy.get(f);
        out.add(ini + sp);
      }
      if (/^(zh|ch|sh|r|z|c|s)$/.test(ini)) out.add(ini + 'i'); // 舌尖音节 zhi chi shi ri zi ci si
    }
    return [...out];
  }

  /**
   * @param {object} tr createTranslator 的结果
   * @returns {{decode:(cells:number[][])=>object, parseInput:(text:string)=>number[][]|null, toUnicode:(cells:number[][])=>string, size:number}}
   */
  function createBackTranslator(tr) {
    const dict = new Map(); // 盲方序列 → [{type, pinyin?, char?, cost}]
    const add = (cells, item) => {
      if (!cells || !cells.length || cells.length > MAX_UNIT) return;
      const k = key(cells);
      const arr = dict.get(k) || [];
      if (!arr.some((x) => x.type === item.type && x.pinyin === item.pinyin && x.char === item.char)) arr.push(item);
      dict.set(k, arr);
    };
    const cellsOf = (res) => (res && res.ok ? res.cells.filter((c) => c.kind !== 'space').map((c) => c.dots) : null);
    const marks = tr.map.toneMarks;
    for (const sp of syllableInventory(tr)) {
      for (let tone = 0; tone <= 4; tone++) {
        const p = markTone(sp, tone, marks);
        if (!p) continue;
        // 三种语境：单独 / 后接韵母自成音节（10.2.7）/ 声调不省写（10.2.8）；读法相同，代价不同（越常见越便宜）
        // 占位汉字只用来告诉解析器有几个音节（避免 bāo 被当成 bā+o 的歧义），不会命中简写字
        const variants = [[p, '丁', 1], [p + "'ā", '丁丁', 1.2], [p + tr.marker, '丁', 1.3]];
        for (const [input, chars, cost] of variants) {
          let r;
          try { r = tr.word(input, chars); } catch (_) { r = null; }
          if (!r || !r.ok || !r.syllables.length) continue;
          const first = r.syllables[0].cells.map((c) => c.dots);
          add(first, { type: 'syl', pinyin: p, cost: cost + (tone === 0 ? (NEUTRAL_FIRST.has(sp) ? -0.05 : 0.15) : 0) });
        }
      }
    }
    for (const f of tr.rules.forms || []) add(f.dots, { type: 'syl', pinyin: f.pinyin.normalize('NFC'), char: f.word, cost: 0.9 });
    for (const ch of Object.keys(tr.map.punctuation)) {
      if (ch === 'note') continue;
      add(cellsOf(tr.translate([{ type: 'punct', char: ch }])), { type: 'punct', char: ch, cost: 1 });
    }
    const signRes = cellsOf(tr.translate([{ type: 'number', text: '0' }]));
    const sign = signRes ? key([signRes[0]]) : null;
    const digitOf = new Map();
    for (let d = 0; d <= 9; d++) {
      const c = cellsOf(tr.translate([{ type: 'number', text: String(d) }]));
      if (c && c.length === 2) digitOf.set(key([c[1]]), String(d));
    }

    /** 一个词（没有空方的一段）→ 最少代价的记号序列。 */
    function decodeWord(cells) {
      const n = cells.length;
      const best = new Array(n + 1).fill(null);
      best[0] = { cost: 0, items: [] };
      for (let i = 0; i < n; i++) {
        if (!best[i]) continue;
        const push = (j, cost, item) => {
          const c = best[i].cost + cost;
          if (!best[j] || c < best[j].cost - 1e-9) best[j] = { cost: c, items: best[i].items.concat([item]) };
        };
        // 数：数号 + 连续的数字方
        if (sign && key([cells[i]]) === sign) {
          let j = i + 1;
          let text = '';
          while (j < n && digitOf.has(key([cells[j]]))) { text += digitOf.get(key([cells[j]])); j++; }
          if (text) push(j, 1, { type: 'num', text, cells: cells.slice(i, j) });
        }
        for (let len = 1; len <= MAX_UNIT && i + len <= n; len++) {
          const seg = cells.slice(i, i + len);
          const hits = dict.get(key(seg));
          if (!hits) continue;
          const sorted = hits.slice().sort((a, b) => a.cost - b.cost);
          const top = sorted[0];
          push(i + len, top.cost, Object.assign({ cells: seg, alt: sorted.slice(1, 4).map((x) => x.char || x.pinyin) }, top));
        }
        push(i + 1, 6, { type: 'unknown', cells: [cells[i]] }); // 认不出的方：原样保留，保证总能解完
      }
      return best[n].items;
    }

    /**
     * @param {number[][]} cells 盲方序列；空数组 = 空方（词间分写）
     * @returns {{words:{items:object[]}[], pinyin:string, unknown:number}}
     */
    function decode(cells) {
      const words = [];
      let cur = [];
      const flush = () => { if (cur.length) { words.push({ items: decodeWord(cur) }); cur = []; } };
      for (const c of cells) { if (!c.length) flush(); else cur.push(c); }
      flush();
      let unknown = 0;
      const parts = words.map((w) => {
        let s = '';
        let prevSyl = false;
        for (const it of w.items) {
          if (it.type === 'syl') {
            s += (prevSyl && /^[aoeāáǎàōóǒòēéěè]/.test(it.pinyin) ? "'" : '') + it.pinyin;
            prevSyl = true;
          } else {
            prevSyl = false;
            if (it.type === 'punct') s += it.char;
            else if (it.type === 'num') s += it.text;
            else { s += '□'; unknown++; }
          }
        }
        return s;
      });
      return { words, pinyin: parts.join(' '), unknown };
    }

    /**
     * 解析用户输入的盲文：Unicode 盲文字符（⠁…，U+2800 为空方），或点位数字组（如「1345 35」，方之间空格，空方写 0、_ 或「/」）。
     * @returns {number[][]|null} 无法识别返回 null
     */
    function parseInput(text) {
      const s = String(text || '').trim();
      if (!s) return [];
      if (/^[⠀-⣿\s]+$/.test(s)) {
        const out = [];
        for (const ch of s) {
          if (/\s/.test(ch)) { if (out.length && out[out.length - 1].length) out.push([]); continue; }
          const v = ch.codePointAt(0) - 0x2800;
          const dots = [];
          for (let b = 0; b < 6; b++) if (v & (1 << b)) dots.push(b + 1);
          out.push(dots);
        }
        return out;
      }
      const groups = s.split(/[\s,，]+/).filter(Boolean);
      const out = [];
      for (const g of groups) {
        if (/^(0|_|\/)$/.test(g)) { out.push([]); continue; }
        if (!/^[1-6]{1,6}$/.test(g)) return null;
        out.push([...new Set(Array.from(g, Number))].sort((a, b) => a - b));
      }
      return out;
    }

    /** 盲方序列 → Unicode 盲文字符串（空方 = U+2800）。 */
    function toUnicode(cells) {
      return cells.map((c) => String.fromCodePoint(0x2800 + c.reduce((v, d) => v | (1 << (d - 1)), 0))).join('');
    }

    return { decode, parseInput, toUnicode, size: dict.size };
  }

  return { createBackTranslator, syllableInventory, markTone };
});
