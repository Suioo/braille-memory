/**
 * 手柄操控（界面层）：把 core/padnav.js 产生的动作变成对页面的操作。window.BMPadUI
 *
 * 键位（按物理位置，见 docs/gamepad-haptics.md 的对照表）：
 *   左摇杆 / 十字键  按屏幕上的方向就近移动焦点（按住 400 ms 后每 120 ms 连发）
 *   A 确认（点击当前焦点）   B 返回 / 关闭确认行（等同 Esc）
 *   X 页面的次要动作：学习卡翻面；翻盲文题输入「空方」（等同空格键）
 *   Y 页面的主要动作：提交 / 下一方 / 下一题 / 继续 / 开始（点击 .fab 主按钮）
 *   LB / RB 切换页顶的「基础 | 扩展 | 规则…」分段控件；多方输入题里是上一方 / 下一方
 *   LT / RT 在类别芯片之间切换；翻盲文题输入里 LT = 退格
 *   Start 打开设置   View(Select) 在底部四个标签之间循环
 * 启动画面期间任何键只用来跳过动画；确认行（[data-pad-layer]）打开时焦点只在它里面，B 取消它。
 * 手柄一有输入就给 <html> 加 data-input="pad"（CSS 据此显示焦点框，与键盘 :focus-visible 一致）；鼠标 / 触屏 / 键盘操作后去掉。
 */
