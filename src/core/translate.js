/**
 * 翻盲文引擎（纯逻辑）：带调拼音 + 汉字 + 分词 → 盲方序列。
 *
 * 一切内容来自数据，代码里没有拼音常量、没有点位、没有规则内容：
 *  - 点位：data/braille_table.csv（声母 / 韵母 / 声调 / 标点）与 data/braille_extra.csv（数号、数字、扩展标点）
 *  - 拼音拆分与还原：data/pinyin_map.json
 *  - 省写、简写及其例外、声母自成音节：data/rules.json 里带 apply 字段的规则（apply.type 见 rules.js）；简写 / 特殊形式的点位取自规则的 forms
 *  - 声母 / 韵母 / 声调各对应字表的哪个类别：由拼音还原表里的名字在字表中的覆盖情况推出，不手写类别名
 * 每个盲方都带来源（表 / 规则编号），供「错在哪条规则」使用。规则覆盖不了的输入返回 {ok:false, reason}，绝不猜。
 * 渲染进程：window.BMTranslate；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pinyin.js'));
  else root.BMTranslate = factory(root.BMPinyin);
})(typeof self !== 'undefined' ? self : this, function (Pinyin) {
  'use strict';

  /** 引擎需要这些规则类型都在（缺一个就会悄悄偏离规则，所以直接拒绝创建）。 */
  const REQUIRED_TYPES = ['syllableOrder', 'apical', 'zeroInitial', 'toneEverySyllable', 'omitTone', 'syllableTone', 'disableRules',
    'manualKeepTone', 'contraction', 'blockContraction', 'specialForm'];
  const ZERO_KEY = '∅'; // 规则里表示零声母的写法（rules.json conventions）

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  /**
   * @param {object} o
   * @param {object[]} o.table 主字表（parseTable 的 rows）
   * @param {object[]} [o.extra] 扩展符号表（parseExtra 的 rows）
   * @param {object} o.rules parseRules 的结果（ok）
   * @param {object} o.map 拼音还原表（loadMap 的 map）
   * @returns {{ok:true, translate:Function, word:Function, parse:Function, ...}|{ok:false, errors:string[]}}
   */
  function createTranslator(o) {
    const errors = [];
    const { table, rules, map } = o;
    const extra = o.extra || [];
    const types = (t) => (rules.byType.get(t) || []);
    for (const t of REQUIRED_TYPES) if (!types(t).length) errors.push('missing-rule-type:' + t);
    if (errors.length) return { ok: false, errors };

    // ---------- 字表索引 ----------
    const bySymbol = new Map(); // symbol → {cells:number[][], table:'main'|'extra'}
    for (const r of table) bySymbol.set(r.symbol, { cells: [r.dots], where: 'main', category: r.category });
    for (const r of extra) if (!bySymbol.has(r.symbol)) bySymbol.set(r.symbol, { cells: r.cells, where: 'extra', category: r.category });
    const symbolsOf = (cat) => new Set(table.filter((r) => r.category === cat).map((r) => r.symbol));
    const cats = [...new Set(table.map((r) => r.category))];
    const initAlias = (n) => (has(map.initialAliases, n) ? map.initialAliases[n] : n);
    const finAlias = (n) => (has(map.finalAliases, n) ? map.finalAliases[n] : n);

    // 声母 / 韵母 / 声调各对应哪个类别：由还原表里的名字在字表中的覆盖情况推出
    const only = (label, pred) => {
      const hit = cats.filter(pred);
      if (hit.length !== 1) { errors.push('category:' + label + ':' + hit.length); return null; }
      return hit[0];
    };
    const toneCat = only('tone', (c) => Object.values(map.toneNames).every((n) => symbolsOf(c).has(n)));
    const initCat = only('initial', (c) => map.initialsLongestFirst.every((n) => symbolsOf(c).has(initAlias(n))));
    const finalValues = [...Object.values(map.zeroInitial), ...Object.values(map.afterInitial), ...Object.values(map.uAsU_umlaut.map)];
    const finCat = only('final', (c) => finalValues.every((n) => symbolsOf(c).has(finAlias(n))));
    if (errors.length) return { ok: false, errors };
    const finalSyms = symbolsOf(finCat);
    const aliasTargets = new Set(Object.values(map.finalAliases));
    const finalNames = new Set([...finalSyms].filter((s) => !aliasTargets.has(s)).concat(Object.keys(map.finalAliases)));
    const catOf = { initial: initCat, final: finCat, tone: toneCat };

    // ---------- 规则编译 ----------
    const order = types('syllableOrder')[0].apply.order;
    if (!order.every((r) => has(catOf, r)) || new Set(order).size !== order.length) errors.push('syllableOrder');
    const apicalRule = types('apical')[0];
    const apical = new Set(apicalRule.apply.syllables);
    const dropFinal = apicalRule.apply.dropFinal;
    const manual = types('manualKeepTone')[0];
    const marker = manual.apply.marker;
    const toneRule = types('toneEverySyllable')[0];
    const omitRules = types('omitTone').map((r) => ({ id: r.id, tone: r.apply.tone, initials: new Set(r.apply.initials), keep: new Set(r.apply.keepSyllables || []) }));
    const sylRules = types('syllableTone').map((r) => ({ id: r.id, omit: new Set(r.apply.omit), keep: new Set(r.apply.keep) }));
    const disableRules = types('disableRules').map((r) => ({ id: r.id, disable: new Set(r.apply.disable) }));
    const contraction = types('contraction')[0];
    const block = types('blockContraction')[0];
    const special = types('specialForm')[0];
    const formsOf = (rule) => new Map(rules.forms.filter((f) => f.rule === rule.id).map((f) => [f.word, f]));
    const contractForms = formsOf(contraction);
    const specialForms = formsOf(special);
    const blockChars = new Set(block.apply.chars);
    const needChars = new Set([...contractForms.values(), ...specialForms.values()].map((f) => f.pinyin.normalize('NFC')));
    if (errors.length) return { ok: false, errors };

    const py = Pinyin.createPinyin(map, finalNames, { marker });

    const rowCells = (role, name) => {
      const sym = role === 'initial' ? initAlias(name) : role === 'final' ? finAlias(name) : name;
      const e = bySymbol.get(sym);
      if (!e || e.category !== catOf[role] || e.where !== 'main') return null;
      return e.cells[0];
    };

    /** 音节 → 盲方与追踪。next = 同一词里的下一个音节（没有则 null）。 */
    function syllable(syl, next, ch) {
      const trace = { raw: syl.raw, initial: syl.initial, final: syl.final, tone: syl.tone, notes: [] };
      const cell = (dots, kind, rule) => ({ dots: dots.slice(), kind, rule: rule || null });
      // ---- 简写 / 特殊形式（按汉字判断；汉字与拼音都对得上才用）----
      if (ch == null && needChars.has(syl.raw.normalize('NFC'))) return { ok: false, reason: 'need-chars', detail: syl.raw };
      if (ch != null) {
        const c = contractForms.get(ch);
        const s = specialForms.get(ch);
        const hit = (f) => f && f.pinyin.normalize('NFC') === syl.raw.normalize('NFC');
        const blocked = blockChars.has(ch) && !!next && next.zero;
        if (hit(c) && !blocked) { trace.cells = c.dots.map((d) => cell(d, 'contraction', contraction.id)); return { ok: true, trace }; }
        if (blocked && hit(c)) trace.notes.push({ rule: block.id, what: 'contractionBlocked' });
        if (hit(s) && (blocked || !hit(c))) { trace.cells = s.dots.map((d) => cell(d, 'special', special.id)); return { ok: true, trace }; }
      }
      // ---- 声调写不写 ----
      const isApical = apical.has(syl.plain);
      const tone = decideTone(syl, next, isApical, trace);
      // ---- 按 syllableOrder 排各方 ----
      const cells = [];
      for (const role of order) {
        if (role === 'initial') {
          if (syl.initial == null) continue;
          const d = rowCells('initial', syl.initial);
          if (!d) return { ok: false, reason: 'no-symbol', detail: 'initial:' + syl.initial };
          cells.push(cell(d, 'initial', null));
        } else if (role === 'final') {
          if (isApical) {
            if (syl.final !== dropFinal) return { ok: false, reason: 'apical-final', detail: syl.raw };
            trace.notes.push({ rule: apicalRule.id, what: 'finalDropped' });
            continue;
          }
          const d = rowCells('final', syl.final);
          if (!d) return { ok: false, reason: 'no-symbol', detail: 'final:' + syl.final };
          cells.push(cell(d, 'final', null));
        } else if (role === 'tone' && tone.write) {
          const d = rowCells('tone', map.toneNames[String(syl.tone)]);
          if (!d) return { ok: false, reason: 'no-symbol', detail: 'tone:' + syl.tone };
          cells.push(cell(d, 'tone', tone.rule));
        }
      }
      trace.cells = cells;
      trace.toneDecision = tone;
      return { ok: true, trace };
    }

    /** 声调：{write, rule, reason}。优先级：人工标记 > 逐音节规则 > 按声母省写（可被 disableRules 关掉）> 默认标调。 */
    function decideTone(syl, next, isApical, trace) {
      if (syl.tone === 0) return { write: false, rule: toneRule.id, reason: 'neutral' };
      if (syl.keepTone) return { write: true, rule: manual.id, reason: 'manualKeep' };
      const raw = syl.raw.normalize('NFC');
      for (const r of sylRules) {
        if (r.omit.has(raw)) return { write: false, rule: r.id, reason: 'omitSyllable' };
        if (r.keep.has(raw)) return { write: true, rule: r.id, reason: 'keepSyllable' };
      }
      const disabled = new Set();
      for (const r of disableRules) {
        if (isApical && next && next.zero) { for (const id of r.disable) disabled.add(id); trace.notes.push({ rule: r.id, what: 'disabled', ids: [...r.disable] }); }
      }
      const key = syl.initial == null ? ZERO_KEY : syl.initial;
      for (const r of omitRules) {
        if (disabled.has(r.id)) continue;
        if (r.tone === syl.tone && r.initials.has(key) && !r.keep.has(raw)) return { write: false, rule: r.id, reason: 'omitInitial' };
        if (r.tone === syl.tone && r.initials.has(key) && r.keep.has(raw)) return { write: true, rule: r.id, reason: 'keepSyllable' };
      }
      return { write: true, rule: toneRule.id, reason: 'default' };
    }

    /** 标点：字符 → 符号名（还原表）→ 字表里的点位。 */
    function punct(chr) {
      if (chr === 'note' || !has(map.punctuation, chr)) return { ok: false, reason: 'no-punct', detail: chr };
      const e = bySymbol.get(map.punctuation[chr]);
      if (!e) return { ok: false, reason: 'no-symbol', detail: map.punctuation[chr] };
      return { ok: true, cells: e.cells.map((d) => ({ dots: d.slice(), kind: 'punct', rule: null })) };
    }

    /** 数：一个数（多位数整体）前只加一个数号；各位数字取数字行去掉数号后的各方。 */
    function number(text) {
      if (!/^[0-9]+$/.test(text)) return { ok: false, reason: 'bad-number', detail: text };
      const sign = bySymbol.get(map.numbers.sign);
      if (!sign || sign.cells.length !== 1) return { ok: false, reason: 'no-symbol', detail: map.numbers.sign };
      const cells = [{ dots: sign.cells[0].slice(), kind: 'numberSign', rule: null }];
      for (const dgt of text) {
        const e = bySymbol.get(dgt);
        if (!e || e.where !== 'extra' || e.cells.length < 2 || e.cells[0].join('') !== sign.cells[0].join('')) return { ok: false, reason: 'no-symbol', detail: dgt };
        for (const d of e.cells.slice(1)) cells.push({ dots: d.slice(), kind: 'digit', rule: null });
      }
      return { ok: true, cells };
    }

    /**
     * 翻译一串记号。
     * @param {({type:'text', pinyin:string, chars?:string}|{type:'punct', char:string}|{type:'number', text:string}|{type:'blank'})[]} tokens
     *   text：带调拼音（空格 = 分写，即词间空一方）+ 对应汉字（一字一音节）；blank：显式空方（标点前后是否空方由句子数据给出）
     * @returns {{ok:true, cells:{dots:number[], kind:string, rule:string|null, syllable:number}[], syllables:object[]}
     *          |{ok:false, reason:string, detail?:string, token:number}}
     */
    function translate(tokens) {
      const cells = [];
      const syllables = [];
      for (let ti = 0; ti < tokens.length; ti++) {
        const t = tokens[ti];
        const fail = (r) => Object.assign({ ok: false, token: ti }, { reason: r.reason, detail: r.detail });
        if (t.type === 'blank') { cells.push({ dots: [], kind: 'space', rule: null, syllable: -1 }); continue; }
        if (t.type === 'punct') { const r = punct(t.char); if (!r.ok) return fail(r); r.cells.forEach((c) => cells.push(Object.assign(c, { syllable: -1 }))); continue; }
        if (t.type === 'number') { const r = number(t.text); if (!r.ok) return fail(r); r.cells.forEach((c) => cells.push(Object.assign(c, { syllable: -1 }))); continue; }
        if (t.type !== 'text') return fail({ reason: 'bad-token', detail: String(t.type) });
        const parsed = py.parse(t.pinyin, { chars: t.chars });
        if (!parsed.ok) return fail(parsed);
        const chars = t.chars != null ? [...t.chars] : null;
        let gi = 0;
        for (let wi = 0; wi < parsed.words.length; wi++) {
          if (wi > 0) cells.push({ dots: [], kind: 'space', rule: null, syllable: -1 });
          const sy = parsed.words[wi].syllables;
          for (let k = 0; k < sy.length; k++) {
            const r = syllable(sy[k], sy[k + 1] || null, chars ? chars[gi] : null);
            if (!r.ok) return fail(r);
            const idx = syllables.length;
            r.trace.char = chars ? chars[gi] : null;
            syllables.push(r.trace);
            for (const c of r.trace.cells) cells.push(Object.assign({}, c, { syllable: idx }));
            gi++;
          }
        }
      }
      return { ok: true, cells, syllables };
    }

    /** 单个词（或空格分词的一段）的便捷入口。 */
    const word = (pinyin, chars) => translate([{ type: 'text', pinyin, chars }]);

    return { ok: true, translate, word, parse: py.parse, categories: catOf, finalNames, marker, ruleIds: rules.rules.map((r) => r.id) };
  }

  return { REQUIRED_TYPES, createTranslator };
});
