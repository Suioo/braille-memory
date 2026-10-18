/**
 * 规则 / 词句题目库（纯逻辑）：由 rules.json 的例词与翻盲文引擎推出，不手写任何点位、规则或拼音。
 *  - words    词句：每个可翻译的例词 = 汉字 + 拼音 + 引擎给出的盲方序列（空方为 []）
 *  - judge    规则判断：按规则的 apply 由引擎判定正反例
 *               tone     该音节的声调符号写不写（省写规则 omitTone / syllableTone / disableRules / manualKeepTone 的例词）
 *               contract 该字简写不简写（简写 contraction / 11.2 blockContraction 的例词）
 *             只有数据能支撑（正反例都有、足够多）的题型才算可用，否则整类隐藏
 *  - cards    规则卡：每条规则一张（例词取自 examples，没有则取 forms）
 * 每个题目有稳定的 key 与内容签名 sig（规则数据一改，旧进度自动作废）。
 * 渲染进程：window.BMRuleItems；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rules.js'), require('./pick.js'), require('./seq.js'));
  else root.BMRuleItems = factory(root.BMRules, root.BMPick, root.BMSeq);
})(typeof self !== 'undefined' ? self : this, function (Rules, Pick, Seq) {
  'use strict';

  const TONE_TYPES = ['omitTone', 'syllableTone', 'disableRules', 'manualKeepTone'];
  const CONTRACT_TYPES = ['contraction', 'blockContraction'];
  /** 一类判断题至少要有这么多题，且正反例都有，才算「数据能支撑」。 */
  const MIN_JUDGE = 4;

  const cellsKey = (cells) => cells.map((d) => (d.length ? d.join('') : '_')).join(' ');

  /**
   * @param {{rules: object, translator: object}} o rules = parseRules 的结果；translator = createTranslator 的结果（ok）
   */
  function build(o) {
    const { rules, translator } = o;
    const marker = translator.marker;
    const words = [];
    const seen = new Set();
    for (const r of rules.rules) {
      (r.examples || []).forEach((e, idx) => {
        if ((e[2] || '').includes(Rules.UNSUPPORTED_MARK)) return;
        const dupe = e[0] + '|' + e[1];
        if (seen.has(dupe)) return;
        const res = translator.word(e[1], e[0]);
        if (!res.ok) return;
        seen.add(dupe);
        const cells = res.cells.map((c) => c.dots.slice());
        const key = 'w:' + r.id + '#' + idx;
        words.push({
          id: key, key, ruleId: r.id, chars: e[0], pinyin: e[1], display: marker ? e[1].split(marker).join('') : e[1], note: e[2] || '',
          result: res, cells, cellsText: cellsKey(cells), sig: e[0] + '|' + e[1] + '|' + cellsKey(cells),
        });
      });
    }

    const judge = [];
    const typesOf = (ids) => new Set(ids.flatMap((t) => (rules.byType.get(t) || []).map((r) => r.id)));
    const toneRules = typesOf(TONE_TYPES);
    const contractRules = typesOf(CONTRACT_TYPES);
    const contractRule = (rules.byType.get('contraction') || [])[0];
    const blockRule = (rules.byType.get('blockContraction') || [])[0];
    for (const w of words) {
      w.result.syllables.forEach((s, k) => {
        const kinds = s.cells.map((c) => c.kind);
        const special = kinds.some((x) => x === 'contraction' || x === 'special');
        if (toneRules.has(w.ruleId) && s.tone && !special && s.toneDecision) {
          const why = [s.toneDecision.rule].concat(s.notes.filter((n) => n.what === 'disabled').map((n) => n.rule)).filter(Boolean);
          const answer = s.toneDecision.write;
          judge.push({ id: 'j:t:' + w.key + '.' + k, key: 'j:t:' + w.key + '.' + k, family: 'tone', word: w, syllable: k, raw: s.raw, answer, rules: [...new Set(why)],
            sig: w.sig + '|' + k + '|' + answer });
        }
        if (contractRules.has(w.ruleId) && s.char != null) {
          const contracted = kinds.length > 0 && kinds.every((x) => x === 'contraction');
          const blocked = s.notes.some((n) => n.what === 'contractionBlocked');
          if (contracted || blocked) {
            const why = contracted ? [contractRule && contractRule.id] : [blockRule && blockRule.id, contractRule && contractRule.id];
            judge.push({ id: 'j:c:' + w.key + '.' + k, key: 'j:c:' + w.key + '.' + k, family: 'contract', word: w, syllable: k, raw: s.raw, char: s.char, answer: contracted,
              rules: why.filter(Boolean), sig: w.sig + '|' + k + '|' + contracted });
          }
        }
      });
    }
    const families = {};
    for (const f of ['tone', 'contract']) {
      const list = judge.filter((x) => x.family === f);
      families[f] = list.length >= MIN_JUDGE && list.some((x) => x.answer) && list.some((x) => !x.answer);
    }
    const judgeUsable = judge.filter((x) => families[x.family]);

    const cards = rules.rules.map((r) => {
      let example = null;
      const w = words.find((x) => x.ruleId === r.id);
      if (w) example = { chars: w.chars, pinyin: w.display, cells: w.cells };
      else {
        const f = rules.forms.find((x) => x.rule === r.id);
        if (f) example = { chars: f.word, pinyin: f.pinyin, cells: f.dots };
      }
      return { key: 'c:' + r.id, id: r.id, rule: r, example };
    });
    const cats = [];
    for (const c of cards) { const hit = cats.find((x) => x.name === c.rule.cat); if (hit) hit.count++; else cats.push({ name: c.rule.cat, count: 1 }); }

    const all = words.concat(judgeUsable);
    return {
      words, judge: judgeUsable, judgeAll: judge, families, cards, cats,
      byKey: new Map(all.map((x) => [x.key, x])),
      /** 进度清洗用：{key, sig} 清单。 */
      entries: all.map((x) => ({ key: x.key, sig: x.sig })),
      rule: (id) => rules.byId.get(id),
    };
  }

  /** 第一个不同的方（0 起；全相同返回 -1）。两边都是各方点位数组，空方为 []。 */
  function firstDiff(expected, answer) {
    const n = Math.max(expected.length, answer.length);
    for (let i = 0; i < n; i++) {
      const a = expected[i];
      const b = answer[i];
      if (!a || !b || a.join('') !== b.join('')) return i;
    }
    return -1;
  }

  /**
   * 指出第一个出错的方来自哪条规则（或哪张字表）。
   * @param {{cells:object[], syllables:object[]}} result 标准答案（translator 的结果）
   * @param {number[][]} answer 作答的各方（空方为 []）
   * @param {object} translator
   * @returns {null|{index:number, kind:string, syllable:string|null, rules:string[], hint:string|null, expected:number[]|null}}
   *   kind = 标准答案这一方的类别（initial / final / tone / contraction / special / space，或作答多出来的 extra）；
   *   hint = toneShouldOmit（多写了应省写的声调）| toneMissing（漏写了应写的声调）| null
   */
  function explain(result, answer, translator) {
    const i = firstDiff(result.cells.map((c) => c.dots), answer);
    if (i < 0) return null;
    const e = result.cells[i];
    const user = answer[i] || [];
    const prev = i > 0 ? result.cells[i - 1] : null;
    const ps = prev && prev.syllable >= 0 ? result.syllables[prev.syllable] : null;
    // 多写了应省写的声调（这一方在标准答案里是下一个音节，或已经没有了）
    if (ps && ps.tone && ps.toneDecision && !ps.toneDecision.write && user.join('') === translator.toneDots(ps.tone).join('')) {
      return { index: i, kind: e ? e.kind : 'extra', syllable: ps.raw, rules: [ps.toneDecision.rule], hint: 'toneShouldOmit', expected: e ? e.dots.slice() : null };
    }
    if (!e) return { index: i, kind: 'extra', syllable: null, rules: [], hint: null, expected: null };
    const s = e.syllable >= 0 ? result.syllables[e.syllable] : null;
    let rules = [];
    let hint = null;
    if (e.rule) rules.push(e.rule);
    if (s) for (const n of s.notes) if (n.rule) rules.push(n.rule);
    if (s && e.kind === 'tone' && s.toneDecision) rules.push(s.toneDecision.rule);
    // 漏写了应写的声调（作答的这一方正好是标准答案的下一方）
    if (e.kind === 'tone' && answer[i] && result.cells[i + 1] && answer[i].join('') === result.cells[i + 1].dots.join('')) hint = 'toneMissing';
    return { index: i, kind: e.kind, syllable: s ? s.raw : null, rules: [...new Set(rules)], hint, expected: e.dots.slice() };
  }

  /**
   * 「盲文读词」的选项：目标 + 其他例词；点位序列两两不同、显示文字两两不同；优先取长度相近的。
   * @param {object[]} words
   * @param {object} target
   * @param {'chars'|'pinyin'} ask 选项显示汉字还是拼音
   * @returns {{key:string, text:string, word:object}[]|null} 凑不出 2 个选项返回 null
   */
  function readOptions(words, target, ask, rng, n) {
    const text = (w) => (ask === 'chars' ? w.chars : w.display);
    const used = new Set([target.cellsText]);
    const shown = new Set([text(target)]);
    const pool = Pick.shuffle(words.filter((w) => w.key !== target.key), rng)
      .sort((a, b) => Math.abs(a.cells.length - target.cells.length) - Math.abs(b.cells.length - target.cells.length));
    const chosen = [];
    for (const w of pool) {
      if (chosen.length >= n - 1) break;
      if (used.has(w.cellsText) || shown.has(text(w))) continue;
      used.add(w.cellsText);
      shown.add(text(w));
      chosen.push(w);
    }
    if (!chosen.length) return null;
    chosen.splice(Math.floor(rng() * (chosen.length + 1)), 0, target);
    return chosen.map((w) => ({ key: w.key, text: text(w), word: w }));
  }

  /** 逐方判分（空方为 []）：沿用多方符号的判分。 */
  const judgeCells = (expected, answer) => Seq.judgeSeq(expected, answer);

  return { TONE_TYPES, CONTRACT_TYPES, MIN_JUDGE, build, firstDiff, explain, readOptions, judgeCells, cellsKey };
});
