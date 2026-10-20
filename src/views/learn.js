/** 「学习」标签页：范围芯片、阅读/镜像、可翻的学习卡（编号可见）。不计分。 */
(function (root) {
  'use strict';
  const { h, ICON, replay } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  /** 基础符号学习内容（主表）。 */
  function baseLearn(ctx, params, counter) {
    const S = ctx.settings;
    let rows = ctx.scopeRows();
    let i = Math.min(Math.max(0, params.index || 0), rows.length - 1);
    let card = null;

    const holder = h('div', { class: 'card-holder' });
    const prevBtn = W.iconBtn(ICON.prev(), STR.a11yPrev, () => move(-1), { variant: 'outlined', cls: 'lg-btn' });
    const nextBtn = W.iconBtn(ICON.next(), STR.a11yNext, () => move(1), { variant: 'outlined', cls: 'lg-btn' });

    function show(flipped, animate) {
      const row = rows[i];
      card = W.cardEl(row, { mirror: S.mirror, flipped, onFlip: (el) => { ctx.fx.lift(el); if (el.getAttribute('aria-pressed') === 'true') ctx.haptic('dots', { rows: root.BMHapticsCore.dotRows(row.dots, S.mirror) }); } });
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

    const nodes = [
      // 就地更新：芯片 / 分段按钮保持同一批节点（过渡可播放），只刷新依赖变化的卡片与计数
      C.scopeChips(ctx, () => { rows = ctx.scopeRows(); i = 0; show(false, true); }),
      h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => show(card.flipped, false))),
      holder,
      h('div', { class: 'controls' }, prevBtn,
        W.btn(STR.flip, flip, { variant: 'filled', icon: ICON.flip(), autofocus: true, cls: 'wide' }), nextBtn),
    ];
    show(!!params.flipped, false);

    function onKey(e) {
      if (e.key === ' ' || e.key === 'Enter') { flip(); return true; }
      if (e.key === 'ArrowLeft') { move(-1); return true; }
      if (e.key === 'ArrowRight') { move(1); return true; }
      return false;
    }
    return { nodes, onKey };
  }

  Views.learn = function (ctx, params) {
    const counter = h('span', { class: 'tb-meta num' });
    const content = h('div', { class: 'module-content' });
    let first = true;
    let sub = null;
    // 「基础 | 扩展」：就地换内容（分段控件保持同一个节点，指示块滑动、滚动位置不动）
    const mount = () => {
      const p = first ? params : {};
      first = false;
      const m = C.moduleNow(ctx);
      sub = m === 'ext' ? root.BMExtViews.learn(ctx, p, counter) : m === 'rules' ? root.BMRuleViews.learn(ctx, p, counter) : baseLearn(ctx, p, counter);
      content.replaceChildren(...sub.nodes);
    };
    const modSeg = C.moduleSegmented(ctx, mount, STR.modRules);
    mount();
    const el = h('div', { class: 'page learn-page' },
      W.topBar(null, h('h1', { text: STR.tabLearn }), h('div', { class: 'actions' }, counter,
        ctx.translator ? W.iconBtn(root.BMDom.ICON.convert(), STR.convTitle, () => ctx.go('convert')) : null)),
      h('div', { class: 'page-body' }, modSeg, content));
    return { el, onKey: (e) => sub.onKey(e), tab: 'learn' };
  };
})(typeof self !== 'undefined' ? self : this);
