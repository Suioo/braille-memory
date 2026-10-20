/** 「练习」标签页：范围、阅读/镜像、题型；练习（主操作）/ 复习 / 错题 三个入口。 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  /** 基础符号练习内容（主表）。 */
  function basePractice(ctx) {
    const S = ctx.settings;
    let rows = ctx.scopeRows();
    let weak = root.BMProgress.weakRows(ctx.progress, rows).length;

    const entry = (icon, label, onclick) => {
      const countEl = h('span', { class: 'entry-count num' });
      const b = h('button', { class: 'entry-card sl', type: 'button', onclick, 'data-nav': 'entries' },
        h('span', { class: 'entry-ico' }, icon), h('span', { class: 'entry-label', text: label }), countEl);
      b.setCount = (n, enabled) => {
        countEl.textContent = String(n);
        b.setAttribute('aria-label', label + ' ' + n);
        b.disabled = !enabled;
      };
      return b;
    };
    const heroCount = h('span', { class: 'hero-count num' });
    const reviewEntry = entry(ICON.review(), STR.review, () => ctx.go('round', { mode: 'review' }));
    const weakEntry = entry(W.legendGlyph('missed'), STR.mistakes, () => { if (weak > 0) ctx.go('round', { mode: 'wrong' }); });
    // 范围变化时只刷新依赖范围的计数（芯片本身就地更新，滚动 / 焦点不动）
    function refresh() {
      rows = ctx.scopeRows();
      weak = root.BMProgress.weakRows(ctx.progress, rows).length;
      heroCount.textContent = String(rows.length);
      reviewEntry.setCount(rows.length, true);
      weakEntry.setCount(weak, weak > 0);
    }
    // 题型 / 题量分段按钮：就地更新（指示块滑动 + ✓ 淡入）再保存
    const optSeg = (label, options, cur, apply) => {
      const g = W.segmented(label, options, cur, (v) => { g.select(v); apply(v); ctx.save(); });
      return h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: label }), g);
    };

    const nodes = [
      C.scopeChips(ctx, refresh),
      h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => {})),
      h('section', { class: 'hero-card' },
        h('div', { class: 'hero-text' },
          h('span', { class: 'hero-label', text: STR.practice }), heroCount),
        W.btn(STR.start, () => ctx.go('round', { mode: 'practice' }), { variant: 'filled', icon: ICON.play(), cls: 'fab', autofocus: true })),
      h('div', { class: 'entry-row' }, reviewEntry, weakEntry),
      optSeg(STR.qtype, [
        { value: 'dots', text: STR.qtypeDots }, { value: 'choose', text: STR.qtypeChoose }, { value: 'mix', text: STR.qtypeMix },
      ], S.qtype, (v) => { S.qtype = v; }),
      optSeg(STR.roundLength, ctx.cfg.round.lengths.map((n) => ({ value: n, text: String(n) })), S.roundLength,
        (v) => { S.roundLength = v; }),
    ];
    refresh();
    return { nodes };
  }

  /**
   * 「词句」：顶部一排来源芯片——「标准词句」（标准里的例词例句）和「我的文本」（全部 / 每篇自定义文本），
   * 选哪个就练哪个；下面始终是「我的文本」列表和「添加文本」面板。自定义文本因此和词句在同一列里，不再单独占一个「文本」选项。
   */
  function wordsPractice(ctx, remount) {
    const TV = root.BMTextViews;
    const hasTexts = ctx.texts.texts.length > 0;
    if (!hasTexts || (ctx.wordSource === 'text' && !(ctx.textScope === 'all' || ctx.texts.texts.some((t) => t.id === ctx.textScope)))) {
      if (!hasTexts) ctx.wordSource = 'std';
      ctx.textScope = 'all';
    }
    const src = ctx.wordSource === 'text' ? 'text' : 'std';
    const tv = TV.practice(ctx, { embedded: true, onChange: remount });
    const items = [['std', STR.wordsStd, root.BMRuleViews.pool(ctx).length]];
    if (hasTexts) {
      items.push(['all', STR.wordsMyTexts, ctx.textData.items.length]);
      for (const t of ctx.texts.texts) {
        const st = ctx.textData.texts.find((x) => x.id === t.id);
        items.push([t.id, Array.from(t.title).length > 8 ? Array.from(t.title).slice(0, 8).join('') + '…' : t.title, st ? st.ready : 0]);
      }
    }
    const cur = src === 'std' ? 'std' : ctx.textScope;
    const chips = items.map(([key, label, n]) => {
      const c = W.filterChip(label, cur === key, () => {
        if ((src === 'std' ? 'std' : ctx.textScope) === key) return;
        if (key === 'std') ctx.wordSource = 'std';
        else { ctx.wordSource = 'text'; ctx.textScope = key; }
        for (const x of chips) x.setSelected(x.dataset.src === key);
        remount();
      }, { nav: 'wordsrc', count: n });
      c.dataset.src = key;
      return c;
    });
    const main = src === 'std' ? root.BMRuleViews.practice(ctx).nodes : [h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => {})), ...tv.nodes];
    return { nodes: [hasTexts ? W.chipRow(chips, STR.wordsSource) : null, ...main, ...tv.library] };
  }

  Views.practice = function (ctx) {
    const content = h('div', { class: 'module-content' });
    const mount = () => {
      const m = C.moduleNow(ctx, true);
      const sub = m === 'ext' ? root.BMExtViews.practice(ctx) : m === 'texts' ? root.BMTextViews.practice(ctx)
        : m === 'rules' ? (ctx.textData ? wordsPractice(ctx, mount) : root.BMRuleViews.practice(ctx)) : basePractice(ctx);
      content.replaceChildren(...sub.nodes.filter(Boolean));
    };
    const modSeg = C.moduleSegmented(ctx, mount, STR.modWords, true);
    mount();
    const el = h('div', { class: 'page practice-page' },
      W.topBar(null, h('h1', { text: STR.tabPractice }), null),
      h('div', { class: 'page-body' }, modSeg, content));
    return { el, tab: 'practice' };
  };
})(typeof self !== 'undefined' ? self : this);
