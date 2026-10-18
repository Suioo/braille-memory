/**
 * 规则数据（data/rules.json）的载入与校验（纯函数）。
 * 规则、简写形式、例词只来自 rules.json；本文件不含任何规则内容、拼音或点位，只检查结构。
 * 引擎只执行带 apply 字段、且 apply.type 已知的规则。
 * 渲染进程：window.BMRules；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMRules = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 例词说明里含此标记的，引擎暂不支持，自检时跳过。 */
  const UNSUPPORTED_MARK = '暂不支持';

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const isStr = (v) => typeof v === 'string' && v.length > 0;
  const isStrArr = (v) => Array.isArray(v) && v.length > 0 && v.every(isStr);

  /** "2345" → [2,3,4,5]；非法（不是 1–6 的不重复点位）返回 null。 */
  function dotsOf(text) {
    if (typeof text !== 'string' || !/^[1-6]{1,6}$/.test(text) || new Set(text).size !== text.length) return null;
    return text.split('').map(Number).sort((a, b) => a - b);
  }

  /**
   * 各 apply.type 的结构校验。返回错误描述数组（空 = 通过）。
   * @param {object} apply
   * @param {object} rule 整条规则（forms 等）
   * @param {Set<string>} ids 全部规则编号
   */
  const APPLY = {
    syllableOrder: (a) => (isStrArr(a.order) ? [] : ['order']),
    apical: (a) => [].concat(isStrArr(a.syllables) ? [] : ['syllables'], isStr(a.dropFinal) ? [] : ['dropFinal']),
    zeroInitial: () => [],
    specialForm: (a, r) => [].concat(isStrArr(a.chars) ? [] : ['chars'], a.useForms === true ? [] : ['useForms'],
      isStrArr(a.chars) && !a.chars.every((c) => (r.forms || []).some((f) => f.word === c)) ? ['chars-without-forms'] : []),
    toneEverySyllable: (a) => (a.neutralTone === 'none' ? [] : ['neutralTone']),
    baseTone: () => [],
    omitTone: (a, r, ids) => [].concat(
      Number.isInteger(a.tone) && a.tone >= 1 && a.tone <= 4 ? [] : ['tone'],
      isStrArr(a.initials) ? [] : ['initials'],
      a.keepSyllables === undefined || isStrArr(a.keepSyllables) ? [] : ['keepSyllables'],
      a.overriddenBy === undefined || (isStrArr(a.overriddenBy) && a.overriddenBy.every((i) => ids.has(i))) ? [] : ['overriddenBy']),
    syllableTone: (a) => [].concat(
      Array.isArray(a.omit) && a.omit.every(isStr) ? [] : ['omit'], Array.isArray(a.keep) && a.keep.every(isStr) ? [] : ['keep'],
      Array.isArray(a.omit) && Array.isArray(a.keep) && a.omit.length + a.keep.length > 0 ? [] : ['empty']),
    disableRules: (a, r, ids) => [].concat(
      isObj(a.when) && a.when.this === 'apical' && a.when.nextInWord === 'zeroInitial' ? [] : ['when'],
      isStrArr(a.disable) && a.disable.every((i) => ids.has(i)) ? [] : ['disable']),
    manualKeepTone: (a) => (isStr(a.marker) && [...a.marker].length === 1 ? [] : ['marker']),
    contraction: (a, r) => [].concat(a.byChar === true ? [] : ['byChar'], a.useForms === true ? [] : ['useForms'],
      Array.isArray(r.forms) && r.forms.length ? [] : ['forms'], (r.forms || []).every((f) => [...f.word].length === 1) ? [] : ['form-word-not-single-char']),
    blockContraction: (a) => [].concat(isStrArr(a.chars) ? [] : ['chars'], isObj(a.when) && a.when.nextInWord === 'zeroInitial' ? [] : ['when']),
    info: () => [],
    segmentation: () => [],
  };
  const TYPES = Object.keys(APPLY);

  /**
   * 解析并校验规则数据。
   * @param {string} text rules.json 全文
   * @returns {{ok:boolean, errors:string[], warnings:string[], version?:number, rules:object[], byId:Map<string,object>,
   *            byType:Map<string,object[]>, forms:{rule:string, word:string, pinyin:string, dots:number[][]}[]}}
   */
  function parseRules(text) {
    const errors = [];
    const warnings = [];
    const out = { ok: false, errors, warnings, rules: [], byId: new Map(), byType: new Map(), forms: [] };
    let raw;
    try { raw = JSON.parse(String(text)); } catch (_) { errors.push('json'); return out; }
    if (!isObj(raw)) { errors.push('not-object'); return out; }
    if (!Number.isInteger(raw.version)) errors.push('version');
    if (!Array.isArray(raw.rules) || !raw.rules.length) { errors.push('rules'); return out; }
    out.version = raw.version;
    const ids = new Set(raw.rules.map((r) => (isObj(r) ? r.id : undefined)).filter(isStr));
    const seen = new Set();
    for (const r of raw.rules) {
      if (!isObj(r) || !isStr(r.id)) { errors.push('bad-rule'); continue; }
      const id = r.id;
      if (seen.has(id)) { errors.push('dup-id:' + id); continue; }
      seen.add(id);
      if (!isStr(r.cat)) errors.push('cat:' + id);
      if (!(typeof r.page === 'number' || isStr(r.page))) errors.push('page:' + id);
      if (!isStr(r.text)) errors.push('text:' + id);
      if (r.note !== undefined && typeof r.note !== 'string') errors.push('note:' + id);
      // forms：点位只来自 rules.json（每方一个点位字符串）
      if (r.forms !== undefined) {
        if (!Array.isArray(r.forms)) errors.push('forms:' + id);
        else for (const f of r.forms) {
          const dots = isObj(f) && isStr(f.word) && isStr(f.pinyin) && Array.isArray(f.dots) && f.dots.length ? f.dots.map(dotsOf) : null;
          if (!dots || dots.some((d) => !d)) { errors.push('bad-form:' + id + (isObj(f) ? '#' + f.word : '')); continue; }
          out.forms.push({ rule: id, word: f.word, pinyin: f.pinyin, dots });
        }
      }
      if (r.examples !== undefined) {
        if (!Array.isArray(r.examples)) errors.push('examples:' + id);
        else r.examples.forEach((e, i) => {
          if (!Array.isArray(e) || e.length < 2 || e.length > 3 || !isStr(e[0]) || !isStr(e[1]) || (e[2] !== undefined && typeof e[2] !== 'string')) errors.push('bad-example:' + id + '#' + i);
        });
      }
      if (r.apply === undefined) { warnings.push('no-apply:' + id); out.rules.push(r); out.byId.set(id, r); continue; }
      if (!isObj(r.apply) || !isStr(r.apply.type)) { errors.push('bad-apply:' + id); continue; }
      if (!TYPES.includes(r.apply.type)) { errors.push('unknown-apply:' + id + ':' + r.apply.type); continue; }
      const bad = APPLY[r.apply.type](r.apply, r, ids);
      for (const b of bad) errors.push('apply-' + r.apply.type + ':' + id + ':' + b);
      out.rules.push(r);
      out.byId.set(id, r);
      if (!out.byType.has(r.apply.type)) out.byType.set(r.apply.type, []);
      out.byType.get(r.apply.type).push(r);
    }
    out.ok = errors.length === 0;
    return out;
  }

  /**
   * 载入规则数据。text 为 null = 文件不存在（规则相关入口整体隐藏，不算错误）。
   * @returns {{ok:boolean, missing?:boolean, errors:string[], warnings:string[], rules?:object}}
   */
  function loadRules(text) {
    if (text == null) return { ok: false, missing: true, errors: [], warnings: [] };
    const res = parseRules(text);
    return { ok: res.ok, errors: res.errors, warnings: res.warnings, rules: res.ok ? res : undefined };
  }

  return { UNSUPPORTED_MARK, TYPES, dotsOf, parseRules, loadRules };
});
