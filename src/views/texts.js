/**
 * 「练习 → 文本」：自定义文本的练习入口、文本列表、添加面板。由 practice.js 在选了「文本」时挂载。 window.BMTextViews
 * 文本与进度只在本机；盲文一律由翻盲文引擎按规则算出，这里只管界面。拼音 / 分词来自拼音库（自动标注，可能有误），逐句在「详情」里核对。
 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const P = root.BMProgress;
  const TV = (root.BMTextViews = {});

  const clip = (s, n) => { const a = Array.from(s); return a.length > n ? a.slice(0, n).join('') + '…' : s; };

  /** 文本框（原生 input / textarea，带标签）。 */
  const field = (tag, label, attrs) => h(tag, Object.assign({ class: 'field', 'aria-label': label, placeholder: label, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' }, attrs));

  const p2 = (n) => String(n).padStart(2, '0');
  const when = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : (d.getMonth() + 1) + '/' + d.getDate() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes()); };
  const num = (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));

  /** 迷你折线（每分钟方数，旧 → 新）；一个点时只画点。 */
  function sparkline(vals) {
    const { s } = root.BMDom;
    const w = 120; const hgt = 32; const pad = 4;
    const lo = Math.min(...vals); const hi = Math.max(...vals);
    const x = (i) => (vals.length === 1 ? w / 2 : pad + (i * (w - 2 * pad)) / (vals.length - 1));
    const y = (v) => (hi === lo ? hgt / 2 : hgt - pad - ((v - lo) * (hgt - 2 * pad)) / (hi - lo));
    const pts = vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
    return s('svg', { class: 'spark', viewBox: '0 0 ' + w + ' ' + hgt, role: 'img', 'aria-label': STR.a11yTrend(vals.map(num)) },
      vals.length > 1 ? s('polyline', { points: pts, fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }) : null,
      s('circle', { cx: x(vals.length - 1).toFixed(1), cy: y(vals[vals.length - 1]).toFixed(1), r: '3', fill: 'currentColor' }));
  }

  /**
   * 某篇文本的计时成绩：最佳、最高正确率、最近几次（数字 + 迷你折线）。默认折叠。
   * 数据来自 progress.texts.runs；没有成绩时只给一句说明。
   */
  TV.statsEl = function (ctx, textId, o) {
    const S = root.BMTextStats;
    const r = root.BMProgress.textRuns(ctx.progress, textId);
    const kids = [];
    let head = STR.textStatsTitle;
    if (!r || !r.recent.length) kids.push(h('p', { class: 'text-hint', text: STR.textStatsNone }));
    else {
      kids.push(h('p', { class: 'stat-best num', text: r.best ? STR.textStatsBest(num(r.best.cpm), r.best.acc) : STR.textStatsBestNone }));
      kids.push(h('p', { class: 'text-hint', text: STR.textStatsBestAcc(r.bestAcc) }));
      kids.push(h('div', { class: 'spark-row' }, h('span', { class: 'opt-label', text: STR.textStatsRecent }), sparkline(S.trend(r))));
      kids.push(h('ol', { class: 'run-list' }, ...r.recent.slice().reverse().map((run) => {
        const m = S.metrics(run);
        return h('li', { class: 'num', text: STR.textStatsRun(when(run.at), Math.round(m.acc * 100), num(m.cpm), num(m.secPerCell), num(m.totalSec)) });
      })));
      if (r.best) head = STR.textStatsTitle + ' · ' + num(r.best.cpm) + ' ' + STR.textCpm;
    }
    return W.collapse({ title: head, cls: 'text-stats' + (o && o.cls ? ' ' + o.cls : ''), open: false }, ...kids);
  };

  /** 删除一篇文本和它的练习记录。 */
  function deleteText(ctx, id) {
    ctx.setTexts(root.BMTexts.removeText(ctx.texts, id));
    P.removeTextProgress(ctx.progress, id);
    if (ctx.textScope === id) ctx.textScope = 'all';
    ctx.saveTexts();
    ctx.save();
  }

  TV.practice = function (ctx) {
    const S = ctx.settings;
    const T = root.BMTexts;
    const scopeOk = () => ctx.textScope === 'all' || ctx.texts.texts.some((t) => t.id === ctx.textScope);
    const info = (id) => ctx.textData.texts.find((t) => t.id === id);
    let busy = false;

    // ---------- 练习入口（范围芯片、开始、复习 / 错题、题量） ----------
    const chipsHolder = h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': STR.textsTitle });
    const heroCount = h('span', { class: 'hero-count num' });
    const hint = h('p', { class: 'text-hint', role: 'status' });
    const entry = (icon, text, onclick) => {
      const countEl = h('span', { class: 'entry-count num' });
      const b = h('button', { class: 'entry-card sl', type: 'button', onclick, 'data-nav': 'entries' },
        h('span', { class: 'entry-ico' }, icon), h('span', { class: 'entry-label', text }), countEl);
      b.setCount = (n, enabled) => { countEl.textContent = String(n); b.setAttribute('aria-label', text + ' ' + n); b.disabled = !enabled; };
      return b;
    };
    const go = (mode) => ctx.go('ruleround', { mode, scope: 'text', textId: ctx.textScope });
    const startBtn = W.btn(STR.start, () => go('practice'), { variant: 'filled', icon: ICON.play(), cls: 'fab' });
    const reviewEntry = entry(ICON.review(), STR.review, () => go('review'));
    const weakEntry = entry(W.legendGlyph('missed'), STR.mistakes, () => go('wrong'));
    const hero = h('section', { class: 'hero-card' }, h('div', { class: 'hero-text' }, h('span', { class: 'hero-label', text: STR.practice }), heroCount), startBtn);
    const entries = h('div', { class: 'entry-row' }, reviewEntry, weakEntry);
    const listHolder = h('div', { class: 'text-list' });

    function refreshCounts() {
      if (!scopeOk()) ctx.textScope = 'all';
      const pool = ctx.textRoundData(ctx.textScope).words;
      const weak = P.textWeakItems(ctx.progress, pool).length;
      heroCount.textContent = String(pool.length);
      startBtn.disabled = pool.length === 0;
      reviewEntry.setCount(pool.length, pool.length > 0);
      weakEntry.setCount(weak, weak > 0);
      hint.textContent = !ctx.texts.texts.length ? STR.textsEmpty : pool.length === 0 ? STR.textNoReadyHint : '';
      hint.hidden = !hint.textContent;
    }
    function drawChips() {
      const total = ctx.textData.items.length;
      const items = [['all', STR.textAll, total], ...ctx.texts.texts.map((t) => [t.id, clip(t.title, 8), info(t.id).ready])];
      const chips = items.map(([key, label, n]) => {
        const c = W.filterChip(label, ctx.textScope === key, () => {
          if (ctx.textScope === key) return;
          ctx.textScope = key;
          for (const x of chips) x.setSelected(x.dataset.scope === key);
          refreshCounts();
        }, { nav: 'textscope', count: n });
        c.dataset.scope = key;
        return c;
      });
      chipsHolder.replaceChildren(...chips);
      chipsHolder.hidden = ctx.texts.texts.length === 0;
    }

    // ---------- 文本列表 ----------
    function drawList() {
      listHolder.replaceChildren(...ctx.texts.texts.map((t) => {
        const st = info(t.id);
        const sub = STR.textReady(st.ready, st.total) + (st.ready < st.total ? ' · ' + STR.textIssues(st.total - st.ready) : '');
        const ctl = h('div', { class: 'ti-ctl' });
        const row = h('div', { class: 'text-item', 'data-text': t.id },
          h('div', { class: 'ti-main' }, h('span', { class: 'ti-title', text: t.title }), h('span', { class: 'ti-sub' + (st.ready < st.total ? ' warn' : ''), text: sub })), ctl);
        const idle = () => ctl.replaceChildren(
          W.btn(STR.textDetail, () => ctx.go('textdetail', { textId: t.id }), { variant: 'text', label: STR.textDetail + ' ' + t.title }),
          W.btn(STR.textDelete, ask, { variant: 'text', label: STR.textDelete + ' ' + t.title }));
        function ask() {
          row.classList.add('asking');
          ctl.replaceChildren(h('span', { class: 'ti-ask', role: 'alert', text: STR.textDeleteAsk }),
            h('div', { class: 'confirm-row' },
              W.btn(STR.cancel, () => { row.classList.remove('asking'); idle(); }, { variant: 'text' }),
              W.btn(STR.confirm, () => { deleteText(ctx, t.id); redraw(); ctx.toast(STR.textDeleted); }, { variant: 'error' })));
          row.scrollIntoView({ block: 'nearest' });
          const b = ctl.querySelector('button');
          if (b && !root.matchMedia('(pointer: coarse)').matches) b.focus({ preventScroll: true });
        }
        idle();
        return row;
      }));
    }
    function redraw() { drawChips(); drawList(); refreshCounts(); }

    // ---------- 添加面板（默认折叠） ----------
    const title = field('input', STR.textTitleField, { type: 'text', maxlength: String(T.LIMITS.title) });
    const area = field('textarea', STR.textPasteField, { rows: '6' });
    let fromFile = false;
    area.addEventListener('input', () => { fromFile = false; });
    const note = h('p', { class: 'text-hint', text: STR.textAuto + '。' + STR.textsLocal + STR.textLimit(T.LIMITS.textChars, T.LIMITS.texts, T.LIMITS.fileBytes / 1024) });
    const pickBtn = W.btn(STR.textPickFile, async () => {
      if (busy) return;
      busy = true;
      try {
        const r = await root.bm.pickText();
        if (r.canceled) return;
        if (!r.ok) { ctx.toast(STR.textAddReason[r.reason] || STR.textAddReason.read); return; }
        const d = T.decodeUtf8(r.bytes);
        if (!d.ok) { ctx.toast(STR.textAddReason[d.reason] || STR.textAddReason.read); return; }
        area.value = d.text;
        fromFile = true;
      } finally { busy = false; }
    }, { variant: 'tonal' });
    const addBtn = W.btn(STR.textAdd, add, { variant: 'filled' });
    async function add() {
      if (busy) return;
      busy = true;
      addBtn.disabled = true;
      addBtn.querySelector('span').textContent = STR.textAdding;
      try {
        const lib = await root.BMPinyinLib.load();
        if (!lib) { ctx.toast(STR.textAddReason['no-lib']); return; }
        await new Promise((r) => setTimeout(r, 30)); // 让「标注中…」先画出来
        const r = T.createText(ctx.texts, { title: title.value, raw: area.value, source: fromFile ? 'file' : 'paste', rng: ctx.rng, map: ctx.translator.map, provider: lib });
        if (!r.ok) { ctx.toast(STR.textAddReason[r.reason] || STR.textAddReason.provider); return; }
        ctx.setTexts(T.addText(ctx.texts, r.text));
        const saved = await ctx.saveTexts();
        ctx.save();
        area.value = ''; title.value = ''; fromFile = false;
        ctx.textScope = r.text.id;
        if (!saved) ctx.toast(STR.textSaveFail);
        else ctx.toast(STR.textAdded(r.text.sentences.length));
        ctx.go('textdetail', { textId: r.text.id });
      } finally {
        busy = false;
        addBtn.disabled = false;
        addBtn.querySelector('span').textContent = STR.textAdd;
      }
    }
    const panel = W.collapse({ title: STR.textAddPanel, cls: 'text-add', open: false },
      title, area, note, h('div', { class: 'ta-actions' }, pickBtn, addBtn));

    const lenSeg = (() => {
      const g = W.segmented(STR.roundLength, ctx.cfg.round.lengths.map((n) => ({ value: n, text: String(n) })), S.roundLength, (v) => { g.select(v); S.roundLength = v; ctx.save(); });
      return h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: STR.roundLength }), g);
    })();

    redraw();
    return {
      nodes: [
        chipsHolder,
        h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => {})),
        hero, hint, entries, lenSeg,
        h('div', { class: 'section-title', text: STR.textsTitle }),
        listHolder,
        panel,
      ],
    };
  };
})(typeof self !== 'undefined' ? self : this);