(function (root) {
  'use strict';
  const Nav = root.BMPadNav;
  const FOCUSABLE = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"]), [role="button"]';
  const TABS = ['learn', 'practice', 'course', 'me'];
  const ESC = { key: 'Escape', repeat: false, preventDefault() {} };
  const SPACE = { key: ' ', repeat: false, preventDefault() {} };
  const ARROW = (key) => ({ key, repeat: false, preventDefault() {} });

  /** ctx 需要提供：currentView()、back()、go()；haptic 用 BMPadHaptics（只震手柄，不让手机跟着震）。 */
  function create(ctx, doc) {
    doc = doc || root.document;
    const html = doc.documentElement;
    const scrollerOf = (el) => (el && el.closest && el.closest('.page-body')) || null;

    // ---------- 焦点框 ----------
    const padMode = () => html.dataset.input === 'pad';
    const setPadMode = () => { if (!padMode()) html.dataset.input = 'pad'; };
    const clearPadMode = () => { if (padMode()) delete html.dataset.input; };
    for (const t of ['pointerdown', 'mousedown', 'touchstart', 'keydown']) doc.addEventListener(t, clearPadMode, true);

    // ---------- 范围：启动画面 > 确认行 > 当前页面 ----------
    const shown = (el) => {
      if (!el || !el.isConnected) return false;
      if (typeof el.checkVisibility === 'function') return el.checkVisibility({ visibilityProperty: true });
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    function topLayer() {
      const all = doc.querySelectorAll('[data-pad-layer], [aria-modal="true"]');
      for (let i = all.length - 1; i >= 0; i--) if (shown(all[i])) return all[i];
      return null;
    }
    const screenEl = () => doc.querySelector('#app .screen') || doc.body;
    const scopeRoot = () => topLayer() || screenEl();

    function usable(el) {
      if (el.disabled || el.hidden || !shown(el)) return false;
      if (el.closest('[aria-hidden="true"], [hidden], [inert]')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
    const candidates = (scope) => Array.from(scope.querySelectorAll(FOCUSABLE)).filter(usable);
    const lost = () => {
      const a = doc.activeElement;
      return !a || a === doc.body || a === doc.documentElement || !a.isConnected || (a.classList && a.classList.contains('screen'));
    };

    function focusEl(el, scroll) {
      try { el.focus({ preventScroll: true }); } catch (_) { return; }
      if (scroll !== false && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { /* 旧内核 */ } }
    }
    const tick = () => { try { if (root.BMPadHaptics) root.BMPadHaptics.play('tick'); } catch (_) { /* 静默 */ } };

    /** 没有焦点时落在哪：确认行里第一个按钮（取消）> data-autofocus > 点位 > 可用的主按钮 > 页面内容里第一个。 */
    function defaultTarget(scope) {
      const list = candidates(scope);
      if (!list.length) return null;
      if (scope !== screenEl()) return list[0];
      const auto = list.find((el) => el.hasAttribute('data-autofocus'));
      if (auto) return auto;
      const dot = list.find((el) => el.classList.contains('dot'));
      if (dot) return dot;
      const fab = list.find((el) => el.classList.contains('fab'));
      if (fab) return fab;
      const body = scope.querySelector('.page-body');
      return list.find((el) => body && body.contains(el)) || list[0];
    }
    function ensureFocus() {
      const scope = scopeRoot();
      const a = doc.activeElement;
      if (a && scope.contains(a) && a !== scope && candidates(scope).includes(a)) { focusEl(a); return a; }
      const t = defaultTarget(scope);
      if (t) focusEl(t);
      return t;
    }

    // ---------- 移动 ----------
    function move(dir) {
      const scope = scopeRoot();
      const cur = doc.activeElement;
      const list = candidates(scope);
      const from = list.indexOf(cur);
      if (from < 0) { ensureFocus(); return; }
      const items = list.map((el, i) => ({ id: i, rect: el.getBoundingClientRect() }));
      const to = Nav.pickNext(items[from].rect, items, dir, from);
      if (to == null) {
        // 那个方向没有可聚焦的东西：上下方向就滚动页面内容
        const sc = scrollerOf(cur);
        if (sc && (dir === 'up' || dir === 'down') && scope === screenEl()) sc.scrollBy({ top: dir === 'down' ? 120 : -120, behavior: 'auto' });
        return;
      }
      focusEl(list[to]);
      tick();
    }

    // ---------- 按钮类动作 ----------
    function click() {
      const scope = scopeRoot();
      const a = doc.activeElement;
      if (!a || a === scope || !scope.contains(a) || !candidates(scope).includes(a)) { ensureFocus(); return; }
      if (a.matches('input[type="text"], input:not([type]), textarea')) return;
      a.click();
      settle();
    }
    /** 点击后页面可能重画掉了焦点：已经在手柄模式就把焦点放回合适的位置（延迟再查一次，兼容异步重画）。 */
    function settle() {
      const check = () => { if (padMode() && lost()) { const t = defaultTarget(scopeRoot()); if (t) focusEl(t); } };
      check();
      root.setTimeout(check, 120);
    }
    function primary() {
      const scope = scopeRoot();
      if (scope !== screenEl()) return;
      const fab = Array.from(scope.querySelectorAll('.fab')).find(usable);
      if (fab) { fab.click(); settle(); }
    }
    function cycleGroup(sel, delta) {
      const scope = scopeRoot();
      const g = Array.from(scope.querySelectorAll(sel)).find(shown);
      if (!g) return false;
      const opts = Array.from(g.querySelectorAll('[role="radio"]')).filter((o) => !o.disabled && shown(o));
      if (opts.length < 2) return true;
      const i = Math.max(0, opts.findIndex((o) => o.getAttribute('aria-checked') === 'true'));
      const j = Nav.cycle(opts.length, i, delta, false);
      if (j === i) return true;
      opts[j].click();
      tick();
      if (lost()) focusEl(opts[j]);
      return true;
    }
    function goTab(key) {
      ctx.go(key, { focus: '.nav-item.active' }, { dir: 'tab' });
    }
    function cycleTabs() {
      const v = ctx.currentView();
      const cur = TABS.indexOf((v && v.tab) || ctx.lastTab || 'learn');
      goTab(TABS[Nav.cycle(TABS.length, cur < 0 ? 0 : cur, 1, true)]);
    }

    function press(action) {
      const view = ctx.currentView();
      if (!view) return;
      const layer = topLayer();
      if (action === 'confirm') { click(); return; }
      if (action === 'back') {
        if (layer) {
          if (view.onKey && view.onKey(ESC)) return;
          const b = layer.querySelector('button'); // 确认行的第一个按钮是「取消」
          if (b) b.click();
          return;
        }
        ctx.back();
        return;
      }
      if (layer) return; // 确认行打开时，其余键不动底下的页面
      if (view.onPad && view.onPad(action)) { settle(); return; }
      switch (action) {
        case 'x': if (view.onKey && view.onKey(SPACE)) settle(); break;
        case 'y': primary(); break;
        case 'lb': case 'rb': {
          const d = action === 'lb' ? -1 : 1;
          if (!cycleGroup('.module-seg .segmented', d) && view.onKey) view.onKey(ARROW(d < 0 ? 'ArrowLeft' : 'ArrowRight'));
          break;
        }
        case 'lt': cycleGroup('.chip-row', -1); break;
        case 'rt': cycleGroup('.chip-row', 1); break;
        case 'start': if (view.tab !== 'me') goTab('me'); break;
        case 'view': cycleTabs(); break;
        default: break;
      }
    }

    /** 处理 core/padnav.js 的一个事件。 */
    function handle(ev) {
      if (!ev) return;
      if (root.BMSplash && root.BMSplash.active) { if (ev.type === 'press') root.BMSplash.skip(); return; }
      const wasShown = padMode();
      setPadMode();
      // 焦点框还没显示时，第一次方向 / 确认只负责把它显示出来，免得误触
      if (!wasShown && (ev.type === 'dir' || ev.action === 'confirm')) { ensureFocus(); return; }
      if (ev.type === 'dir') move(ev.dir);
      else if (ev.type === 'press') press(ev.action);
    }

    // 手柄模式下焦点被重画掉（自动下一题、换页）时，自动落回合适的位置，不用多按一下
    let pending = null;
    if (typeof root.MutationObserver === 'function') {
      const app = doc.getElementById('app');
      if (app) {
        new root.MutationObserver(() => {
          if (pending || !padMode()) return;
          pending = root.setTimeout(() => {
            pending = null;
            if (padMode() && lost() && !(root.BMSplash && root.BMSplash.active)) { const t = defaultTarget(scopeRoot()); if (t) focusEl(t, false); }
          }, 60);
        }).observe(app, { childList: true, subtree: true });
      }
    }

    return { handle, press, move, ensureFocus, scopeRoot };
  }

  root.BMPadUI = { create };
})(typeof self !== 'undefined' ? self : this);
