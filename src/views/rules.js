/** 规则 / 词句的「学习」「练习」内容：由 learn.js / practice.js 在选了「规则」「词句」时挂载。 window.BMRuleViews */
(function (root) {
  'use strict';
  const { h, ICON, replay } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const P = root.BMProgress;
  const RV = (root.BMRuleViews = {});

  /** 规则学习：类别芯片（规则数据里的 cat）、可翻的规则卡。不计分。 */
  RV.learn = function (ctx, params, counter) {
    const S = ctx.settings;
    const data = ctx.ruleData;
    const cardsNow = () => (ctx.ruleScope === 'all' ? data.cards : data.cards.filter((c) => c.rule.cat === ctx.ruleScope));
    let cards = cardsNow();
    let i = Math.min(Math.max(0, params.index || 0), cards.length - 1);
    let card = null;
    const holder = h('div', { class: 'card-holder' });
    const prevBtn = W.iconBtn(ICON.prev(), STR.a11yPrev, () => move(-1), { variant: 'outlined', cls: 'lg-btn' });
    const nextBtn = W.iconBtn(ICON.next(), STR.a11yNext, () => move(1), { variant: 'outlined', cls: 'lg-btn' });

    function show(flipped, animate) {
      const c = cards[i];
      card = W.ruleCardEl(c, { mirror: S.mirror, flipped, onFlip: ctx.fx.lift });
      holder.replaceChildren(card.el);
      if (animate) replay(card.el, 'q-enter');
      counter.textContent = (i + 1) + ' / ' + cards.length;
      prevBtn.disabled = i === 0;
      nextBtn.disabled = i === cards.length - 1;
      ctx.say(STR.ruleName(c.id) + '，' + c.rule.cat);
    }
    function move(d) {
      const j = i + d;
      if (j < 0 || j >= cards.length) return;
      i = j;
      show(false, true);
    }
    function flip() {
      const f = card.flip();
      ctx.say(f ? cards[i].rule.text : STR.ruleName(cards[i].id));
    }
    const items = [['all', STR.all, data.cards.length], ...data.cats.map((c) => [c.name, c.name, c.count])];
    if (!items.some(([k]) => k === ctx.ruleScope)) ctx.ruleScope = 'all';
    const chips = items.map(([key, label, n]) => {
      const c = W.filterChip(label, ctx.ruleScope === key, () => {
        if (ctx.ruleScope === key) return;
        ctx.ruleScope = key;
        for (const x of chips) x.setSelected(x.dataset.scope === key);
        cards = cardsNow();
        i = 0;
        show(false, true);
      }, { nav: 'rulescope', count: n });
      c.dataset.scope = key;
      return c;
    });
    const nodes = [
      h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': STR.all }, chips),
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

  /** 当前题型对应的题目池。 */
  RV.pool = function (ctx) {
    const RR = root.BMRuleRound;
    const t = ctx.ruleQtype;
    const types = RR.availableTypes(ctx.ruleData);
    const want = t === 'mix' ? types : types.filter((x) => x === t);
    const seen = new Set();
    const out = [];
    for (const type of want) for (const it of RR.poolOf(ctx.ruleData, type)) if (!seen.has(it.key)) { seen.add(it.key); out.push(it); }
    return out;
  };

  /** 词句练习：题型（翻盲文 / 读词 / 判断 / 混合）、练习 / 复习 / 错题、题量。只列数据能支撑的题型。 */
  RV.practice = function (ctx) {
    const S = ctx.settings;
    const RR = root.BMRuleRound;
    const avail = RR.availableTypes(ctx.ruleData);
    const label = { translate: STR.rtTranslate, read: STR.rtRead, judge: STR.rtJudge };
    if (ctx.ruleQtype !== 'mix' && !avail.includes(ctx.ruleQtype)) ctx.ruleQtype = 'mix';
    let pool = RV.pool(ctx);
    let weak = P.ruleWeakItems(ctx.progress, pool).length;
    const entry = (icon, text, onclick) => {
      const countEl = h('span', { class: 'entry-count num' });
      const b = h('button', { class: 'entry-card sl', type: 'button', onclick, 'data-nav': 'entries' },
        h('span', { class: 'entry-ico' }, icon), h('span', { class: 'entry-label', text }), countEl);
      b.setCount = (n, enabled) => { countEl.textContent = String(n); b.setAttribute('aria-label', text + ' ' + n); b.disabled = !enabled; };
      return b;
    };
    const heroCount = h('span', { class: 'hero-count num' });
    const reviewEntry = entry(ICON.review(), STR.review, () => ctx.go('ruleround', { mode: 'review' }));
    const weakEntry = entry(W.legendGlyph('missed'), STR.mistakes, () => { if (weak > 0) ctx.go('ruleround', { mode: 'wrong' }); });
    function refresh() {
      pool = RV.pool(ctx);
      weak = P.ruleWeakItems(ctx.progress, pool).length;
      heroCount.textContent = String(pool.length);
      reviewEntry.setCount(pool.length, pool.length > 0);
      weakEntry.setCount(weak, weak > 0);
    }
    const typeOpts = avail.map((t) => ({ value: t, text: label[t] }));
    if (avail.length > 1) typeOpts.push({ value: 'mix', text: STR.rtMix });
    const typeSeg = (() => {
      const g = W.segmented(STR.qtype, typeOpts, ctx.ruleQtype, (v) => { g.select(v); ctx.ruleQtype = v; refresh(); });
      return h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: STR.qtype }), g);
    })();
    const lenSeg = (() => {
      const g = W.segmented(STR.roundLength, ctx.cfg.round.lengths.map((n) => ({ value: n, text: String(n) })), S.roundLength, (v) => { g.select(v); S.roundLength = v; ctx.save(); });
      return h('div', { class: 'opt-row' }, h('span', { class: 'opt-label', text: STR.roundLength }), g);
    })();
    const nodes = [
      h('div', { class: 'seg-row' }, C.viewSegmented(ctx, () => {})),
      h('section', { class: 'hero-card' },
        h('div', { class: 'hero-text' }, h('span', { class: 'hero-label', text: STR.practice }), heroCount),
        W.btn(STR.start, () => ctx.go('ruleround', { mode: 'practice' }), { variant: 'filled', icon: ICON.play(), cls: 'fab', autofocus: true, disabled: pool.length === 0 })),
      h('div', { class: 'entry-row' }, reviewEntry, weakEntry),
      typeOpts.length > 1 ? typeSeg : null,
      lenSeg,
    ];
    refresh();
    return { nodes };
  };
})(typeof self !== 'undefined' ? self : this);
