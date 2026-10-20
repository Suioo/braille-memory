/**
 * 首次使用的引导（四步，像新手机开机引导）：
 *  ① 认识「盲文记忆」（一句话简介 + 三件能做的事）；② 外观（主题、配色、风格，选了立刻生效）；
 *  ③ 视角（阅读 / 扎写，旁边的示例方跟着切换）；④ 练习偏好（题型、题量），然后开始。
 * 第一步返回交给系统（回桌面）；之后的步骤返回上一步。走完或点「跳过」才记为看过。
 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});
  const STEPS = 4;

  Views.welcome = function (ctx) {
    const S = ctx.settings;
    let step = 0;
    const body = h('div', { class: 'welcome-body' });
    const el = h('div', { class: 'page welcome-page' }, body);

    // 2×3 的点：依次亮起，像一个盲文方；纯装饰
    const cellDeco = () => h('div', { class: 'welcome-cell', 'aria-hidden': 'true' }, [0, 1, 2, 3, 4, 5].map(() => h('i')));
    const seg = (lab, opts, cur, apply) => {
      const g = W.segmented(lab, opts, cur, (v) => { g.select(v); apply(v); });
      return g;
    };
    const label = (t) => h('div', { class: 'welcome-label', text: t });
    const dots = () => h('div', { class: 'welcome-steps', role: 'img', 'aria-label': STR.welcomeStepOf(step + 1, STEPS) },
      Array.from({ length: STEPS }, (_, i) => h('i', { class: i === step ? 'on' : i < step ? 'done' : '' })));
    const go = (n) => { step = n; render(); ctx.syncBack(); };

    const swatches = () => {
      const btns = [];
      return h('div', { class: 'swatches big', role: 'radiogroup', 'aria-label': STR.color },
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
    };
    const feature = (icon, title, text) => h('div', { class: 'welcome-feature' },
      h('span', { class: 'wf-ico', 'aria-hidden': 'true' }, icon), h('div', { class: 'wf-text' }, h('b', { text: title }), h('span', { text: text })));
    const actions = (left, right) => h('div', { class: 'welcome-actions' }, left, right);

    // 视角示例：声母 n（1 3 4 5），扎写时左右列互换
    const N_DOTS = new Set([1, 3, 4, 5]);
    let demoHolder = null;
    const drawDemo = () => {
      if (!demoHolder) return;
      demoHolder.replaceChildren(
        W.cellEl({ dots: N_DOTS, mirror: !!S.mirror, numbers: true }),
        h('div', { class: 'welcome-demo-cap' }, h('b', { text: 'n' }), h('span', { text: S.mirror ? STR.welcomeDemoMirror : STR.welcomeDemoRead })));
    };

    function render() {
      body.replaceChildren();
      body.append(dots());
      if (step === 0) {
        body.append(
          cellDeco(),
          h('h1', { class: 'welcome-title', text: STR.welcomeTitle }),
          h('p', { class: 'welcome-sub', text: STR.welcomeIntro }),
          h('div', { class: 'welcome-features' },
            feature(ICON.learn(), STR.welcomeF1, STR.welcomeF1Text),
            feature(ICON.practice(), STR.welcomeF2, STR.welcomeF2Text),
            feature(ICON.convert(), STR.welcomeF3, STR.welcomeF3Text)),
          h('p', { class: 'welcome-note', text: STR.welcomeNote }),
          actions(W.btn(STR.welcomeSkip, () => finish(), { variant: 'text' }), W.btn(STR.welcomeNext, () => go(1), { autofocus: true })));
      } else if (step === 1) {
        body.append(
          h('h1', { class: 'welcome-title', text: STR.welcomeLookTitle }),
          h('p', { class: 'welcome-sub', text: STR.welcomeSub }),
          h('div', { class: 'welcome-group' },
            label(STR.theme),
            seg(STR.theme, [{ value: 'system', text: STR.themeSystem }, { value: 'light', text: STR.themeLight }, { value: 'dark', text: STR.themeDark }], S.theme, (v) => ctx.setTheme(v)),
            label(STR.color),
            swatches(),
            label(STR.style),
            seg(STR.style, [{ value: 'material', text: STR.styleMaterial }, { value: 'glass', text: STR.styleGlass }], S.style, (v) => ctx.setStyle(v))),
          actions(W.btn(STR.welcomeBack, () => go(0), { variant: 'text' }), W.btn(STR.welcomeNext, () => go(2), { autofocus: true })));
      } else if (step === 2) {
        demoHolder = h('div', { class: 'welcome-demo' });
        body.append(
          h('h1', { class: 'welcome-title', text: STR.welcomeViewTitle }),
          h('p', { class: 'welcome-sub', text: STR.welcomeViewSub }),
          h('div', { class: 'welcome-group' },
            seg(STR.view, [{ value: false, text: STR.read }, { value: true, text: STR.mirror }], !!S.mirror, (v) => { ctx.setMirror(v); drawDemo(); }),
            demoHolder,
            h('p', { class: 'welcome-hint', text: STR.welcomeViewHint })),
          actions(W.btn(STR.welcomeBack, () => go(1), { variant: 'text' }), W.btn(STR.welcomeNext, () => go(3), { autofocus: true })));
        drawDemo();
      } else {
        body.append(
          h('h1', { class: 'welcome-title', text: STR.welcomePracticeTitle }),
          h('p', { class: 'welcome-sub', text: STR.welcomePracticeSub }),
          h('div', { class: 'welcome-group' },
            label(STR.qtype),
            seg(STR.qtype, [{ value: 'dots', text: STR.qtypeDots }, { value: 'choose', text: STR.qtypeChoose }, { value: 'mix', text: STR.qtypeMix }], S.qtype, (v) => { S.qtype = v; ctx.save(); }),
            h('p', { class: 'welcome-hint', text: STR.welcomeQtypeHint }),
            label(STR.roundLength),
            seg(STR.roundLength, ctx.cfg.round.lengths.map((n) => ({ value: n, text: String(n) })), S.roundLength, (v) => { S.roundLength = v; ctx.save(); })),
          actions(W.btn(STR.welcomeBack, () => go(2), { variant: 'text' }), W.btn(STR.welcomeStart, () => finish(), { autofocus: true })));
      }
    }
    function finish() {
      try { root.BMUiState.createStore(root.localStorage).markWelcomed(); } catch (_) { /* 存储不可用：下次可能再出现，不影响使用 */ }
      ctx.go('learn', {}, { dir: 'tab' });
    }
    function onKey(e) {
      if (e.key !== 'Escape') return false;
      if (step === 0) return true; // 第一步：手柄 / Esc 不跳出引导；安卓返回键 / 手势此时不由应用接管，系统直接回桌面
      go(step - 1);
      return true;
    }
    render();
    return { el, onKey, noPeek: true, get noBack() { return step === 0; } };
  };
})(typeof self !== 'undefined' ? self : this);
