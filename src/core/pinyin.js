/**
 * 拼音解析（纯函数）：把「带调拼音」拆成词与音节（声母、韵母、声调）。
 * 一切拼音知识都来自 data/pinyin_map.json（声母表、y/w 与 iu/ui/un/ü 还原、声调符号、别名）与字表里的韵母名；
 * 本文件不含任何语言常量，也不含点位。认不出的输入返回 {ok:false, reason}，绝不猜。
 *
 * 输入约定（见 rules.json conventions）：空格 = 分写（词与词之间）；音节相连 = 连写；一律小写；写本调，轻声不标调；
 * 撇号 ' 或连字符 - 只表示音节边界 / 连写，不产生任何方；音节后加标记（如 !）表示该音节声调不省写（由规则数据给出标记字符）。
 * 渲染进程：window.BMPinyin；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPinyin = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const strMap = (v) => isObj(v) && Object.values(v).every(isStr);

  /** 校验拼音还原表（pinyin_map.json 解析后的对象）。返回错误码数组。 */
  function checkMap(m) {
    const e = [];
    if (!isObj(m)) return ['not-object'];
    if (!strMap(m.zeroInitial)) e.push('zeroInitial');
    if (!strMap(m.afterInitial)) e.push('afterInitial');
    if (!isObj(m.uAsU_umlaut) || !Array.isArray(m.uAsU_umlaut.initials) || !m.uAsU_umlaut.initials.every(isStr) || !strMap(m.uAsU_umlaut.map)) e.push('uAsU_umlaut');
    if (!isObj(m.vAsUmlaut) || !Object.keys(m.vAsUmlaut).some((k) => k !== 'note') || !Object.entries(m.vAsUmlaut).every(([k, v]) => k === 'note' || (isStr(v) && [...k].length === 1))) e.push('vAsUmlaut');
    if (!strMap(m.finalAliases)) e.push('finalAliases');
    if (!strMap(m.initialAliases)) e.push('initialAliases');
    if (!Array.isArray(m.initialsLongestFirst) || !m.initialsLongestFirst.length || !m.initialsLongestFirst.every(isStr)) e.push('initialsLongestFirst');
    else {
      const l = m.initialsLongestFirst.map((s) => [...s].length);
      if (l.some((x, i) => i && x > l[i - 1])) e.push('initialsLongestFirst-order');
    }
    if (!isObj(m.toneMarks) || !Object.values(m.toneMarks).every((a) => Array.isArray(a) && a.length === 4 && a.every(isStr))) e.push('toneMarks');
    if (!isObj(m.toneNames) || !['1', '2', '3', '4'].every((k) => isStr(m.toneNames[k]))) e.push('toneNames');
    if (!isObj(m.punctuation)) e.push('punctuation');
    if (!isObj(m.numbers) || !isStr(m.numbers.sign)) e.push('numbers');
    return e;
  }

  /**
   * 载入拼音还原表。text 为 null = 文件不存在（规则相关入口整体隐藏，不算错误）。
   * @returns {{ok:boolean, missing?:boolean, errors:string[], map?:object}}
   */
  function loadMap(text) {
    if (text == null) return { ok: false, missing: true, errors: [] };
    let raw;
    try { raw = JSON.parse(String(text)); } catch (_) { return { ok: false, errors: ['json'] }; }
    const errors = checkMap(raw);
    return errors.length ? { ok: false, errors } : { ok: true, errors: [], map: raw };
  }

  /**
   * @param {object} map 拼音还原表（已校验）
   * @param {Set<string>} finalNames 可作为韵母的名字（来自字表韵母 + 别名）
   * @param {{marker?: string}} [opts] marker = 「声调不省写」标记字符（来自规则数据）
   */
  function createPinyin(map, finalNames, opts) {
    const marker = opts && opts.marker ? opts.marker : null;
    const toneOf = new Map(); // 带调符号 → {base, tone}
    for (const base of Object.keys(map.toneMarks)) map.toneMarks[base].forEach((ch, i) => toneOf.set(ch.normalize('NFC'), { base, tone: i + 1 }));
    const initials = map.initialsLongestFirst;
    const letters = new Set();
    for (const ini of initials) for (const ch of ini) letters.add(ch);
    for (const f of finalNames) for (const ch of f) letters.add(ch);
    for (const k of Object.keys(map.zeroInitial)) for (const ch of k) letters.add(ch);
    for (const base of Object.keys(map.toneMarks)) letters.add(base);
    const alias = new Map(Object.entries(map.vAsUmlaut).filter(([k]) => k !== 'note')); // 输入习惯：v 视同 ü
    for (const k of alias.keys()) letters.add(k);
    // 由还原表推出的两条拼写限制（都不是手写常量）：
    //  1. 有 y/w 写法的韵母（zeroInitial 的值）不能不带 y/w 单独成音节（如 ing 要写 ying）；
    //  2. uAsU_umlaut 里的声母（j、q、x）后，映射表键所用的字母（u）一律表示 ü，不能再直接接 u 开头的别的韵母（如 quang）。
    const zeroValues = new Set(Object.values(map.zeroInitial));
    const umlautKeys = Object.keys(map.uAsU_umlaut.map);
    const umlautLetters = new Set(umlautKeys.map((k) => k[0]));
    const maxSyl = Math.max(...[...finalNames].map((f) => f.length)) + Math.max(...initials.map((i) => i.length)) + 1;

    /** 无调的音节串 → {initial, final, zero} 或 null（零声母 = initial 为 null）。 */
    function parseSyllable(plain) {
      if (Object.prototype.hasOwnProperty.call(map.zeroInitial, plain)) return { initial: null, final: map.zeroInitial[plain], zero: true };
      for (const ini of initials) {
        if (!plain.startsWith(ini) || plain.length === ini.length) continue;
        const rest = plain.slice(ini.length);
        let f = rest;
        if (map.uAsU_umlaut.initials.includes(ini) && Object.prototype.hasOwnProperty.call(map.uAsU_umlaut.map, rest)) f = map.uAsU_umlaut.map[rest];
        else if (Object.prototype.hasOwnProperty.call(map.afterInitial, rest)) f = map.afterInitial[rest];
        if (map.uAsU_umlaut.initials.includes(ini) && umlautLetters.has(rest[0]) && !umlautKeys.includes(rest)) continue;
        if (finalNames.has(f)) return { initial: ini, final: f, zero: false };
      }
      if (finalNames.has(plain) && !zeroValues.has(plain)) return { initial: null, final: plain, zero: true };
      return null;
    }

    /** 一段连续字母（含声调标记）的全部合法切分（最多 limit 种）；每个音节至多一个声调标记。 */
    function splits(seg, limit) {
      const out = [];
      const rec = (i, acc) => {
        if (out.length >= limit) return;
        if (i === seg.length) { out.push(acc); return; }
        let plain = '';
        let marks = 0;
        for (let j = i; j < seg.length && j - i < maxSyl; j++) {
          plain += seg[j].base;
          if (seg[j].tone) marks++;
          if (marks > 1) break;
          const p = parseSyllable(plain);
          if (p) rec(j + 1, acc.concat([{ from: i, to: j + 1, plain, parsed: p }]));
        }
      };
      rec(0, []);
      return out;
    }

    /**
     * 解析一段带调拼音。
     * @param {string} text
     * @param {{chars?: string}} [o] chars = 对应的汉字（一字一音节）：用来在多种切分都合法时选出唯一的一种，并核对音节数
     * @returns {{ok:true, words:{syllables:object[]}[], count:number} | {ok:false, reason:string, detail?:string}}
     *   音节 = {raw, plain, tone(0=轻声), initial, final, zero, keepTone}
     */
    function parse(text, o) {
      const chars = o && o.chars != null ? [...String(o.chars)] : null;
      const src = String(text == null ? '' : text).normalize('NFC').toLowerCase();
      if (!src.trim()) return { ok: false, reason: 'empty' };
      // 1. 分词（空格）→ 段（撇号 / 连字符 / 标记处断开）→ 字母
      const words = [];
      let segs = [];
      let cur = [];
      const flushSeg = (keep) => { if (!cur.length) return !keep; segs.push({ letters: cur, keep: !!keep }); cur = []; return true; };
      const flushWord = () => { if (segs.length) { words.push(segs); segs = []; } };
      for (const ch of src) {
        if (/\s/.test(ch)) { flushSeg(false); flushWord(); continue; }
        if (ch === "'" || ch === '-') { flushSeg(false); continue; }
        if (marker && ch === marker) { if (!flushSeg(true)) return { ok: false, reason: 'bad-marker', detail: text }; continue; }
        let base = ch;
        let tone = 0;
        const t = toneOf.get(ch);
        if (t) { base = t.base; tone = t.tone; }
        if (!letters.has(base)) return { ok: false, reason: 'bad-char', detail: ch };
        if (alias.has(base)) base = alias.get(base);
        cur.push({ ch, base, tone });
      }
      flushSeg(false);
      flushWord();
      if (!words.length) return { ok: false, reason: 'empty' };
      // 2. 每段的合法切分
      const allSegs = words.flat();
      const options = allSegs.map((s) => splits(s.letters, 64));
      if (options.some((x) => !x.length)) {
        const k = options.findIndex((x) => !x.length);
        return { ok: false, reason: 'bad-syllable', detail: allSegs[k].letters.map((l) => l.ch).join('') };
      }
      // 3. 选出唯一的整体切分（有汉字时音节总数必须等于字数）
      const found = [];
      const pick = (k, acc, total) => {
        if (found.length > 1) return;
        if (k === options.length) { if (!chars || total === chars.length) found.push(acc); return; }
        for (const sp of options[k]) pick(k + 1, acc.concat([sp]), total + sp.length);
      };
      pick(0, [], 0);
      if (!found.length) return { ok: false, reason: chars ? 'chars-mismatch' : 'bad-syllable', detail: String(text) };
      if (found.length > 1) return { ok: false, reason: 'ambiguous', detail: String(text) };
      // 4. 组装音节
      const choice = found[0];
      let si = 0;
      let count = 0;
      const outWords = words.map((segList) => {
        const syllables = [];
        for (const seg of segList) {
          const sp = choice[si++];
          sp.forEach((syl, idx) => {
            const ls = seg.letters.slice(syl.from, syl.to);
            const tone = ls.reduce((a, l) => a || l.tone, 0);
            syllables.push({
              raw: ls.map((l) => l.ch).join(''), plain: syl.plain, tone,
              initial: syl.parsed.initial, final: syl.parsed.final, zero: syl.parsed.zero,
              keepTone: !!seg.keep && idx === sp.length - 1,
            });
            count++;
          });
        }
        return { syllables };
      });
      return { ok: true, words: outWords, count };
    }

    return { parse, parseSyllable };
  }

  return { checkMap, loadMap, createPinyin };
});
