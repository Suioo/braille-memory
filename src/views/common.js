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
    const row = h('div', { class: 'chip-row', role: 'radiogroup', 'aria-label': STR.all }, chips);
    row.select = (key) => { for (const c of chips) c.setSelected(c.dataset.scope === key); };
    return row;
  }

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

  root.BMCommon = { scopeChips, viewSegmented, backBtn, mirrorToggle, sel };
})(typeof self !== 'undefined' ? self : this);
