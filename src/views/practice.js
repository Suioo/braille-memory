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

  Views.practice = function (ctx) {
    const content = h('div', { class: 'module-content' });
    const mount = () => {
      const m = C.moduleNow(ctx, true);
      const sub = m === 'ext' ? root.BMExtViews.practice(ctx) : m === 'texts' ? root.BMTextViews.practice(ctx) : m === 'rules' ? root.BMRuleViews.practice(ctx) : basePractice(ctx);
      content.replaceChildren(...sub.nodes);
    };
    const modSeg = C.moduleSegmented(ctx, mount, STR.modWords, true);
    mount();
    const el = h('div', { class: 'page practice-page' },
      W.topBar(null, h('h1', { text: STR.tabPractice }), null),
      h('div', { class: 'page-body' }, modSeg, content));
    return { el, tab: 'practice' };
  };
})(typeof self !== 'undefined' ? self : this);
