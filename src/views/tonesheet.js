/**
 * 声调省写速查（全屏，从「学习 → 规则」进入）：把第 10 章「标调」分散在八张规则卡里的内容集中成一页——
 *  按声调列出省写的声母及例外音节（10.2.1–10.2.4）、特定音节（10.2.5、10.2.6）、两条不省写的情况（10.2.7、10.2.8）；
 *  下面可以输入拼音现场查：每个音节标不标调、依据哪一条、写成哪几方。
 * 内容全部取自 rules.json（条文、声母、例外音节、例词），判定由翻盲文引擎给出，这里不写任何规则。
 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});
  const ZERO = '∅';

  Views.tonesheet = function (ctx) {
    const tr = ctx.translator;
    const back = () => ctx.go('learn', {}, { dir: 'back' });
    if (!tr) { ctx.later(back, 0); return { el: h('div', { class: 'page' }) }; }
    const rules = tr.rules.rules;
    const byId = new Map(rules.map((r) => [r.id, r]));
    const typed = (t) => rules.filter((r) => r.apply && r.apply.type === t);
    const toneName = (n) => tr.map.toneNames[String(n)];
    const toneCell = (n) => { const d = tr.toneDots(n); return d ? W.miniCellEl(d, ctx.settings.mirror, { xs: true }) : null; };
    const ruleTag = (id) => h('span', { class: 'cat-tag pg', text: id + (byId.get(id) && byId.get(id).page ? ' · ' + STR.rulePage(byId.get(id).page) : '') });
    const initialText = (x) => (x === ZERO ? STR.toneZeroInitial : x);

    // ---- 按声调：省写的声母 + 例外 ----
    const omit = typed('omitTone');
    const rows = [1, 2, 3, 4].map((tone) => {
      const rs = omit.filter((r) => r.apply.tone === tone);
      const who = rs.length ? rs.map((r) => h('div', { class: 'ts-who' },
        h('span', { class: 'ts-initials', text: r.apply.initials.map(initialText).join('  ') }),
        r.apply.keepSyllables && r.apply.keepSyllables.length ? h('span', { class: 'ts-keep', text: STR.toneKeepExcept(r.apply.keepSyllables.join('、')) }) : null,
        (r.apply.overriddenBy || []).length ? h('span', { class: 'ts-keep', text: STR.toneOverridden(r.apply.overriddenBy.join('、')) }) : null,
        ruleTag(r.id))) : [h('div', { class: 'ts-who' }, h('span', { class: 'ts-always', text: STR.toneAlwaysWrite }))];
      return h('div', { class: 'ts-row' },
        h('div', { class: 'ts-tone' }, toneCell(tone), h('b', { text: toneName(tone) })),
        h('div', { class: 'ts-body' }, ...who));
    });

    // ---- 特定音节（10.2.5、10.2.6）----
    const sylRules = typed('syllableTone').map((r) => h('div', { class: 'ts-syl' },
      h('div', { class: 'ts-syl-head' }, h('b', { text: r.title }), ruleTag(r.id)),
      h('p', { class: 'ts-line', text: STR.toneOmitList(r.apply.omit.join('  ')) }),
      r.apply.keep && r.apply.keep.length ? h('p', { class: 'ts-line keep', text: STR.toneKeepList(r.apply.keep.join('  ')) }) : null));

    // ---- 不省写的两种情况（10.2.7、10.2.8）+ 轻声 ----
    const notes = ['10.2.7', '10.2.8', '10.1.1'].map((id) => byId.get(id)).filter(Boolean).map((r) => h('div', { class: 'ts-note' },
      h('div', { class: 'ts-syl-head' }, h('b', { text: r.title }), ruleTag(r.id)),
      h('p', { class: 'ts-line', text: r.text }),
      r.examples && r.examples.length ? h('p', { class: 'ts-line ex', text: STR.toneExamples(r.examples.slice(0, 3).map((e) => e[0] + ' ' + e[1].replace(/!/g, '')).join('；')) }) : null));

    // ---- 现场查 ----
    const inp = h('input', { class: 'field', type: 'text', placeholder: STR.toneTryHint, 'aria-label': STR.toneTry, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    const out = h('div', { class: 'ts-try-out', role: 'status' });
    const check = () => {
      out.replaceChildren();
      const v = inp.value.normalize('NFC').trim().toLowerCase();
      if (!v) return;
      // 每个词（空格分开）单独解析：用占位汉字告诉解析器有几个音节，从 1 个试到 8 个，取第一个能解析的（避免 xian / xi'an 这类歧义报错）
      const syls = [];
      for (const w of v.split(/\s+/).filter(Boolean)) {
        let r = null;
        for (let n = 1; n <= 8 && !(r && r.ok); n++) { try { r = tr.word(w, '丁'.repeat(n)); } catch (_) { r = null; } }
        if (!r || !r.ok) { out.append(h('p', { class: 'sent-issues', text: STR.toneTryBad + '：' + w })); return; }
        syls.push(...r.syllables);
      }
      const r = { syllables: syls };
      for (const s of r.syllables) {
        const td = s.toneDecision || { write: true, rule: null };
        const why = td.reason === 'neutral' ? STR.toneWhyNeutral : td.write ? STR.toneWhyWrite : STR.toneWhyOmit;
        out.append(h('div', { class: 'ts-try-row' },
          h('b', { class: 'ts-try-syl', text: s.raw }),
          W.seqStripEl(s.cells.map((c) => c.dots), ctx.settings.mirror, { xs: true }),
          h('span', { class: 'ts-try-why' + (td.write ? '' : ' omit'), text: why }),
          td.rule ? ruleTag(td.rule) : null));
      }
    };
    inp.addEventListener('input', check);

    const practiceBtn = ctx.ruleData && root.BMRuleRound.availableTypes(ctx.ruleData).includes('judge')
      ? W.btn(STR.toneGoPractice, () => { ctx.ruleQtype = 'judge'; ctx.module = 'rules'; ctx.wordSource = 'std'; ctx.go('ruleround', { mode: 'practice' }); }, { variant: 'tonal', icon: ICON.play() })
      : null;

    const el = h('div', { class: 'page tonesheet-page' },
      W.topBar(C.backBtn(back), h('h1', { text: STR.toneTitle }), null),
      h('div', { class: 'page-body' },
        h('p', { class: 'text-hint', text: STR.toneIntro }),
        h('section', { class: 'ts-card' }, h('h3', { class: 'ts-h', text: STR.toneByInitial }), ...rows),
        h('section', { class: 'ts-card' }, h('h3', { class: 'ts-h', text: STR.toneBySyllable }), ...sylRules),
        h('section', { class: 'ts-card' }, h('h3', { class: 'ts-h', text: STR.toneNotOmit }), ...notes),
        h('section', { class: 'ts-card' }, h('h3', { class: 'ts-h', text: STR.toneTry }), inp, out),
        practiceBtn ? h('div', { class: 'ta-actions' }, practiceBtn) : null));
    return { el, onKey: (e) => { if (e.key === 'Escape') { back(); return true; } return false; } };
  };
})(typeof self !== 'undefined' ? self : this);
