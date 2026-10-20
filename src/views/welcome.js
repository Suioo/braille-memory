/** 首次使用的欢迎 / 外观设置（两步，像新手机开机引导）：第一步挑主题、配色、风格（选了立刻生效），第二步选默认视角。 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  Views.welcome = function (ctx) {
    const S = ctx.settings;
    let step = 0;
    const body = h('div', { class: 'welcome-body' });
    const el = h('div', { class: 'page welcome-page' }, body);

    // 左上 2×3 的点：依次亮起，像一个盲文方；纯装饰
    const cell = h('div', { class: 'welcome-cell', 'aria-hidden': 'true' },
      [0, 1, 2, 3, 4, 5].map(() => h('i')));

    const swatches = () => {
      const btns = [];
      const row = h('div', { class: 'swatches big', role: 'radiogroup', 'aria-label': STR.color },
        root.BMProgress.SEED_NAMES.map((name) => {
          const on = S.seed === name;
          const b = h('button', {
            class: 'swatch' + (on ? ' selected' : ''), type: 'button', role: 'radio', 'aria-checked': String(on),
            'aria-label': STR.a11yColor(STR.seedName[name]), title: STR.seedName[name], 'data-seed': name,
            onclick: () => {
              if (S.seed === name) return;
              ctx.setSeed(name);
              for (const x of btns) { const o = x.dataset.seed === name; x.classList.toggle('selected', o); x.setAttribute('aria-checked', String(o)); }
            },
          }, ICON.check());
          b.style.setProperty('--swatch', root.BMTheme.swatch(name));
          btns.push(b);
          return b;
        }));
      return row;
    };

    const seg = (lab, opts, cur, apply) => {
      const g = W.segmented(lab, opts, cur, (v) => { g.select(v); apply(v); });
      return g;
    };
    const label = (t) => h('div', { class: 'welcome-label', text: t });

    function render() {
      body.replaceChildren();
      if (step === 0) {
        body.append(
          cell,
          h('h1', { class: 'welcome-title', text: STR.welcomeTitle }),
          h('p', { class: 'welcome-sub', text: STR.welcomeSub }),
          h('div', { class: 'welcome-group' },
            label(STR.theme),
            seg(STR.theme, [
              { value: 'system', text: STR.themeSystem }, { value: 'light', text: STR.themeLight }, { value: 'dark', text: STR.themeDark },
            ], S.theme, (v) => ctx.setTheme(v)),
            label(STR.color),
            swatches(),
            label(STR.style),
            seg(STR.style, [
              { value: 'material', text: STR.styleMaterial }, { value: 'glass', text: STR.styleGlass },
            ], S.style, (v) => ctx.setStyle(v))),
          h('div', { class: 'welcome-actions' },
            W.btn(STR.welcomeSkip, () => finish(), { variant: 'text' }),
            W.btn(STR.welcomeNext, () => { step = 1; render(); ctx.syncBack(); }, { autofocus: true })));
      } else {
        body.append(
          h('h1', { class: 'welcome-title', text: STR.welcomeViewTitle }),
          h('p', { class: 'welcome-sub', text: STR.welcomeViewSub }),
          h('div', { class: 'welcome-group' },
            seg(STR.view, [{ value: false, text: STR.read }, { value: true, text: STR.mirror }], !!S.mirror, (v) => ctx.setMirror(v)),
            h('p', { class: 'welcome-hint', text: STR.welcomeViewHint })),
          h('div', { class: 'welcome-actions' },
            W.btn(STR.welcomeBack, () => { step = 0; render(); ctx.syncBack(); }, { variant: 'text' }),
            W.btn(STR.welcomeStart, () => finish(), { autofocus: true })));
      }
    }
    function finish() {
      try { root.BMUiState.createStore(root.localStorage).markWelcomed(); } catch (_) { /* 存储不可用：下次可能再出现，不影响使用 */ }
      ctx.go('learn', {}, { dir: 'tab' });
    }
    function onKey(e) {
      if (e.key !== 'Escape') return false;
      if (step === 0) return true; // 第一步：手柄 / Esc 不跳出引导；安卓返回键 / 手势此时不由应用接管，系统直接回桌面
      step = 0; render(); ctx.syncBack();
      return true;
    }
    render();
    return { el, onKey, noPeek: true, get noBack() { return step === 0; } };
  };
})(typeof self !== 'undefined' ? self : this);
