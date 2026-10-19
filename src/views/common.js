/** 页面共用部件：范围筛选芯片、阅读/镜像分段按钮、返回按钮、镜像切换图标按钮。 window.BMCommon */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const STR = root.STR;

  /**
   * 范围芯片（全部 + CSV 类别）。
   * @param {object} ctx
   * @param {(key:string)=>void} onChange 选中后（已保存）回调
   */
  function scopeChips(ctx, onChange) {
    const S = ctx.settings;
    const items = [['all', STR.all, ctx.table.length], ...ctx.cats.map((c) => [c.name, c.name, c.count])];
    const chips = items.map(([key, label, n]) => {
      const c = W.filterChip(label, S.scope === key, () => {
        if (S.scope === key) return;
        S.scope = key;
        ctx.save();
        row.select(key); // 就地改选中态（同一批节点，过渡可播放），页面只刷新依赖范围的内容
        onChange(key);
      }, { nav: 'scope', count: n });
      c.dataset.scope = key;
      return c;
    });
    const row = W.chipRow(chips, STR.all);
    row.select = (key) => { for (const c of chips) c.setSelected(c.dataset.scope === key); };
    return row;
  }

  /** 当前范围：对应数据可用且选了才是 'ext' / 'rules'，否则 'base'。 */
  const moduleNow = (ctx, withTexts) => (ctx.ext && ctx.module === 'ext' ? 'ext' : ctx.ruleData && ctx.module === 'rules' ? 'rules' : withTexts && ctx.textData && ctx.module === 'texts' ? 'texts' : 'base');

  /**
   * 「基础 | 扩展 | 规则（词句）」分段控件（复用带拖动的分段按钮）。只有一项可选（没有对应数据）时返回 null，整个不显示。
   * @param {string} rulesLabel 第三项的文字（学习页「规则」、练习页「词句」）
   * @param {(m:'base'|'ext'|'rules'|'texts')=>void} onChange 已就地更新选中态后回调
   * @param {boolean} [withTexts] 练习页才有「文本」一项（需要翻盲文引擎）
   */
  function moduleSegmented(ctx, onChange, rulesLabel, withTexts) {
    const opts = [{ value: 'base', text: STR.modBase }];
    if (ctx.ext) opts.push({ value: 'ext', text: STR.modExt });
    if (ctx.ruleData) opts.push({ value: 'rules', text: rulesLabel || STR.modRules });
    if (withTexts && ctx.textData) opts.push({ value: 'texts', text: STR.modTexts });
    if (opts.length < 2) return null;
    const g = W.segmented(STR.a11yModule, opts, moduleNow(ctx, withTexts), (v) => { g.select(v); ctx.module = v; onChange(v); });
    return h('div', { class: 'seg-row module-seg' }, g);
  }

  /** 扩展符号的范围芯片（全部 + 扩展表类别；类别名完全来自 CSV）。选择只在本次运行内记住。 */
  function extScopeChips(ctx, onChange) {
    const items = [['all', STR.all, ctx.extraRows.length], ...ctx.ext.cats.map((c) => [c.name, c.name, c.count])];
    if (!items.some(([k]) => k === ctx.extScope)) ctx.extScope = 'all';
    const chips = items.map(([key, label, n]) => {
      const c = W.filterChip(label, ctx.extScope === key, () => {
        if (ctx.extScope === key) return;
        ctx.extScope = key;
        row.select(key);
        onChange(key);
      }, { nav: 'extscope', count: n });
      c.dataset.scope = key;
      return c;
    });
    const row = W.chipRow(chips, STR.all);
    row.select = (key) => { for (const c of chips) c.setSelected(c.dataset.scope === key); };
    return row;
  }
  /** 当前范围内的扩展符号。 */
  const extScopeRows = (ctx) => (ctx.extScope === 'all' || !ctx.ext.cats.some((c) => c.name === ctx.extScope)
    ? ctx.extraRows : ctx.extraRows.filter((r) => r.category === ctx.extScope));

  /** 阅读 / 镜像 分段按钮（就地改选中态，再通知页面刷新依赖视角的内容）。 */
  function viewSegmented(ctx, onChange) {
    const g = W.segmented(STR.view, [{ value: false, text: STR.read }, { value: true, text: STR.mirror }],
      ctx.settings.mirror, (v) => { g.select(v); ctx.setMirror(v); onChange(v); });
    return g;
  }

  const backBtn = (fn) => W.iconBtn(ICON.back(), STR.a11yBack, fn);

  /** 顶栏中的镜像切换按钮（可切换图标按钮）。 */
  function mirrorToggle(ctx, onChange) {
    const b = W.iconBtn(ICON.mirror(), STR.mirror, () => {
      ctx.setMirror(!ctx.settings.mirror);
      b.setAttribute('aria-pressed', String(ctx.settings.mirror));
      onChange(ctx.settings.mirror);
    }, { toggle: ctx.settings.mirror });
    return b;
  }

  /** 选择器中的 CSS 转义。 */
  const sel = (attr, v) => '[' + attr + '="' + CSS.escape(String(v)) + '"]';

  root.BMCommon = { scopeChips, viewSegmented, backBtn, mirrorToggle, sel, moduleNow, moduleSegmented, extScopeChips, extScopeRows };
})(typeof self !== 'undefined' ? self : this);
