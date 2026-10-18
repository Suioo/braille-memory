/** 「学习」标签页：范围芯片、阅读/镜像、可翻的学习卡（编号可见）。不计分。 */
(function (root) {
  'use strict';
  const { h, ICON, replay } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  Views.learn = function (ctx, params) {
    const S = ctx.settings;
    let rows = ctx.scopeRows();
    let i = Math.min(Math.max(0, params.index || 0), rows.length - 1);
    let card = null;

    const counter = h('span', { class: 'tb-meta num' });
    const holder = h('div', { class: 'card-holder' });
    const prevBtn = W.iconBtn(ICON.prev(), STR.a11yPrev, () => move(-1), { variant: 'outlined', cls: 'lg-btn' });
    const nextBtn = W.iconBtn(ICON.next(), STR.a11yNext, () => move(1), { variant: 'outlined', cls: 'lg-btn' });

    function show(flipped, animate) {
      const row = rows[i];
      card = W.cardEl(row, { mirror: S.mirror, flipped, onFlip: ctx.fx.lift });
      holder.replaceChildren(card.el);
      if (animate) replay(card.el, 'q-enter');
      counter.textContent = (i + 1) + ' / ' + rows.length;
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === rows.length - 1;
      ctx.say(row.symbol);
    }
    function move(d) {
      const j = i + d;
      if (j < 0 || j >= rows.length) return;
      i = j;
      show(false, true);
    }
    function flip() {
      const f = card.flip();
      ctx.say(f ? rows[i].symbol + ' ' + STR.a11yCell(rows[i].dotsText) : rows[i].symbol);
    }

    const el = h('div', { class: 'page learn-page' },
      W.topBar(null, h('h1', { text: STR.tabLearn }), counter),
      h('div', { class: 'page-body' },
        // 就地更新：芯片 / 分段按钮保持同一批节点（过渡可播放），只刷新依赖变化的卡片与计数
        C.scopeChips(ctx, () => { rows = ctx.scopeRows(); i = 0; show(false, true); }),
        h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => show(card.flipped, false))),
        holder,
        h('div', { class: 'controls' }, prevBtn,
          W.btn(STR.flip, flip, { variant: 'filled', icon: ICON.flip(), autofocus: true, cls: 'wide' }), nextBtn)));
    show(!!params.flipped, false);

    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter') { flip(); return true; }
      if (e.key === 'ArrowLeft') { move(-1); return true; }
      if (e.key === 'ArrowRight') { move(1); return true; }
      return false;
    }
    return { el, onKey, tab: 'learn' };
  };
})(typeof self !== 'undefined' ? self : this);
