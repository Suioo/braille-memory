/** 「我的」标签页：统计 + 设置（主题、颜色、视角、题量、题型、自动下题、计时、清除进度）。 */
(function (root) {
  'use strict';
  const { h } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  Views.me = function (ctx, params) {
    const S = ctx.settings;
    let confirming = !!params.confirm;
    const again = (focus) => ctx.go('me', { focus, confirm: confirming }, { dir: 'none' });
    const status = root.BMCourse.lessonStatus(ctx.plan, ctx.progress);
    const weak = root.BMProgress.weakRows(ctx.progress, ctx.table).length;
    const passed = status.filter((x) => x.passed).length;
    const stars = status.reduce((sum, x) => sum + x.stars, 0);

    const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'v num', text: v }), h('span', { class: 'k', text: k }));
    const item = (label, control, key) => h('div', { class: 'list-item', 'data-key': key },
      h('span', { class: 'li-label', text: label }), h('div', { class: 'li-ctl' }, control));
    // 设置控件就地更新：先改同一个元素的状态（CSS 过渡播放），再保存；不重建、不丢焦点 / 滚动位置。
    const seg = (label, key, options, apply) => {
      const g = W.segmented(label, options, S[key], (v) => {
        g.select(v);
        if (apply) apply(v); else { S[key] = v; ctx.save(); }
      });
      return item(label, g, key);
    };
    const sw = (label, key, after) => {
      const el = W.switchEl(label, S[key], (v) => {
        el.setChecked(v);
        S[key] = v; ctx.save(); if (after) after();
      });
      return item(label, el, key);
    };

    let seedNow = S.seed;
    const seedBtns = [];
    const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': STR.color },
      root.BMProgress.SEED_NAMES.map((name) => {
        const on = seedNow === name;
        const b = h('button', {
          class: 'swatch' + (on ? ' selected' : ''), type: 'button', role: 'radio', 'aria-checked': String(on),
          'aria-label': STR.a11yColor(STR.seedName[name]), title: STR.seedName[name], 'data-nav': 'swatch', 'data-seed': name,
          onclick: () => {
            if (seedNow === name) return;
            seedNow = name;
            for (const x of seedBtns) { const on2 = x.dataset.seed === name; x.classList.toggle('selected', on2); x.setAttribute('aria-checked', String(on2)); }
            ctx.setSeed(name);
          },
        }, root.BMDom.ICON.check());
        b.style.setProperty('--swatch', root.BMTheme.swatch(name));
        seedBtns.push(b);
        return b;
      }));

    const clearCtl = confirming
      ? h('div', { class: 'confirm-row' },
        W.btn(STR.cancel, () => { confirming = false; again(C.sel('data-key', 'clear') + ' button'); }, { variant: 'text' }),
        W.btn(STR.confirm, () => {
          ctx.clearProgress();
          confirming = false;
          ctx.say(STR.cleared);
          again(C.sel('data-key', 'clear') + ' button');
        }, { variant: 'error' }))
      : W.btn(STR.clearBtn, () => { confirming = true; again(C.sel('data-key', 'clear') + ' .error-text'); }, { variant: 'error-text' });

    // 关于：只显示版本号；7 次点按（7 s 内）后再按住 2 s 才显示反馈行（无任何提前反馈）。
    // 联系方式只来自本机 contact.json（经 boot 传入 ctx.contact）；缺失则什么都不显示。屏内状态存在 ctx 上。
    const A = root.BMAbout;
    const contact = ctx.contact && typeof ctx.contact.qq === 'string' && ctx.contact.qq ? ctx.contact : null;
    const seq = ctx.aboutSeq || (ctx.aboutSeq = A.createSecretSequence({ taps: 7, windowMs: 7000, holdMs: 2000 }));
    const verText = ctx.version ? A.displayVersion(ctx.version) : '';
    const about = h('section', { class: 'about' });
    function copyQq() {
      const n = contact.qq;
      const ok = () => ctx.toast(STR.copied);
      const fallback = () => {
        try {
          const ta = document.createElement('textarea');
          ta.value = n; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
          document.body.append(ta); ta.select();
          const done = document.execCommand && document.execCommand('copy');
          ta.remove();
          if (done) ok();
        } catch (_) { /* 无法复制：不提示 */ }
      };
      try {
        if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) root.navigator.clipboard.writeText(n).then(ok, fallback);
        else fallback();
      } catch (_) { fallback(); }
    }
    function revealFeedback() {
      if (!contact || about.querySelector('.about-feedback')) return;
      ctx.aboutOpen = true;
      const label = contact.label || STR.feedback;
      const parts = [
        h('span', { text: label }), h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }),
        h('span', { text: 'QQ' }),
        h('button', { class: 'about-qq sl', type: 'button', 'aria-label': STR.a11yCopyQq(contact.qq), onclick: copyQq, text: contact.qq }),
      ];
      if (contact.name) parts.push(h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }), h('span', { text: contact.name }));
      about.append(h('div', { class: 'about-feedback', role: 'group', 'aria-label': label }, ...parts));
    }
    let holdTimer = null;
    const stopHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
    const press = () => {
      seq.down(Date.now());
      stopHold();
      holdTimer = setTimeout(() => { holdTimer = null; if (seq.poll(Date.now())) revealFeedback(); }, 2010);
    };
    const release = () => { stopHold(); if (seq.up(Date.now())) revealFeedback(); };
    const abort = () => { stopHold(); seq.cancel(); };
    const isAct = (e) => e.key === 'Enter' || e.key === ' ';
    // 班级内小范围分发：点一下版本号即显示联系方式（7 连点 + 长按的深度彩蛋逻辑保留在 core/about.js，转公开时可切回）
    void press; void release; void abort; void isAct;
    let opened = false;
    const openOnce = () => { if (opened) return; opened = true; revealFeedback(); };
    about.append(h('button', {
      class: 'about-ver', type: 'button', 'aria-label': STR.a11yVersion(verText), text: verText,
      onclick: openOnce,
    }));
    if (ctx.aboutOpen) openOnce();

    const el = h('div', { class: 'page me-page' },
      W.topBar(null, h('h1', { text: STR.tabMe }), null),
      h('div', { class: 'page-body' },
        h('section', { class: 'stats-card' },
          stat(STR.weak, String(weak)),
          stat(STR.passedLabel, passed + '/' + status.length),
          stat(STR.starsLabel, stars + '/' + status.length * 3)),
        h('section', { class: 'list' },
          seg(STR.theme, 'theme', [
            { value: 'system', text: STR.themeSystem }, { value: 'light', text: STR.themeLight }, { value: 'dark', text: STR.themeDark },
          ], (v) => ctx.setTheme(v)),
          seg(STR.style, 'style', [
            { value: 'material', text: STR.styleMaterial }, { value: 'glass', text: STR.styleGlass },
          ], (v) => ctx.setStyle(v)),
          item(STR.color, swatches, 'seed'),
          seg(STR.view, 'mirror', [{ value: false, text: STR.read }, { value: true, text: STR.mirror }], (v) => ctx.setMirror(v)),
          seg(STR.roundLength, 'roundLength', ctx.cfg.round.lengths.map((n) => ({ value: n, text: String(n) }))),
          seg(STR.qtype, 'qtype', [
            { value: 'dots', text: STR.qtypeDots }, { value: 'choose', text: STR.qtypeChoose }, { value: 'mix', text: STR.qtypeMix },
          ]),
          sw(STR.autoNext, 'autoNext'),
          sw(STR.timing, 'timing'),
          sw(STR.fx, 'fx', () => ctx.fx.sync()),
          root.BMHaptics && root.BMHaptics.supported ? sw(STR.haptics, 'haptics') : null,
          item(STR.clear, clearCtl, 'clear')),
        about));

    function onKey(e) {
      if (e.key === 'Escape' && confirming) { confirming = false; again(C.sel('data-key', 'clear') + ' button'); return true; }
      return false;
    }
    return { el, onKey, tab: 'me', api: { askClear() { confirming = true; again(); } } };
  };
})(typeof self !== 'undefined' ? self : this);
