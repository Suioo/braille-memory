/**
 * 界面部件（Material 3 风格）：顶部应用栏、底部导航栏、按钮、芯片、分段按钮、开关、
 * 盲文方、点点位输入、选符号输入、学习卡、星、进度条、揭晓面板。
 * window.BMW。只负责显示与输入，不含规则。
 */
(function (root) {
  'use strict';
  const { h, s, ICON, symClass, replay } = root.BMDom;
  const { DOT_NUMBERS, dotPosition, cellLayout } = root.BMCell;
  const STR = root.STR;
  /** 外部挂钩（app.js 注入）：tick = 轻震（滑过分段 / 迷你图翻面）。 */
  const hooks = { tick: null };

  // ---------- 盲文方 ----------
  /**
   * @param {object} o
   * @param {Set<number>} o.dots 凸起点
   * @param {boolean} o.mirror 镜像（只换列，不换编号）
   * @param {boolean} [o.numbers] 显示编号
   * @param {{hit:number[],missed:number[],extra:number[]}|null} [o.reveal]
   * @param {(n:number, el:HTMLElement)=>void} [o.onToggle] 有则可点
   */
  function cellEl(o) {
    const interactive = !!o.onToggle;
    const cell = h('div', { class: 'cell' + (o.mirror ? ' mirrored' : ''), role: interactive ? 'group' : 'img' });
    let missedIdx = 0;
    for (const n of DOT_NUMBERS) {
      const pos = dotPosition(n, o.mirror);
      let state = o.dots.has(n) ? 'on' : 'off';
      let badge = null;
      if (o.reveal) {
        if (o.reveal.hit.includes(n)) { state = 'on hit'; badge = ICON.check(); }
        else if (o.reveal.missed.includes(n)) { state = 'missed'; badge = ICON.plus(); }
        else if (o.reveal.extra.includes(n)) { state = 'on extra'; badge = ICON.cross(); }
        else state = 'off';
      }
      const ring = s('svg', { class: 'ring', viewBox: '0 0 100 100', 'aria-hidden': 'true' },
        s('rect', { x: 3, y: 3, width: 94, height: 94, rx: 47, pathLength: 96 }));
      const dot = h(interactive ? 'button' : 'span', {
        class: 'dot ' + state + (interactive ? ' interactive' : ''),
        'data-n': n,
        type: interactive ? 'button' : null,
        'aria-label': interactive ? STR.a11yDot(n) : null,
        'aria-pressed': interactive ? String(o.dots.has(n)) : null,
        'aria-hidden': interactive ? null : 'true',
      }, ring,
      o.numbers ? h('span', { class: 'num', 'aria-hidden': 'true', text: String(n) }) : null,
      h('span', { class: 'badge', 'aria-hidden': 'true' }, badge));
      dot.style.gridRow = String(pos.row);
      dot.style.gridColumn = String(pos.col);
      if (state === 'missed') dot.style.setProperty('--i', String(missedIdx++));
      if (interactive) dot.addEventListener('click', () => o.onToggle(n, dot));
      cell.append(dot);
    }
    if (!interactive) cell.setAttribute('aria-label', STR.a11yCell([...o.dots].sort().join('')));
    return cell;
  }

  /**
   * 迷你预览点图：像真实盲文的小方格（无编号、无角标）。凸起 = 实心小圆，空位 = 很淡的细圈。
   * 跟随阅读/镜像视角；读屏名称列出凸起点编号。
   * @param {number[]} dots
   * @param {boolean} mirror
   * @param {{xs?:boolean, fade?:boolean}} [o] xs = 芯片内超小号；fade = 随揭晓淡入
   */
  function miniCellEl(dots, mirror, o) {
    o = o || {};
    const flippable = !!o.flippable;
    const orient = root.BMInteract.createMiniOrient(mirror);
    const el = h(flippable ? 'button' : 'span', {
      class: 'mini-cell' + (o.xs ? ' xs' : '') + (o.fade ? ' mini-in' : '') + (flippable ? ' flippable' : ''),
      type: flippable ? 'button' : null,
      role: flippable ? null : 'img',
      'aria-label': flippable ? STR.a11yMini(orient.mirror) : STR.a11yCell(dots.slice().sort((a, b) => a - b).join('')),
      'aria-pressed': flippable ? 'false' : null,
    });
    const cells = [];
    for (let k = 0; k < 6; k++) { const i = h('i', { 'aria-hidden': 'true' }); cells.push(i); el.append(i); }
    /** 按迷你图自己的朝向摆放（点位只来自传入的 CSV 行数据）。 */
    const layout = () => {
      cellLayout(dots, orient.mirror).forEach((d, k) => {
        cells[k].classList.toggle('r', d.raised);
        cells[k].style.gridRow = String(d.row);
        cells[k].style.gridColumn = String(d.col);
      });
    };
    layout();
    if (flippable) {
      let anims = [];
      const stop = () => { for (const a of anims) a.cancel(); anims = []; };
      const reduced = () => typeof root.matchMedia === 'function' && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.addEventListener('click', () => {
        orient.toggle();
        el.setAttribute('aria-pressed', String(orient.flipped));
        el.setAttribute('aria-label', STR.a11yMini(orient.mirror));
        if (hooks.tick) hooks.tick();
        stop();
        if (reduced() || typeof el.animate !== 'function') { layout(); return; }
        // 水平翻面：先压扁到 0，在中点换朝向，再展开（共约 260 ms）
        const out = el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
          { duration: 130, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)', fill: 'forwards' });
        anims = [out];
        out.onfinish = () => {
          layout();
          const back = el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }],
            { duration: 130, easing: 'cubic-bezier(0.05, 0.7, 0.1, 1)' });
          anims = [back];
          back.onfinish = () => { anims = []; };
          out.cancel();
        };
      });
    }
    return el;
  }

  /** 点点位输入：管理选中集合、回弹动画、揭晓。外层是 surface-container 卡片。 */
  class DotsInput {
    /** @param {{mirror:boolean, numbers:boolean}} o */
    constructor(o) {
      this.mirror = o.mirror;
      this.numbers = o.numbers;
      this.selected = new Set();
      this.reveal = null;
      this.locked = false;
      this.onChange = null;
      this.el = h('div', { class: 'cell-card input-cell' });
      this.render();
    }
    render() {
      this.el.classList.toggle('revealed', !!this.reveal);
      this.el.replaceChildren(cellEl({
        dots: this.selected, mirror: this.mirror,
        numbers: this.numbers || !!this.reveal,
        reveal: this.reveal,
        onToggle: this.locked ? null : (n, el) => this.toggle(n, el),
      }));
    }
    /** 按点位编号切换（键盘 1–6 也走这里）。 */
    toggle(n, el) {
      if (this.locked) return;
      if (this.selected.has(n)) this.selected.delete(n); else this.selected.add(n);
      const dot = el || this.el.querySelector('.dot[data-n="' + n + '"]');
      if (dot) {
        const on = this.selected.has(n);
        dot.classList.toggle('on', on);
        dot.classList.toggle('off', !on);
        dot.setAttribute('aria-pressed', String(on));
        replay(dot, 'pop');
      }
      if (this.onTap) this.onTap(n, this.selected.has(n));
      if (this.onChange) this.onChange();
    }
    /** 预设选中（截图用）。 */
    set(dots) { this.selected = new Set(dots); this.render(); }
    setMirror(m) { this.mirror = m; this.render(); }
    /** 锁定并显示揭晓态。 */
    showReveal(judge) { this.locked = true; this.reveal = judge; this.render(); }
    /** 锁定（答对）。 */
    lock() { this.locked = true; this.el.classList.add('correct'); this.render(); }
    get dots() { return [...this.selected].sort((a, b) => a - b); }
  }

  /** 选符号输入：4 个选项卡片，键 1–4。 */
  class ChooseInput {
    constructor(options, onPick) {
      this.options = options;
      this.locked = false;
      this.el = h('div', { class: 'options', role: 'group' });
      this.buttons = options.map((row, i) => h('button', {
        class: 'option sl', type: 'button', 'data-id': row.id, 'data-nav': 'options',
        'aria-label': STR.a11yOption(i + 1, row.symbol),
        onclick: () => { if (!this.locked) onPick(row.id); },
      }, h('span', { class: 'key', 'aria-hidden': 'true', text: String(i + 1) }),
      h('span', { class: 'osym ' + symClass(row.symbol), text: row.symbol }),
      h('span', { class: 'mark', 'aria-hidden': 'true' })));
      this.el.append(...this.buttons);
    }
    idAt(k) { return this.options[k - 1] ? this.options[k - 1].id : null; }
    /** 正确项 ✓（primary），选错项 ✕（error，虚线框）。 */
    showResult(pickedId, correctId) {
      this.locked = true;
      for (const b of this.buttons) {
        const id = Number(b.dataset.id);
        b.disabled = true;
        const mark = b.querySelector('.mark');
        if (id === correctId) { b.classList.add('right'); mark.replaceChildren(ICON.check()); }
        else if (id === pickedId) { b.classList.add('wrong'); mark.replaceChildren(ICON.cross()); }
        else b.classList.add('dim');
      }
    }
  }

  // ---------- 学习卡 ----------
  function cardEl(row, o) {
    const front = h('div', { class: 'face front' }, h('div', { class: 'sym ' + symClass(row.symbol), text: row.symbol }));
    const back = h('div', { class: 'face back' },
      h('div', { class: 'back-head' }, miniCellEl(row.dots, o.mirror, { flippable: true }), h('div', { class: 'sym small', text: row.symbol })),
      h('div', { class: 'card-cell' }, cellEl({ dots: new Set(row.dots), mirror: o.mirror, numbers: true })),
      h('div', { class: 'digits', text: row.dotsText }));
    const el = h('div', { class: 'card' }, h('div', { class: 'card-inner' }, front, back));
    let flipped = false;
    const set = (f) => {
      flipped = f;
      el.classList.toggle('flipped', f);
      front.setAttribute('aria-hidden', String(f));
      back.setAttribute('aria-hidden', String(!f));
    };
    set(!!o.flipped);
    return { el, flip: () => { set(!flipped); if (o.onFlip) o.onFlip(el); return flipped; }, set, get flipped() { return flipped; } };
  }

  // ---------- 星（三个盲文点） ----------
  function starsEl(n, big) {
    const el = h('span', { class: 'stars' + (big ? ' big' : ''), role: 'img', 'aria-label': STR.a11yStars(n) });
    for (let i = 0; i < 3; i++) el.append(h('i', { class: i < n ? 'on' : '' }));
    return el;
  }

  // ---------- 按钮 ----------
  /**
   * M3 普通按钮。variant: filled | tonal | outlined | text | error-text
   */
  function btn(text, onclick, o) {
    o = o || {};
    return h('button', {
      class: 'btn sl ' + (o.variant || 'filled') + (o.cls ? ' ' + o.cls : ''), type: 'button',
      onclick, disabled: !!o.disabled, 'aria-label': o.label || null, 'data-autofocus': o.autofocus ? '' : null,
    }, o.icon ? o.icon : null, h('span', { text }));
  }
  /** M3 图标按钮。variant: standard | tonal | filled | outlined；toggle = 是否按下（可切换按钮）。 */
  function iconBtn(icon, label, onclick, o) {
    o = o || {};
    return h('button', {
      class: 'icon-btn sl ' + (o.variant || 'standard') + (o.cls ? ' ' + o.cls : ''), type: 'button',
      'aria-label': label, title: label, onclick, disabled: !!o.disabled,
      'aria-pressed': o.toggle == null ? null : String(!!o.toggle),
    }, icon);
  }
  /** 筛选芯片：选中时前置 ✓。 */
  function filterChip(text, selected, onclick, o) {
    o = o || {};
    const b = h('button', {
      class: 'chip filter sl' + (selected ? ' selected' : ''), type: 'button', role: 'radio',
      'aria-checked': String(!!selected), 'data-nav': o.nav || null, onclick,
    }, h('span', { class: 'chip-ico', 'aria-hidden': 'true' }, ICON.check()), h('span', { text }),
    o.count != null ? h('span', { class: 'n', text: String(o.count) }) : null);
    /** 就地改选中态（同一个节点，✓ 淡入 / 形状变形由 CSS 过渡播放）。 */
    b.setSelected = (v) => { b.classList.toggle('selected', !!v); b.setAttribute('aria-checked', String(!!v)); };
    return b;
  }
  /** 辅助芯片（静态）。 */
  const assistChip = (text) => h('span', { class: 'chip assist', role: 'listitem', text });
  /** 带迷你点图的辅助芯片（结果页答错符号）。 */
  const symbolChip = (row, mirror) => h('span', { class: 'chip assist with-mini', role: 'listitem', 'aria-label': row.symbol + ' ' + STR.a11yCell(row.dotsText) },
    miniCellEl(row.dots, mirror, { xs: true }), h('span', { text: row.symbol }));

  /**
   * 分段按钮（单选）：选中段前置 ✓（始终在 DOM 里，靠 CSS 淡入），选中底板是一个会滑动的指示块（.seg-ind）。
   * 返回的元素带 select(value)：就地改选中态（同一个节点，CSS 过渡可播放）。←/→ 移动焦点。
   */
  function segmented(label, options, current, onChange) {
    const I = root.BMInteract;
    const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
    const nav = 'seg-' + Math.random().toString(36).slice(2, 8);
    const ind = h('span', { class: 'seg-ind no-anim', 'aria-hidden': 'true' });
    const btns = [];
    let cur = current;
    let dragEnd = 0;
    group.append(ind);
    for (const opt of options) {
      const b = h('button', {
        class: 'seg sl', type: 'button', role: 'radio',
        'data-nav': nav, 'data-value': String(opt.value),
        onclick: () => { if (Date.now() - dragEnd > 150 && opt.value !== cur) onChange(opt.value); },
      }, h('span', { class: 'chip-ico' }, ICON.check()), h('span', { text: opt.text }));
      b._value = opt.value;
      btns.push(b);
      group.append(b);
    }
    function mark() {
      for (const b of btns) {
        const on = b._value === cur;
        b.classList.toggle('selected', on);
        b.setAttribute('aria-checked', String(on));
      }
    }
    /** 把指示块放到 target（默认当前选中段）。 */
    function place(animate, target) {
      const sel = target || btns.find((b) => b.classList.contains('selected'));
      if (!sel || !sel.offsetWidth) return;
      ind.classList.toggle('no-anim', !animate);
      ind.style.width = sel.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + sel.offsetLeft + 'px)';
    }
    mark();
    let busy = 0;
    // 选中段的 ✓ 占位会让整体宽度立即变化；动画期间忽略这次尺寸回调，否则指示块会被瞬间拉到终点
    group.select = (v) => { cur = v; mark(); busy = Date.now() + 500; place(true); };
    // 首次排版 / 尺寸变化（字号缩放、旋转）后无动画就位
    if (typeof root.ResizeObserver === 'function') new root.ResizeObserver(() => { if (Date.now() > busy) place(false); }).observe(group);
    else if (root.requestAnimationFrame) root.requestAnimationFrame(() => place(false));

    // ---------- 按住滑动：指示块跟着指针吸附到所在段，松手才选中 ----------
    let drag = null;
    const measure = () => {
      const g = group.getBoundingClientRect();
      return { rects: btns.map((b) => { const r = b.getBoundingClientRect(); return { left: r.left, right: r.right }; }), box: { top: g.top, bottom: g.bottom } };
    };
    group.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.isPrimary === false) return;
      const m = measure();
      drag = Object.assign({ id: e.pointerId, x0: e.clientX, y0: e.clientY, sliding: false, hover: I.segmentIndexFromX(e.clientX, m.rects) }, m);
    });
    group.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.sliding) {
        if (!I.exceedsSlide(e.clientX - drag.x0, e.clientY - drag.y0)) return;
        drag.sliding = true;
        try { group.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
        group.classList.add('dragging');
        busy = Date.now() + 600;
        if (drag.hover >= 0) place(true, btns[drag.hover]);
      }
      const idx = I.hoverIndex(e.clientX, e.clientY, drag.rects, drag.box);
      if (idx === drag.hover) return;
      drag.hover = idx;
      busy = Date.now() + 600;
      if (idx < 0) place(true); else { place(true, btns[idx]); if (hooks.tick) hooks.tick(); }
    });
    const finish = (e, commit) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      group.classList.remove('dragging');
      if (!d.sliding) return; // 点按交给 click
      dragEnd = Date.now();
      try { group.releasePointerCapture(d.id); } catch (_) { /* 忽略 */ }
      if (commit && d.hover >= 0 && btns[d.hover]._value !== cur) onChange(btns[d.hover]._value);
      else { busy = Date.now() + 600; place(true); }
    };
    group.addEventListener('pointerup', (e) => finish(e, true));
    group.addEventListener('pointercancel', (e) => finish(e, false));
    // 触屏有隐式捕获：改由 group 捕获时按钮的 lostpointercapture 会冒泡上来，必须忽略，否则拖动一开始就被取消
    group.addEventListener('lostpointercapture', (e) => { if (e.target === group) finish(e, false); });
    return group;
  }
  /** 开关（role=switch）。返回的元素带 setChecked(v)：就地改状态，滑块 / 轨道颜色 / ✓ 随 CSS 过渡。 */
  function switchEl(label, checked, onChange) {
    const el = h('button', {
      class: 'switch' + (checked ? ' on' : ''), type: 'button', role: 'switch', 'aria-checked': String(!!checked),
      'aria-label': label, onclick: () => onChange(!checked),
    }, h('span', { class: 'track' }, h('span', { class: 'thumb' }, ICON.check())));
    el.setChecked = (v) => { checked = !!v; el.classList.toggle('on', checked); el.setAttribute('aria-checked', String(checked)); };
    return el;
  }

  /** 顶部应用栏：前导 / 标题 / 尾部操作。 */
  function topBar(leading, title, trailing) {
    return h('header', { class: 'top-bar' },
      h('div', { class: 'tb-lead' }, leading),
      h('div', { class: 'tb-title' }, title),
      h('div', { class: 'tb-trail' }, trailing));
  }

  /** 上一次显示的导航指示块所在标签：页面（含导航栏）每次切换都会重建，靠它让新导航栏的指示块从旧位置滑到新位置。 */
  let navPrevKey = null;
  /**
   * 底部导航栏。items: [{key, label, icon}]
   * 选中底板是一块会滑动的指示块（.nav-pill，JS 只写 width / translateX）：点按切换时从上一个标签滑过来；
   * 按住横向拖动时指示块跟着指针吸附到所在标签，松手才跳转（和分段按钮一致）。
   */
  function navBar(items, current, onSelect) {
    const I = root.BMInteract;
    const nav = h('nav', { class: 'nav-bar', 'aria-label': STR.appName });
    const pill = h('span', { class: 'nav-pill no-anim', 'aria-hidden': 'true' });
    nav.append(pill);
    let dragEnd = 0;
    const btns = items.map((it) => {
      const b = h('button', {
        class: 'nav-item' + (it.key === current ? ' active' : ''), type: 'button', 'data-nav': 'navbar',
        'aria-current': it.key === current ? 'page' : null, 'data-tab': it.key,
        onclick: (e) => { if (Date.now() - dragEnd > 150 && it.key !== current) onSelect(it.key, e.detail === 0); }, // detail 0 = 键盘触发
      }, h('span', { class: 'nav-ind sl' }, it.icon()), h('span', { class: 'nav-label', text: it.label }));
      b._key = it.key;
      nav.append(b);
      return b;
    });
    const byKey = (k) => btns.find((b) => b._key === k);
    /** 把指示块放到 target 按钮的图标位置（相对导航栏）。 */
    function place(animate, target) {
      if (!target) return false;
      const ico = target.querySelector('.nav-ind');
      if (!ico || !ico.offsetWidth) return false;
      // 用布局尺寸（不受按下时的缩放影响）：按钮在导航栏内，图标在按钮内，二者都是定位祖先
      pill.classList.toggle('no-anim', !animate);
      pill.style.width = ico.offsetWidth + 'px';
      pill.style.height = ico.offsetHeight + 'px';
      pill.style.top = (target.offsetTop + ico.offsetTop) + 'px';
      pill.style.transform = 'translateX(' + (target.offsetLeft + ico.offsetLeft) + 'px)';
      return true;
    }
    const cur = byKey(current);
    let busy = 0;
    let started = false;
    const start = () => {
      if (started) return;
      const from = navPrevKey && navPrevKey !== current ? byKey(navPrevKey) : null;
      if (!place(false, from || cur)) return;
      started = true;
      if (from) { void pill.offsetWidth; busy = Date.now() + 500; place(true, cur); }
      navPrevKey = current;
    };
    nav.start = start; // 页面插入 DOM 后由 app.js 立即调用：同一帧内就位，指示块不会闪空
    if (typeof root.ResizeObserver === 'function') {
      new root.ResizeObserver(() => { if (!started) start(); else if (Date.now() > busy && !nav.classList.contains('dragging')) place(false, cur); }).observe(nav);
    } else if (root.requestAnimationFrame) root.requestAnimationFrame(start);

    // ---------- 按住滑动 ----------
    let drag = null;
    const measure = () => {
      const g = nav.getBoundingClientRect();
      return { rects: btns.map((b) => { const r = b.getBoundingClientRect(); return { left: r.left, right: r.right }; }), box: { top: g.top, bottom: g.bottom } };
    };
    nav.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.isPrimary === false) return;
      const m = measure();
      drag = Object.assign({ id: e.pointerId, x0: e.clientX, y0: e.clientY, sliding: false, hover: I.segmentIndexFromX(e.clientX, m.rects) }, m);
    });
    nav.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.sliding) {
        if (!I.exceedsSlide(e.clientX - drag.x0, e.clientY - drag.y0)) return;
        drag.sliding = true;
        try { nav.setPointerCapture(e.pointerId); } catch (_) { /* 忽略 */ }
        nav.classList.add('dragging');
        busy = Date.now() + 600;
        if (drag.hover >= 0) place(true, btns[drag.hover]);
      }
      const idx = I.hoverIndex(e.clientX, e.clientY, drag.rects, drag.box);
      if (idx === drag.hover) return;
      drag.hover = idx;
      busy = Date.now() + 600;
      if (idx < 0) place(true, cur); else { place(true, btns[idx]); if (hooks.tick) hooks.tick(); }
    });
    const finish = (e, commit) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      nav.classList.remove('dragging');
      if (!d.sliding) return; // 点按交给 click
      dragEnd = Date.now();
      try { nav.releasePointerCapture(d.id); } catch (_) { /* 忽略 */ }
      if (commit && d.hover >= 0 && btns[d.hover]._key !== current) {
        navPrevKey = btns[d.hover]._key; // 新导航栏的指示块直接就位在松手处，不再从旧位置回滑
        onSelect(btns[d.hover]._key);
      } else { busy = Date.now() + 600; place(true, cur); }
    };
    nav.addEventListener('pointerup', (e) => finish(e, true));
    nav.addEventListener('pointercancel', (e) => finish(e, false));
    // 触屏有隐式捕获：改由 nav 捕获时按钮的 lostpointercapture 会冒泡上来，必须忽略，否则拖动一开始就被取消
    nav.addEventListener('lostpointercapture', (e) => { if (e.target === nav) finish(e, false); });
    return nav;
  }

  // ---------- 结果标记 ----------
  function verdictEl(ok) {
    return s('svg', { class: 'verdict ' + (ok ? 'ok' : 'bad'), viewBox: '0 0 52 52', role: 'img',
      'aria-label': ok ? STR.a11yCorrect : STR.a11yIncorrect },
    s('circle', { cx: 26, cy: 26, r: 24 }),
    s('path', ok ? { d: 'M15 27l7 7 15-16', pathLength: 1 } : { d: 'M18 18l16 16M34 18L18 34' }));
  }
  /** 图例：漏点 = 虚线圆 +，多点 = 实心圆 ✕。 */
  function legendGlyph(kind) {
    return s('svg', { class: 'lg ' + kind, viewBox: '0 0 32 32', 'aria-hidden': 'true' },
      s('circle', { cx: 16, cy: 16, r: 14, pathLength: 48 }),
      s('path', { d: kind === 'missed' ? 'M16 10v12M10 16h12' : 'M11.5 11.5l9 9M20.5 11.5l-9 9' }));
  }
  function revealPanel(judge, correctDigits) {
    return h('div', { class: 'result-row' },
      verdictEl(false),
      h('div', { class: 'legend' },
        h('div', { class: 'legend-row', 'aria-label': STR.a11yMissed(judge.missed) }, legendGlyph('missed'), String(judge.missed.length)),
        h('div', { class: 'legend-row', 'aria-label': STR.a11yExtra(judge.extra) }, legendGlyph('extra'), String(judge.extra.length))),
      answerDigits(correctDigits));
  }
  function answerDigits(digits) {
    return h('div', { class: 'answer' }, h('span', { class: 'k', text: STR.answer }), h('span', { class: 'digits', text: digits }));
  }

  /** M3 线性进度条。 */
  function progressBar(value, label) {
    const el = h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100',
      'aria-valuenow': String(Math.round(value * 100)), 'aria-label': label || null },
    h('span', { class: 'bar-active' }), h('span', { class: 'bar-stop' }));
    el.style.setProperty('--v', String(Math.max(0, Math.min(1, value))));
    return el;
  }


  // ---------- 扩展符号（多方） ----------
  /** 类别小标签（题面 / 学习卡上始终标明类别，避免与主表同点位的符号混淆）。 */
  const catTag = (name) => h('span', { class: 'cat-tag', 'aria-label': STR.a11yCat(name), text: name });

  /**
   * 整串迷你点图，按显示顺序排列（阅读：第 1 方在最左；扎写：整串从右往左、各方内部左右列互换）。
   * @param {number[][]} cells
   * @param {boolean} mirror
   * @param {{xs?:boolean}} [o]
   */
  function seqStripEl(cells, mirror, o) {
    o = o || {};
    const text = cells.map((c) => c.join('')).join(' ');
    const el = h('span', { class: 'seq-strip' + (o.xs ? ' xs' : ''), role: 'img', 'aria-label': STR.a11ySeq(text) });
    for (const index of root.BMSeq.displayOrder(cells.length, mirror)) el.append(miniCellEl(cells[index], mirror, { xs: !!o.xs }));
    return el;
  }

  /** 带整串迷你点图的辅助芯片（结果页答错符号）。 */
  const extSymbolChip = (row, mirror) => h('span', { class: 'chip assist with-mini', role: 'listitem', 'aria-label': row.symbol + ' ' + STR.a11ySeq(row.cellsText) },
    seqStripEl(row.cells, mirror, { xs: true }), h('span', { text: row.symbol }));

  /** 扩展符号学习卡：正面 = 符号 + 类别；背面 = 各方大方格（带编号 / 第几方）+ 点位 + 备注。 */
  function extCardEl(row, o) {
    const n = row.cells.length;
    const front = h('div', { class: 'face front' }, h('div', { class: 'sym ' + symClass(row.symbol), text: row.symbol }), catTag(row.category));
    const cellsEl = h('div', { class: 'card-cell seq' });
    cellsEl.style.setProperty('--n', String(n));
    const build = (mirror) => {
      cellsEl.replaceChildren(...root.BMSeq.displayOrder(n, mirror).map((index) => h('div', { class: 'seq-cell' },
        cellEl({ dots: new Set(row.cells[index]), mirror, numbers: true }),
        n > 1 ? h('span', { class: 'cell-no num', 'aria-hidden': 'true', text: String(index + 1) }) : null)));
    };
    build(o.mirror);
    const back = h('div', { class: 'face back' },
      h('div', { class: 'back-head' }, seqStripEl(row.cells, o.mirror), h('div', { class: 'sym small', text: row.symbol })),
      cellsEl,
      h('div', { class: 'digits', text: row.cellsText }),
      row.note ? h('div', { class: 'card-note', text: row.note }) : null);
    const el = h('div', { class: 'card' }, h('div', { class: 'card-inner' }, front, back));
    let flipped = false;
    const set = (f) => {
      flipped = f;
      el.classList.toggle('flipped', f);
      front.setAttribute('aria-hidden', String(f));
      back.setAttribute('aria-hidden', String(!f));
    };
    set(!!o.flipped);
    return { el, flip: () => { set(!flipped); if (o.onFlip) o.onFlip(el); return flipped; }, set, get flipped() { return flipped; } };
  }

  /**
   * 逐方点位输入：上方一排「第几方」小格（按显示顺序；扎写时第 1 方在最右），下方一个大方输入当前这一方。
   * 输入顺序始终从第 1 方开始；点哪一方的小格就切到哪一方。揭晓后小格标对错，点小格看该方的漏点 / 多点。
   */
  class SeqDotsInput {
    /** @param {{n:number, mirror:boolean, numbers:boolean}} o */
    constructor(o) {
      this.n = o.n;
      this.mirror = o.mirror;
      this.cells = Array.from({ length: o.n }, () => new Set());
      this.cur = 0;
      this.judge = null;
      this.locked = false;
      this.onChange = null;
      this.onTap = null;
      this.inner = new DotsInput({ mirror: o.mirror, numbers: o.numbers });
      this.inner.selected = this.cells[0];
      this.inner.render();
      this.inner.onChange = () => { this.drawSlot(this.cur); if (this.onChange) this.onChange(); };
      this.inner.onTap = (n, on) => { if (this.onTap) this.onTap(n, on); };
      this.slots = h('div', { class: 'seq-slots', role: 'group', 'aria-label': STR.a11ySeq('') });
      this.slots.hidden = o.n < 2;
      this.btns = [];
      for (let i = 0; i < o.n; i++) {
        const b = h('button', { class: 'slot sl', type: 'button', 'data-i': i, onclick: () => this.setCur(i) });
        this.btns.push(b);
        this.drawSlot(i, b);
      }
      this.el = h('div', { class: 'seq-input' }, this.slots, this.inner.el);
      this.layoutSlots();
    }
    drawSlot(i, b) {
      b = b || this.btns[i];
      const dots = [...this.cells[i]].sort((x, y) => x - y);
      const j = this.judge && this.judge.cells[i];
      b.classList.toggle('current', i === this.cur);
      b.classList.toggle('filled', dots.length > 0);
      b.classList.toggle('ok', !!(j && j.correct));
      b.classList.toggle('bad', !!(j && !j.correct));
      b.setAttribute('aria-current', i === this.cur ? 'true' : 'false');
      b.setAttribute('aria-label', STR.a11ySlot(i + 1, this.n, dots.join(''), j ? '，' + (j.correct ? STR.a11yCorrect : STR.a11yIncorrect) : ''));
      const kids = [miniCellEl(dots, this.mirror, {}), h('span', { class: 'slot-no num', 'aria-hidden': 'true', text: String(i + 1) })];
      if (j) kids.push(h('span', { class: 'slot-mark', 'aria-hidden': 'true' }, j.correct ? ICON.check() : ICON.cross()));
      b.replaceChildren(...kids);
    }
    layoutSlots() {
      this.slots.replaceChildren(...root.BMSeq.displayOrder(this.n, this.mirror).map((i) => this.btns[i]));
    }
    /** 切到第 i 方（0 起）。 */
    setCur(i) {
      if (i < 0 || i >= this.n || i === this.cur) return;
      const old = this.cur;
      this.cur = i;
      this.inner.selected = this.cells[i];
      this.inner.reveal = this.judge && !this.judge.correct ? this.judge.cells[i] : null;
      this.inner.render();
      this.drawSlot(old);
      this.drawSlot(i);
      if (this.onChange) this.onChange();
    }
    next() { this.setCur(this.cur + 1); }
    prev() { this.setCur(this.cur - 1); }
    toggle(n) { this.inner.toggle(n); }
    get curFilled() { return this.cells[this.cur].size > 0; }
    get complete() { return this.cells.every((s) => s.size > 0); }
    /** 各方作答（每方点位升序）。 */
    get answer() { return this.cells.map((s) => [...s].sort((x, y) => x - y)); }
    setMirror(m) {
      this.mirror = m;
      this.inner.setMirror(m);
      for (let i = 0; i < this.n; i++) this.drawSlot(i);
      this.layoutSlots();
    }
    /** 预设各方作答（截图 / 测试用）。 */
    set(all) {
      all.forEach((d, i) => { this.cells[i].clear(); d.forEach((x) => this.cells[i].add(x)); });
      this.inner.render();
      for (let i = 0; i < this.n; i++) this.drawSlot(i);
    }
    /** 揭晓：逐方标对错，大方显示当前这一方的漏点 / 多点。 */
    showReveal(judge) {
      this.locked = true;
      this.judge = judge;
      this.inner.showReveal(judge.cells[this.cur]);
      for (let i = 0; i < this.n; i++) this.drawSlot(i);
    }
    /** 答对：锁定。 */
    lock(judge) {
      this.locked = true;
      this.judge = judge || null;
      this.inner.lock();
      for (let i = 0; i < this.n; i++) this.drawSlot(i);
    }
  }

  /** 选择题（扩展）：mode 'cells' = 选项是整串点位；'symbol' = 选项是符号。键 1–4。 */
  class SeqChooseInput {
    constructor(options, onPick, o) {
      this.options = options;
      this.locked = false;
      this.mode = o.mode;
      this.el = h('div', { class: 'options' + (o.mode === 'cells' ? ' opts-seq' : ''), role: 'group' });
      this.build(o.mirror, onPick);
    }
    build(mirror, onPick) {
      this.onPick = onPick || this.onPick;
      this.buttons = this.options.map((row, i) => h('button', {
        class: 'option sl' + (this.mode === 'cells' ? ' opt-seq' : ''), type: 'button', 'data-id': row.id, 'data-nav': 'options',
        'aria-label': STR.a11yOption(i + 1, this.mode === 'cells' ? STR.a11ySeq(row.cellsText) : row.symbol),
        onclick: () => { if (!this.locked) this.onPick(row.id); },
      }, h('span', { class: 'key', 'aria-hidden': 'true', text: String(i + 1) }),
      this.mode === 'cells' ? seqStripEl(row.cells, mirror) : h('span', { class: 'osym ' + symClass(row.symbol), text: row.symbol }),
      h('span', { class: 'mark', 'aria-hidden': 'true' })));
      this.el.replaceChildren(...this.buttons);
    }
    setMirror(m) { if (this.mode === 'cells' && !this.locked) this.build(m); }
    idAt(k) { return this.options[k - 1] ? this.options[k - 1].id : null; }
    showResult(pickedId, correctId) {
      this.locked = true;
      for (const b of this.buttons) {
        const id = Number(b.dataset.id);
        b.disabled = true;
        const mark = b.querySelector('.mark');
        if (id === correctId) { b.classList.add('right'); mark.replaceChildren(ICON.check()); }
        else if (id === pickedId) { b.classList.add('wrong'); mark.replaceChildren(ICON.cross()); }
        else b.classList.add('dim');
      }
    }
  }

  /** 多方揭晓面板：结果标记 + 全部方合计的漏点 / 多点 + 正确点位（各方以空格分隔）。 */
  function extRevealPanel(judge, cellsText) {
    const all = (k) => judge.cells.flatMap((j) => j[k]);
    return h('div', { class: 'result-row' },
      verdictEl(false),
      h('div', { class: 'legend' },
        h('div', { class: 'legend-row', 'aria-label': STR.a11yMissed(all('missed')) }, legendGlyph('missed'), String(all('missed').length)),
        h('div', { class: 'legend-row', 'aria-label': STR.a11yExtra(all('extra')) }, legendGlyph('extra'), String(all('extra').length))),
      answerDigits(cellsText));
  }


  // ---------- 规则 / 词句 ----------
  /**
   * 一个词的整串迷你点图：空方画成虚线空框；扎写（镜像）时整串从右往左排、各方内部左右互换。
   * @param {number[][]} cells 各方点位（空方为 []）
   * @param {boolean} mirror
   * @param {{marks?: (string|null)[], first?: number}} [o] marks = 逐方标记（'ok' | 'bad'）；first = 第一个出错的方
   */
  function wordStripEl(cells, mirror, o) {
    o = o || {};
    const el = h('div', { class: 'word-strip' + (mirror ? ' rtl' : ''), role: 'img', 'aria-label': STR.a11yWordCells(cells.length) });
    cells.forEach((d, i) => {
      const c = d.length ? miniCellEl(d, mirror, {}) : h('span', { class: 'mini-cell blank', 'aria-hidden': 'true' });
      const m = o.marks && o.marks[i];
      const wrap = h('span', { class: 'ws-cell' + (m ? ' ' + m : '') + (o.first === i ? ' first' : '') }, c);
      el.append(wrap);
    });
    return el;
  }

  /**
   * 词句翻盲文的逐方输入：一排已输入的小格 + 一个大方输入当前这一方。
   * 「下一方」确认当前方并新开一方；「空方」把当前方记为空方（词与词之间）；「删除」撤销最后一方（或清空当前方）。
   * 轻点任一小格可回头修改。提交时去掉末尾还没写的空草稿方。
   */
  class WordInput {
    /** @param {{mirror:boolean, numbers:boolean}} o */
    constructor(o) {
      this.mirror = o.mirror;
      this.slots = [new Set()];
      this.cur = 0;
      this.locked = false;
      this.onChange = null;
      this.onTap = null;
      this.inner = new DotsInput({ mirror: o.mirror, numbers: o.numbers });
      this.inner.selected = this.slots[0];
      this.inner.render();
      this.inner.onChange = () => { this.draw(); if (this.onChange) this.onChange(); };
      this.inner.onTap = (n, on) => { if (this.onTap) this.onTap(n, on); };
      this.strip = h('div', { class: 'word-slots' + (o.mirror ? ' rtl' : ''), role: 'group', 'aria-label': STR.a11yWordCells(1) });
      this.el = h('div', { class: 'seq-input word-input' }, this.strip, this.inner.el);
      this.draw();
    }
    get last() { return this.slots.length - 1; }
    /** 作答：各方点位（空方 []），去掉末尾还没写的空草稿方。 */
    get answer() {
      const a = this.slots.map((s) => [...s].sort((x, y) => x - y));
      while (a.length && a[a.length - 1].length === 0) a.pop();
      return a;
    }
    get curFilled() { return this.slots[this.cur].size > 0; }
    get canSubmit() { return this.answer.some((d) => d.length > 0); }
    draw() {
      const kids = this.slots.map((set, i) => {
        const dots = [...set].sort((x, y) => x - y);
        const blank = dots.length === 0 && i < this.last;
        const b = h('button', {
          class: 'slot sl' + (i === this.cur ? ' current' : '') + (dots.length ? ' filled' : '') + (blank ? ' is-blank' : ''), type: 'button', 'data-i': i,
          'aria-current': i === this.cur ? 'true' : 'false',
          'aria-label': STR.a11ySlot(i + 1, this.slots.length, blank ? STR.blankCell : dots.join(''), ''),
          onclick: () => this.setCur(i),
        }, blank ? h('span', { class: 'mini-cell blank', 'aria-hidden': 'true' }) : miniCellEl(dots, this.mirror, {}),
        h('span', { class: 'slot-no num', 'aria-hidden': 'true', text: String(i + 1) }));
        return b;
      });
      this.strip.replaceChildren(...kids);
      this.strip.setAttribute('aria-label', STR.a11yWordCells(this.answer.length));
      const c = this.strip.querySelector('.slot.current');
      if (c && c.scrollIntoView) { try { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (_) { /* 忽略 */ } }
    }
    setCur(i) {
      if (this.locked || i < 0 || i > this.last || i === this.cur) return;
      this.cur = i;
      this.inner.selected = this.slots[i];
      this.inner.render();
      this.draw();
      if (this.onChange) this.onChange();
    }
    /** 确认当前方（非空）并去下一方；在末尾则新开一方。 */
    next() {
      if (this.locked || !this.curFilled) return;
      if (this.cur === this.last) this.slots.push(new Set());
      this.setCur(this.cur + 1);
    }
    /** 当前方记为空方并去下一方。 */
    blank() {
      if (this.locked) return;
      this.slots[this.cur].clear();
      this.inner.render();
      if (this.cur === this.last) this.slots.push(new Set());
      this.setCur(Math.min(this.cur + 1, this.last));
      this.draw();
      if (this.onChange) this.onChange();
    }
    /** 删除：当前方有点 → 清空；当前方是空的 → 退回上一方（去掉末尾草稿）。 */
    del() {
      if (this.locked) return;
      if (this.curFilled) { this.slots[this.cur].clear(); this.inner.render(); this.draw(); if (this.onChange) this.onChange(); return; }
      if (this.slots.length > 1 && this.cur === this.last) {
        this.slots.pop();
        this.cur = this.last;
        this.inner.selected = this.slots[this.cur];
        this.inner.render();
        this.draw();
        if (this.onChange) this.onChange();
      }
    }
    toggle(n) { if (!this.locked) this.inner.toggle(n); }
    setMirror(m) {
      this.mirror = m;
      if (this.revealStrip) { this.paintReveal(); return; }
      this.strip.classList.toggle('rtl', m);
      this.inner.setMirror(m);
      this.draw();
    }
    paintReveal() {
      const ans = this.answer;
      const j = this.revealJudge;
      const marks = ans.map((_, i) => (j.cells[i] && j.cells[i].correct ? 'ok' : 'bad'));
      const strip = wordStripEl(ans, this.mirror, { marks, first: j.firstWrong });
      strip.classList.add('answer-strip');
      this.revealStrip.replaceWith(strip);
      this.revealStrip = strip;
    }
    /** 预设作答（截图 / 测试用）。 */
    set(all) {
      this.slots = all.map((d) => new Set(d));
      this.slots.push(new Set());
      this.cur = this.last;
      this.inner.selected = this.slots[this.cur];
      this.inner.render();
      this.draw();
    }
    /** 揭晓：锁定，隐藏大方，逐方标对错、标出第一个出错的方。 */
    reveal(judge) {
      this.locked = true;
      this.el.classList.add('revealed');
      this.revealJudge = judge;
      this.revealStrip = this.strip;
      this.paintReveal();
    }
  }

  /** 规则卡（学习）：正面 = 编号 + 类别 + 页码 + 例词迷你点位串；背面 = 规则正文（默认 3 行，可展开）。 */
  /** 规则的主标题 + 编号小标签（没有 title 时退回只显示编号）。sm = 紧凑版（背面标题行、说明条）。 */
  function ruleHeadEl(r, sm) {
    const no = h('span', { class: 'rule-no num', text: r.id });
    if (!r.title) return h('span', { class: 'rule-id num' + (sm ? ' sm' : ''), text: r.id });
    return h('span', { class: 'rule-titleline' + (sm ? ' sm' : '') }, h('span', { class: 'rule-title', text: r.title }), no);
  }

  function ruleCardEl(card, o) {
    const r = card.rule;
    const ex = card.example;
    const front = h('div', { class: 'face front rule-face' },
      h('div', { class: 'rule-front-head' }, ruleHeadEl(r, false)),
      h('div', { class: 'rule-meta' }, catTag(r.cat), h('span', { class: 'cat-tag pg', text: STR.rulePage(r.page) })),
      ex ? h('div', { class: 'rule-example' }, h('div', { class: 'rule-chars', text: ex.chars }), wordStripEl(ex.cells, o.mirror, {})) : null);
    const text = h('p', { class: 'rule-text clamped', text: r.text });
    const note = r.note ? h('p', { class: 'rule-note', text: r.note }) : null;
    const toggle = h('button', { class: 'btn sl text rule-more', type: 'button', 'aria-expanded': 'false', onclick: () => {
      const open = text.classList.toggle('clamped') === false;
      back.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('span').textContent = open ? STR.collapse : STR.expand;
    } }, h('span', { text: STR.expand }));
    const back = h('div', { class: 'face back rule-face' },
      h('div', { class: 'rule-head' }, ruleHeadEl(r, true), catTag(r.cat), h('span', { class: 'cat-tag pg', text: STR.rulePage(r.page) })),
      h('div', { class: 'rule-body' }, text, note), toggle);
    const el = h('div', { class: 'card', 'aria-label': STR.a11yRuleCard(r.id, r.cat, r.page, r.title) }, h('div', { class: 'card-inner' }, front, back));
    let flipped = false;
    const set = (f) => {
      flipped = f;
      el.classList.toggle('flipped', f);
      front.setAttribute('aria-hidden', String(f));
      back.setAttribute('aria-hidden', String(!f));
    };
    set(!!o.flipped);
    return { el, flip: () => { set(!flipped); if (o.onFlip) o.onFlip(el); return flipped; }, set, get flipped() { return flipped; } };
  }

  let collapseSeq = 0;
  /**
   * 折叠区：标题行是一个按钮（aria-expanded / aria-controls），内容在下方；折叠时内容不可聚焦（inert）。
   * 展开 / 折叠就地进行（不重建），动画由 CSS 完成（减弱动效下瞬时）。
   * @param {{title: string|Node, open?: boolean, cls?: string, onToggle?: (open:boolean)=>void}} o
   * @returns {HTMLElement} 带 setOpen(v) / isOpen()
   */
  function collapse(o, ...kids) {
    const id = 'cb' + (++collapseSeq);
    let open = !!o.open;
    const body = h('div', { class: 'collapse-body', id, role: 'region' }, h('div', { class: 'collapse-inner' }, h('div', { class: 'collapse-pad' }, ...kids)));
    const head = h('button', { class: 'collapse-head sl', type: 'button', 'aria-controls': id, 'aria-expanded': String(open) },
      h('span', { class: 'ch-title' }, o.title), h('span', { class: 'ch-chev', 'aria-hidden': 'true' }, ICON.next()));
    const el = h('section', { class: 'collapse' + (o.cls ? ' ' + o.cls : '') + (open ? ' open' : '') }, head, body);
    const apply = () => {
      el.classList.toggle('open', open);
      head.setAttribute('aria-expanded', String(open));
      body.inert = !open;
      if (!open) body.setAttribute('aria-hidden', 'true'); else body.removeAttribute('aria-hidden');
    };
    head.addEventListener('click', () => { open = !open; apply(); if (o.onToggle) o.onToggle(open); });
    el.setOpen = (v) => { open = !!v; apply(); };
    el.isOpen = () => open;
    apply();
    return el;
  }

  /** 规则说明条（揭晓时「错在哪条规则」）：标题行 = 编号 · 类别 · 页码，默认折叠；展开后是规则正文（默认 3 行，可再展开全文）。 */
  function ruleBoxEl(rule) {
    const text = h('p', { class: 'rule-text clamped', text: rule.text });
    const more = h('button', { class: 'btn sl text rule-more', type: 'button', 'aria-expanded': 'false', onclick: () => {
      const open = text.classList.toggle('clamped') === false;
      more.setAttribute('aria-expanded', String(open));
      more.querySelector('span').textContent = open ? STR.collapse : STR.expand;
    } }, h('span', { text: STR.expand }));
    const title = h('span', { class: 'rule-box-head' }, ruleHeadEl(rule, true), catTag(rule.cat), h('span', { class: 'cat-tag pg', text: STR.rulePage(rule.page) }));
    return collapse({ title, cls: 'rule-box', open: false }, text, more);
  }

  root.BMW = {
    cellEl, miniCellEl, symbolChip, DotsInput, ChooseInput, cardEl, starsEl, btn, iconBtn, filterChip, assistChip, segmented, switchEl,
    hooks, topBar, navBar, verdictEl, legendGlyph, revealPanel, answerDigits, progressBar,
    catTag, seqStripEl, extSymbolChip, extCardEl, SeqDotsInput, SeqChooseInput, extRevealPanel,
    wordStripEl, WordInput, ruleCardEl, ruleBoxEl, collapse,
  };
})(typeof self !== 'undefined' ? self : this);
