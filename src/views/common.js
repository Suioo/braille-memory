/** 页面共用部件：范围筛选芯片、阅读/镜像分段按钮、返回按钮、镜像切换图标按钮。 window.BMCommon */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const STR = root.STR;

  /** 复制文字到剪贴板（失败时静默）。@returns {Promise<boolean>} */
  function copyText(text) {
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        document.body.append(ta); ta.select();
        const done = !!(document.execCommand && document.execCommand('copy'));
        ta.remove();
        return done;
      } catch (_) { return false; }
    };
    try {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) return root.navigator.clipboard.writeText(text).then(() => true, () => fallback());
    } catch (_) { /* 走兜底 */ }
    return Promise.resolve(fallback());
  }

  /**
   * 联系作者的邀请卡：完成第 3 轮（练习 / 闯关）后出现一次，放在结果页底部，看过就不再出现；设置 → 关于 里的入口一直都在。
   * 没有联系方式（contact.json 缺失）、截图 / e2e 模式、本机存储不可用时返回 null。
   */
  function inviteCard(ctx) {
    try {
      const c = ctx.contact;
      if (ctx.shot || !c || typeof c.qq !== 'string' || !c.qq) return null;
      const store = root.BMUiState.createStore(root.localStorage);
      if (!store.bumpRound()) return null;
      const card = h('section', { class: 'invite-card', role: 'note' },
        h('div', { class: 'invite-text' }, h('strong', { text: STR.inviteTitle }), h('span', { text: STR.inviteBody + ' · QQ ' + c.qq + (c.name ? '（' + c.name + '）' : '') })),
        h('div', { class: 'invite-btns' },
          W.btn(STR.inviteCopy, () => copyText(c.qq).then((ok) => { if (ok) ctx.toast(STR.copied); }), { variant: 'tonal' }),
          W.btn(STR.inviteClose, () => card.remove(), { variant: 'text' })));
      return card;
    } catch (_) { return null; }
  }

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
  // 自定义文本并在「词句」里（词句页顶部的来源芯片切换「标准词句 / 我的文本」）；只有没有词句数据时才单独显示「文本」一项
  const moduleNow = (ctx, withTexts) => (ctx.ext && ctx.module === 'ext' ? 'ext'
    : ctx.ruleData && (ctx.module === 'rules' || (withTexts && ctx.module === 'texts')) ? 'rules'
    : withTexts && ctx.textData && ctx.module === 'texts' ? 'texts' : 'base');

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
    if (withTexts && ctx.textData && !ctx.ruleData) opts.push({ value: 'texts', text: STR.modTexts });
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

  root.BMCommon = { copyText, inviteCard, scopeChips, viewSegmented, backBtn, mirrorToggle, sel, moduleNow, moduleSegmented, extScopeChips, extScopeRows };
})(typeof self !== 'undefined' ? self : this);
