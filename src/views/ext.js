/** 扩展符号（data/braille_extra.csv）的「学习」「练习」内容：由 learn.js / practice.js 在选了「扩展」时挂载。 window.BMExtViews */
(function (root) {
  'use strict';
  const { h, ICON, replay } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const P = root.BMProgress;
  const Ext = (root.BMExtViews = {});

  /**
   * 扩展学习：类别芯片、阅读 / 镜像（整串从右往左 + 各方左右互换）、可翻的学习卡。不计分。
   * @returns {{nodes: Node[], onKey: (e:KeyboardEvent)=>boolean}}
   */
  Ext.learn = function (ctx, params, counter) {
    const S = ctx.settings;
    let rows = C.extScopeRows(ctx);
    let i = Math.min(Math.max(0, params.index || 0), rows.length - 1);
    let card = null;
    const holder = h('div', { class: 'card-holder' });
    const prevBtn = W.iconBtn(ICON.prev(), STR.a11yPrev, () => move(-1), { variant: 'outlined', cls: 'lg-btn' });
    const nextBtn = W.iconBtn(ICON.next(), STR.a11yNext, () => move(1), { variant: 'outlined', cls: 'lg-btn' });

    function show(flipped, animate) {
      const row = rows[i];
      card = W.extCardEl(row, { mirror: S.mirror, flipped, onFlip: ctx.fx.lift });
      holder.replaceChildren(card.el);
      if (animate) replay(card.el, animate === 'back' ? 'q-enter-back' : 'q-enter');
      counter.textContent = (i + 1) + ' / ' + rows.length;
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === rows.length - 1;
      ctx.say(row.symbol);
    }
    function move(d) {
      const j = i + d;
      if (j < 0 || j >= rows.length) return false;
      i = j;
      show(false, d < 0 ? 'back' : true);
      return true;
    }
    C.swipeCards(holder, move);
    function flip() {
      const f = card.flip();
      ctx.say(f ? rows[i].symbol + ' ' + STR.a11ySeq(rows[i].cellsText) : rows[i].symbol);
    }
    const nodes = [
      C.extScopeChips(ctx, () => { rows = C.extScopeRows(ctx); i = 0; show(false, true); }),
      h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => show(card.flipped, false))),
      holder,
      h('div', { class: 'controls' }, prevBtn, W.btn(STR.flip, flip, { variant: 'filled', icon: ICON.flip(), autofocus: true, cls: 'wide' }), nextBtn),
    ];
    show(!!params.flipped, false);
    return {
      nodes,
      onKey(e) {
        if (e.key === ' ' || e.key === 'Enter') { flip(); return true; }
        if (e.key === 'ArrowLeft') { move(-1); return true; }
        if (e.key === 'ArrowRight') { move(1); return true; }
        return false;
      },
    };
  };

  /** 扩展练习：范围、阅读 / 镜像、练习（主操作）/ 复习 / 错题、题型、题量。 */
  Ext.practice = function (ctx) {
    const S = ctx.settings;
    let rows = C.extScopeRows(ctx);
    let weak = P.extWeakRows(ctx.progress, rows).length;
    const entry = (icon, label, onclick) => {
      const countEl = h('span', { class: 'entry-count num' });
      const b = h('button', { class: 'entry-card sl', type: 'button', onclick, 'data-nav': 'entries' },
        h('span', { class: 'entry-ico' }, icon), h('span', { class: 'entry-label', text: label }), countEl);
      b.setCount = (n, enabled) => { countEl.textContent = String(n); b.setAttribute('aria-label', label + ' ' + n); b.disabled = !enabled; };
      return b;
    };
    const heroCount = h('span', { class: 'hero-count num' });
    const reviewEntry = entry(ICON.review(), STR.review, () => ctx.go('extround', { mode: 'review' }));
    const weakEntry = entry(W.legendGlyph('missed'), STR.mistakes, () => { if (weak > 0) ctx.go('extround', { mode: 'wrong' }); });
    function refresh() {
      rows = C.extScopeRows(ctx);
      weak = P.extWeakRows(ctx.progress, rows).length;
      heroCount.textContent = String(rows.length);
      reviewEntry.setCount(rows.length, true);
      weakEntry.setCount(weak, weak > 0);
    }
    const optSeg = (label, options, cur, apply) => {
      const g = W.segmented(label, options, cur, (v) => { g.select(v); apply(v); ctx.save(); });
      return h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: label }), g);
    };
    const nodes = [
      C.extScopeChips(ctx, refresh),
      h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => {})),
      h('section', { class: 'hero-card' },
        h('div', { class: 'hero-text' }, h('span', { class: 'hero-label', text: STR.practice }), heroCount),
        W.btn(STR.start, () => ctx.go('extround', { mode: 'practice' }), { variant: 'filled', icon: ICON.play(), cls: 'fab', autofocus: true })),
      h('div', { class: 'entry-row' }, reviewEntry, weakEntry),
      optSeg(STR.qtype, [{ value: 'dots', text: STR.qtypeDots }, { value: 'choose', text: STR.qtypeChooseExt }, { value: 'mix', text: STR.qtypeMix }], S.qtype, (v) => { S.qtype = v; }),
      optSeg(STR.roundLength, ctx.cfg.round.lengths.map((n) => ({ value: n, text: String(n) })), S.roundLength, (v) => { S.roundLength = v; }),
    ];
    refresh();
    return { nodes };
  };
})(typeof self !== 'undefined' ? self : this);
