/** 「设置」标签页：统计 + 设置（主题、颜色、视角、题量、题型、自动下题、计时、清除进度）。 */
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

    // 手柄震动：只有检测到能震的手柄时才显示；手柄断开自动隐藏（订阅状态变化，页面销毁时取消订阅）
    const padRow = sw(STR.padHaptics, 'padHaptics');
    const padState = root.BMPadHaptics ? root.BMPadHaptics.state : null;
    const padStyleRow = seg(STR.padStyle, 'padHapticsStyle', [{ value: 'soft', text: STR.padStyleSoft }, { value: 'normal', text: STR.padStyleNormal }, { value: 'rich', text: STR.padStyleRich }],
      (v) => { S.padHapticsStyle = v; ctx.save(); if (root.BMPadHaptics) { root.BMPadHaptics.play('wrong'); } });
    const padDotsRow = sw(STR.padDots, 'padDots', () => { if (root.BMPadHaptics && S.padDots) root.BMPadHaptics.play('dots', { rows: root.BMHapticsCore.dotRows([1, 4, 5], !!S.mirror) }); });
    const padRows = [padRow, padStyleRow, padDotsRow];
    const showPad = (on) => { for (const r of padRows) r.hidden = !on; };
    showPad(!!(padState && padState.supported));
    const unsubPad = root.BMPadHaptics ? root.BMPadHaptics.onChange((st) => showPad(!!st.supported)) : null;

    // Switch 手柄按键：只有检测到 Switch Pro / Joy-Con 时才显示（按键帽字母 / 按物理位置）
    const swKeysRow = seg(STR.padSwitchKeys, 'padSwitchKeys', [{ value: 'keycap', text: STR.padSwitchKeycap }, { value: 'position', text: STR.padSwitchPosition }]);
    const swState = root.BMPadInput ? root.BMPadInput.state : null;
    swKeysRow.hidden = !(swState && swState.switch);
    const unsubSw = root.BMPadInput ? root.BMPadInput.onChange((st) => { swKeysRow.hidden = !st.switch; }) : null;

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
      ? h('div', { class: 'confirm-row', 'data-pad-layer': '1' },
        W.btn(STR.cancel, () => { confirming = false; again(C.sel('data-key', 'clear') + ' button'); }, { variant: 'text' }),
        W.btn(STR.confirm, () => {
          ctx.clearProgress();
          confirming = false;
          ctx.say(STR.cleared);
          again(C.sel('data-key', 'clear') + ' button');
        }, { variant: 'error' }))
      : W.btn(STR.clearBtn, () => { confirming = true; again(C.sel('data-key', 'clear') + ' .error-text'); }, { variant: 'error-text' });

    // 记录：导出 / 导入 / 撤销。控件原位更新（不重建页面，保持滚动位置与焦点）；导入先校验，确认后才覆盖。
    const recordKey = C.sel('data-key', 'record');
    const ctl = h('div', { class: 'confirm-row' });
    const recordItem = item(STR.record, ctl, 'record');
    let pending = null; // 已校验、等待确认的导入结果
    let confirmRow = null;
    let busy = false;
    const closeConfirm = (focus) => {
      pending = null;
      if (confirmRow) { confirmRow.remove(); confirmRow = null; }
      if (focus) { const t = recordItem.querySelector(focus); if (t) t.focus({ preventScroll: true }); }
    };
    const guard = async (fn) => { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } };
    function drawRecordButtons() {
      const btns = [
        W.btn(STR.exportBtn, () => guard(async () => {
          const r = await ctx.exportRecord();
          if (r !== 'canceled') ctx.toast(r === 'ok' ? STR.exported : STR.exportFail);
        }), { variant: 'text', label: STR.a11yExport }),
        W.btn(STR.importBtn, () => guard(async () => {
          closeConfirm();
          const r = await ctx.pickImport();
          if (r.canceled) return;
          if (!r.ok) { ctx.toast(STR.importReason[r.reason] || STR.importFail); return; }
          pending = r;
          confirmRow = h('div', { class: 'list-item', 'data-key': 'record-confirm', 'data-pad-layer': '1' },
            h('span', { class: 'li-label wrap', role: 'alert', text: STR.importSummary(r.imported, r.skipped) }),
            h('div', { class: 'li-ctl' }, h('div', { class: 'confirm-row' },
              W.btn(STR.cancel, () => closeConfirm('button'), { variant: 'text' }),
              W.btn(STR.overwrite, () => guard(async () => {
                const next = pending && pending.progress ? pending : null;
                closeConfirm();
                if (!next) return;
                const ok = await ctx.applyImport(next);
                ctx.toast(ok ? STR.importDone : STR.importFail);
                if (ok) again(recordKey + ' button');
              }), { variant: 'error' }))));
          recordItem.after(confirmRow);
          confirmRow.scrollIntoView({ block: 'nearest' });
          const cb = confirmRow.querySelector('button'); if (cb && !root.matchMedia('(pointer: coarse)').matches) cb.focus({ preventScroll: true });
        }), { variant: 'text', label: STR.a11yImport }),
      ];
      if (ctx.hasUndo) {
        btns.push(W.btn(STR.undoBtn, () => guard(async () => {
          closeConfirm();
          const ok = await ctx.undoImport();
          ctx.toast(ok ? STR.undone : STR.undoFail);
          again(recordKey + ' button');
        }), { variant: 'text', label: STR.a11yUndo }));
      }
      ctl.replaceChildren(...btns);
    }
    drawRecordButtons();

    // 关于：只显示「版本 x.y.z」；5 次点按（5 s 内）后再按住约 1.5 s 才显示反馈行（中途没有任何提示或反馈）。
    // 联系方式只来自本机 contact.json（经 boot 传入 ctx.contact）；缺失则什么都不显示。屏内状态存在 ctx 上。
    const A = root.BMAbout;
    const contact = ctx.contact && typeof ctx.contact.qq === 'string' && ctx.contact.qq ? ctx.contact : null;
    const seq = ctx.aboutSeq || (ctx.aboutSeq = A.createSecretSequence(A.SECRET));
    const verText = ctx.version || '';
    const about = h('section', { class: 'about' });
    const copyQq = () => { ctx.copyText(contact.qq).then((ok) => { if (ok) ctx.toast(STR.copied); }); };
    function revealFeedback() {
      if (!contact || about.querySelector('.about-feedback')) return;
      ctx.aboutOpen = true;
      const label = contact.label || STR.feedback;
      // 和上面几行同一种「标签 | 值」行：左边是标签（问题反馈），右边 QQ 号（点一下复制）和称呼
      about.append(h('div', { class: 'list-item about-feedback', role: 'group', 'aria-label': label },
        h('span', { class: 'li-label', text: label }),
        h('div', { class: 'li-ctl' },
          h('button', { class: 'about-qq', type: 'button', 'aria-label': STR.a11yCopyQq(contact.qq), onclick: copyQq, text: 'QQ ' + contact.qq }),
          contact.name ? h('span', { class: 'about-val', text: contact.name }) : null)));
    }
    let holdTimer = null;
    const stopHold = () => { if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; } };
    let pressed = false; // 松开后紧跟的事件不能把刚「武装」的序列清掉
    let startX = 0;
    let startY = 0;
    const press = () => {
      pressed = true;
      seq.down(Date.now());
      stopHold();
      // 到点判定：手指按住不动时，pointerup 之前（甚至 pointercancel 之后没有 pointerup 时）也能完成；到点仍未完成则整体清零
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (seq.poll(Date.now())) revealFeedback(); else seq.cancel();
        pressed = false;
      }, A.SECRET.holdMs + 10);
    };
    const release = () => { if (!pressed) return; pressed = false; stopHold(); if (seq.up(Date.now())) revealFeedback(); };
    const abort = () => { if (!pressed) return; pressed = false; stopHold(); seq.cancel(); };
    const isAct = (e) => e.key === 'Enter' || e.key === ' ';
    const MOVE_CANCEL_PX = 10;
    const verBtn = h('button', {
      class: 'about-ver', type: 'button', 'aria-label': verText ? STR.a11yVersion(verText) : null, text: verText || '',
      onpointerdown: (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        startX = e.clientX; startY = e.clientY;
        try { verBtn.setPointerCapture(e.pointerId); } catch (_) { /* 无捕获也能用 */ }
        press();
      },
      // 手指移出起点超过 10px 才取消；系统发来的 pointercancel（长按手势等）不清零，由到点定时器完成判定
      onpointermove: (e) => { if (pressed && Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_CANCEL_PX) abort(); },
      onpointerup: release,
      onkeydown: (e) => { if (isAct(e)) { if (!e.repeat) press(); e.preventDefault(); } },
      onkeyup: (e) => { if (isAct(e)) { release(); e.preventDefault(); } },
      onblur: abort,
      oncontextmenu: (e) => e.preventDefault(),
      ondragstart: (e) => e.preventDefault(),
    });
    // 项目地址：只能打开固定地址；失败时提示并把链接复制到剪贴板。与版本号分开、间距足够，点它不算彩蛋点按
    const openProject = async () => {
      let ok = false;
      try { ok = !!(await root.bm.openExternal(A.PROJECT_URL)); } catch (_) { ok = false; }
      if (ok) return;
      const copied = await ctx.copyText(A.PROJECT_URL);
      ctx.toast(copied ? STR.openFailCopied : STR.openFail);
    };
    const linkBtn = h('button', { class: 'about-link', type: 'button', 'aria-label': STR.a11yOpenLink(A.PROJECT_LABEL), text: A.PROJECT_LABEL, onclick: openProject });
    const aboutRow = (label, ctl) => h('div', { class: 'list-item' }, h('span', { class: 'li-label', text: label }), h('div', { class: 'li-ctl' }, ctl));
    about.append(
      aboutRow(STR.aboutVersion, verBtn),
      aboutRow(STR.repoLabel, linkBtn),
      aboutRow(STR.licenseLabel, h('span', { class: 'about-val', text: 'GPL-3.0' })),
      aboutRow(STR.devLabel, h('span', { class: 'about-val', text: 'Claude Code 协助开发' })));
    if (ctx.aboutOpen) revealFeedback();

    let uiStore;
    try { uiStore = root.BMUiState.createStore(root.localStorage); } catch (_) { uiStore = root.BMUiState.createStore(null); }
    const grp = (id, title, kids, forceOpen) => W.collapse({ title, cls: 'list', open: !!forceOpen || uiStore.isOpen(id), onToggle: (o) => uiStore.set(id, o) }, ...kids);

    const el = h('div', { class: 'page me-page' },
      W.topBar(null, h('h1', { text: STR.tabMe }), null),
      h('div', { class: 'page-body' },
        h('section', { class: 'stats-card' },
          stat(STR.weak, String(weak)),
          stat(STR.passedLabel, passed + '/' + status.length),
          stat(STR.starsLabel, stars + '/' + status.length * 3)),
        // 设置分组：默认只展开「练习」；展开 / 折叠就地进行，状态记在本机（不进存档、不导出）
        grp('look', STR.groupLook, [
          seg(STR.theme, 'theme', [
            { value: 'system', text: STR.themeSystem }, { value: 'light', text: STR.themeLight }, { value: 'dark', text: STR.themeDark },
          ], (v) => ctx.setTheme(v)),
          seg(STR.style, 'style', [
            { value: 'material', text: STR.styleMaterial }, { value: 'glass', text: STR.styleGlass },
          ], (v) => ctx.setStyle(v)),
          item(STR.color, swatches, 'seed'),
          seg(STR.view, 'mirror', [{ value: false, text: STR.read }, { value: true, text: STR.mirror }], (v) => ctx.setMirror(v)),
        ]),
        grp('practice', STR.groupPractice, [
          seg(STR.roundLength, 'roundLength', ctx.cfg.round.lengths.map((n) => ({ value: n, text: String(n) }))),
          seg(STR.qtype, 'qtype', [
            { value: 'dots', text: STR.qtypeDots }, { value: 'choose', text: STR.qtypeChoose }, { value: 'mix', text: STR.qtypeMix },
          ]),
          sw(STR.autoNext, 'autoNext'),
          sw(STR.timing, 'timing'),
          sw(STR.fx, 'fx', () => ctx.fx.sync()),
          root.BMHaptics && root.BMHaptics.supported ? sw(STR.haptics, 'haptics') : null,
          padRow,
          padStyleRow,
          padDotsRow,
          swKeysRow,
        ]),
        grp('data', STR.groupData, [recordItem, item(STR.clear, clearCtl, 'clear')], !!params.confirm),
        grp('about', STR.groupAbout, [about])));

    function onKey(e) {
      if (e.key === 'Escape' && pending) { closeConfirm('button'); return true; }
      if (e.key === 'Escape' && confirming) { confirming = false; again(C.sel('data-key', 'clear') + ' button'); return true; }
      return false;
    }
    return { el, onKey, tab: 'me', destroy() { if (unsubPad) unsubPad(); if (unsubSw) unsubSw(); }, api: { askClear() { confirming = true; again(); } } };
  };
})(typeof self !== 'undefined' ? self : this);
