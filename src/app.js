// 触屏设备不自动聚焦按钮（否则手机上会一直显示焦点描边）
const COARSE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
/**
 * 应用入口：启动、路由、共享上下文、键盘分发、存档、截图预设。
 * 页面在 src/views/*.js，以 window.BMViews[name](ctx, params) → {el, onKey?, destroy?, api?} 注册。
 */
(function (root) {
  'use strict';
  const { h, ICON, nextFrame } = root.BMDom;
  const W = root.BMW;
  const STR = root.STR;
  const P = root.BMProgress;
  const Views = root.BMViews;

  const $app = document.getElementById('app');
  const $status = document.getElementById('status');

  /** 共享上下文（页面只通过它读写状态）。 */
  const ctx = {
    table: [], cats: [], rowsById: new Map(), plan: [], cfg: null, progress: null,
    extraRows: null, ext: null, translator: null, ruleData: null, module: 'base', extScope: 'all', ruleScope: 'all', ruleQtype: 'mix', textScope: 'all', // 扩展符号：extraRows 为 null = 无扩展表，相关入口隐藏
    shot: false, rng: Math.random,
    get settings() { return ctx.progress.settings; },
  };
  let current = null;
  let timers = [];
  /** 底部导航的四个标签页。 */
  const TABS = [
    { key: 'learn', label: STR.tabLearn, icon: ICON.learn },
    { key: 'practice', label: STR.tabPractice, icon: ICON.practice },
    { key: 'course', label: STR.tabCourse, icon: ICON.course },
    { key: 'me', label: STR.tabMe, icon: ICON.me },
  ];

  /**
   * 跳转页面。params.focus = 进入后要聚焦的选择器。
   * opts.dir：'fwd' 前进（共享轴 X）、'back' 返回、'tab' 标签切换（淡入穿透）、'none' 无动画（原地刷新）。
   */
  let currentName = null;
  ctx.go = function (name, params, opts) {
    ctx.clearLater();
    ctx.fx.cancel(); // 换页：立即停掉粒子 / 光圈
    const wasTab = !!(current && current.tab);
    if (current && current.destroy) current.destroy();
    params = params || {};
    const oldBody = $app.querySelector('.page-body');
    const keepScroll = (opts && opts.dir) === 'none' && name === currentName && oldBody ? oldBody.scrollTop : 0;
    const view = Views[name](ctx, params);
    current = view;
    currentName = name;
    const isTab = !!view.tab;
    const screen = h('main', { class: 'screen' + (isTab ? ' with-nav' : ''), tabindex: '-1' }, view.el,
      isTab ? W.navBar(TABS, view.tab, (k, byKey) => ctx.go(k, byKey ? { focus: '.nav-item.active' } : {}, { dir: 'tab' })) : null);
    let dir = opts && opts.dir;
    if (dir == null) dir = isTab ? (wasTab ? 'tab' : 'back') : 'fwd';
    if (dir !== 'none') screen.classList.add('anim-' + dir);
    if (isTab) ctx.lastTab = view.tab;
    $app.replaceChildren(screen);
    const navEl = screen.querySelector('.nav-bar');
    if (navEl && navEl.start) navEl.start(); // 导航指示块在首次绘制前就位
    // 原地刷新（设置项改动等）保留滚动位置，否则「设置」页每点一下都会跳回顶部
    if (keepScroll) { const nb = screen.querySelector('.page-body'); if (nb) nb.scrollTop = keepScroll; }
    const target = (params.focus && screen.querySelector(params.focus)) || (COARSE ? null : screen.querySelector('[data-autofocus]'));
    (target || screen).focus({ preventScroll: true });
    syncHistory();
    return view;
  };

  // ---------- 返回键（Android WebView 的返回走 history）：不在根标签「学习」时保留一条历史 ----------
  let pushed = false;
  let ignorePop = false;
  const ESC = { key: 'Escape', repeat: false, preventDefault() {} };
  function syncHistory() {
    if (ctx.shot || !current) return;
    const want = current.tab !== 'learn';
    try {
      if (want && !pushed) { history.pushState({ bm: 1 }, ''); pushed = true; }
      else if (!want && pushed) { pushed = false; ignorePop = true; history.back(); }
    } catch (_) { /* file:// 等不支持时忽略 */ }
  }
  window.addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    pushed = false;
    if (!current) return;
    const handled = current.onKey && current.onKey(ESC); // 与 Esc 相同：全屏页返回、取消确认
    if (!handled) ctx.go(current.tab ? 'learn' : (ctx.lastTab || 'learn'), {}, { dir: current.tab ? 'tab' : 'back' });
    syncHistory();
  });
  /** 页面内定时器（跳转时自动清除）。 */
  ctx.later = (fn, ms) => { timers.push(setTimeout(fn, ms)); };
  ctx.clearLater = () => { timers.forEach(clearTimeout); timers = []; };
  /** 读屏播报。 */
  ctx.say = (text) => { $status.textContent = ''; requestAnimationFrame(() => { $status.textContent = text; }); };
  /** 短提示（Snackbar 风格，约 1.6 s 后移除；同时读屏播报）。 */
  ctx.toast = (text) => {
    const old = document.querySelector('.toast'); if (old) old.remove();
    const t = document.createElement('div');
    t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = text;
    document.body.append(t);
    setTimeout(() => t.remove(), 1600);
  };
  /** 当前范围内的符号。 */
  ctx.scopeRows = () => (ctx.settings.scope === 'all' ? ctx.table : ctx.table.filter((r) => r.category === ctx.settings.scope));
  /** 答对后自动下一题的等待。 */
  ctx.autoNextMs = () => (ctx.settings.mirror ? ctx.cfg.timing.autoNextMirrorMs : ctx.cfg.timing.autoNextMs);

  let saving = Promise.resolve();
  /** 保存进度（串行，主进程原子写入；截图模式主进程不写盘）。 */
  ctx.save = () => {
    const snapshot = JSON.parse(JSON.stringify(ctx.progress));
    saving = saving.then(() => root.bm.saveProgress(snapshot)).catch(() => false);
    return saving;
  };
  ctx.fx = root.BMFx.create({
    doc: document,
    enabled: () => !!(ctx.progress && ctx.settings.fx),
    reduced: () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  /** 震动（仅 Android 原生；其它平台空操作）。 */
  ctx.haptic = (kind) => root.BMHaptics.play(kind, !!(ctx.progress && ctx.settings.haptics));
  W.hooks.tick = () => ctx.haptic('tick'); // 分段按钮滑过 / 迷你点图翻面的轻震
  ctx.setMirror = (m) => { ctx.settings.mirror = !!m; ctx.save(); };
  ctx.setTheme = (t) => { ctx.settings.theme = t; root.bm.setTheme(t); ctx.save(); };
  ctx.setSeed = (name) => { ctx.settings.seed = name; root.BMTheme.setSeed(name); ctx.save(); };
  ctx.setStyle = (name) => { ctx.settings.style = name; root.BMTheme.setStyle(name); ctx.save(); };
  /** 把当前设置重新应用到界面（导入 / 撤销后）。 */
  function applySettings() {
    root.bm.setTheme(ctx.settings.theme);
    root.BMTheme.setSeed(ctx.settings.seed);
    root.BMTheme.setStyle(ctx.settings.style);
    ctx.fx.sync();
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const catNames = () => ctx.cats.map((c) => c.name);
  /** 文本库 → 练习题目；没有翻盲文引擎时为 null（文本功能隐藏，已存文本原样保留）。 */
  ctx.rebuildTexts = () => {
    ctx.textData = null;
    try { if (ctx.translator) ctx.textData = root.BMTexts.buildItems(ctx.texts, ctx.translator); } catch (_) { ctx.textData = null; }
  };
  /** 文本练习用的题目池（scope 'all' 或某一篇）；没有引擎时为 null。 */
  ctx.textRoundData = (textId) => (ctx.textData ? {
    words: ctx.textData.items.filter((i) => !textId || textId === 'all' || i.textId === textId), judge: [],
    rule: ctx.ruleData ? ctx.ruleData.rule : () => null, byKey: ctx.textData.byKey,
  } : null);
  const textEntries = () => (ctx.textData ? ctx.textData.entries : undefined);
  /** 清洗记录时用的当前 textEntries（文本库不可用 = undefined，记录原样保留）。 */
  ctx.normProgress = (raw) => {
    const p = P.normalizeProgress(raw, ctx.table, ctx.plan, ctx.cfg, catNames(), ctx.extraRows || undefined, ctx.ruleData ? ctx.ruleData.entries : undefined, textEntries());
    P.pruneTextRuns(p, new Set(ctx.texts.texts.map((t) => t.id)));
    return p;
  };
  /** 保存文本库（串行，与进度各自一条队列）。 */
  let savingTexts = Promise.resolve();
  ctx.saveTexts = () => {
    const snapshot = clone(ctx.texts);
    savingTexts = savingTexts.then(() => root.bm.saveTexts(snapshot)).catch(() => false);
    return savingTexts;
  };
  /** 换入新的文本库并重建题目、重新清洗进度里的文本记录。 */
  ctx.setTexts = (store) => {
    ctx.texts = store;
    ctx.rebuildTexts();
    ctx.progress = ctx.normProgress(ctx.progress);
  };
  /** 导出当前记录。@returns {Promise<'ok'|'canceled'|'fail'>} */
  ctx.exportRecord = async () => {
    const r = await root.bm.exportRecord(root.BMBackup.buildExport(ctx.progress, ctx.version, undefined, ctx.texts.texts.length ? ctx.texts : undefined), root.BMBackup.defaultFileName());
    return r && r.ok ? 'ok' : r && r.canceled ? 'canceled' : 'fail';
  };
  /** 选择并校验导入文件；不改动现有记录。@returns {Promise<{canceled:true}|{ok:false,reason:string}|{ok:true,progress,imported,skipped}>} */
  ctx.pickImport = async () => {
    const r = await root.bm.pickRecord();
    if (!r || !r.ok) return r && r.canceled ? { canceled: true } : { ok: false, reason: (r && r.reason) || 'read' };
    return root.BMBackup.parseImport(r.text, ctx.table, ctx.plan, ctx.cfg, catNames(), ctx.extraRows || undefined, ctx.ruleData ? ctx.ruleData.entries : undefined, ctx.translator ? {
      normalize: root.BMTexts.normalizeStore,
      current: ctx.texts,
      entries: (store) => { try { return root.BMTexts.buildItems(store, ctx.translator).entries; } catch (_) { return undefined; } },
    } : undefined);
  };
  /** 确认后覆盖：先备份当前记录，写入失败自动恢复。@returns {Promise<boolean>} */
  ctx.applyImport = async (next) => {
    await saving;
    await savingTexts;
    const bundle = { kind: 'bundle', progress: next.progress, texts: next.texts };
    const r = await root.BMBackup.applyImport({ kind: 'bundle', progress: clone(ctx.progress), texts: clone(ctx.texts) }, bundle, { saveBackup: root.bm.saveBackup, saveProgress: root.bm.saveProgress, saveTexts: root.bm.saveTexts });
    if (!r.ok) return false;
    if (next.texts) { ctx.texts = next.texts; ctx.rebuildTexts(); }
    ctx.progress = next.progress;
    ctx.hasUndo = true;
    applySettings();
    return true;
  };
  /** 撤销上次导入：恢复到导入前的记录。 */
  ctx.undoImport = async () => {
    await saving;
    await savingTexts;
    const r = await root.BMBackup.undoImport({ loadBackup: root.bm.loadBackup, saveProgress: root.bm.saveProgress, saveTexts: root.bm.saveTexts, clearBackup: root.bm.clearBackup });
    if (!r.ok) { if (r.reason === 'none') ctx.hasUndo = false; return false; }
    if (r.texts) { const n = root.BMTexts.normalizeStore(r.texts); ctx.texts = n.ok ? n.store : root.BMTexts.emptyStore(); ctx.rebuildTexts(); }
    ctx.progress = ctx.normProgress(r.data);
    ctx.hasUndo = false;
    applySettings();
    return true;
  };
  ctx.clearProgress = () => { ctx.progress = P.clearProgress(ctx.progress, ctx.cfg); ctx.save(); };

  // ---------- 键盘 ----------
  const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey || !current) return;
    if (e.repeat && !NAV_KEYS.includes(e.key)) return;
    const a = document.activeElement;
    // 焦点在普通按钮上时，Enter/空格交给按钮本身（避免触发两次）；点位按钮上的 Enter 仍算「提交」
    const onButton = a && a.tagName === 'BUTTON' && !a.classList.contains('dot');
    if (onButton && (e.key === 'Enter' || e.key === ' ')) return;
    if (a && a.classList && a.classList.contains('dot') && e.key === ' ') return;
    // 分段选择/课程图/瓷砖：方向键移动焦点
    if (NAV_KEYS.includes(e.key) && a && a.dataset && a.dataset.nav) {
      const group = [...document.querySelectorAll('[data-nav="' + a.dataset.nav + '"]')].filter((x) => !x.disabled);
      const i = group.indexOf(a);
      const d = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
      const t = group[i + d];
      if (t) t.focus();
      e.preventDefault();
      return;
    }
    if (current.onKey && current.onKey(e)) e.preventDefault();
  });

  // ---------- 截图预设（只用 CSV 推出的数据） ----------
  /** 演示进度：部分符号有分数，前三课有星。 */
  function demoProgress() {
    const p = P.createProgress(ctx.cfg);
    p.settings.autoNext = false;
    p.settings.seed = shotSeed;
    p.settings.style = shotStyle;
    ctx.table.forEach((r, i) => {
      if (i % 6 === 2) p.symbols[r.id] = { sig: P.symSig(r), score: 2 + (i % 3) * 2, right: 3, wrong: 2 };
    });
    [3, 2, 1].forEach((stars, k) => {
      const L = ctx.plan[k];
      if (L) p.lessons[L.key] = { sig: L.sig, stars, bestAcc: [1, 0.9, 0.8][k], bestAvgSec: [5, 8, 11][k], plays: 1 };
    });
    return p;
  }
  /** 揭晓样张的作答：正确点位去掉一个、加上一个非正确点。 */
  function wrongPick(row) {
    const sel = new Set(row.dots);
    sel.delete(row.dots[row.dots.length > 1 ? 1 : 0]);
    const add = [1, 2, 3, 4, 5, 6].find((n) => !row.dots.includes(n));
    if (add) sel.add(add);
    return [...sel];
  }
  const demoRow = () => ctx.table.find((r) => r.dots.length >= 3 && r.dots.length <= 5) || ctx.table[0];
  const weakIds = () => P.weakRows(ctx.progress, ctx.table).map((r) => r.id);
  const LESSON_DEMO = 3;
  let shotSeed = root.BMPalette.DEFAULT_SEED;
  let shotStyle = 'material';

  const SHOTS = {
    practice: () => ctx.go('practice'),
    course: () => ctx.go('course'),
    me: () => ctx.go('me'),
    'me-confirm': () => {
      ctx.go('me', { confirm: true });
      document.querySelector('[data-key="clear"]').scrollIntoView({ block: 'end' });
    },
    /** 走完整轮（全部答对，经 finish → 结果页）。 */
    'round-done': () => {
      const v = ctx.go('round', { mode: 'practice' });
      for (let k = 0; k < 40 && current === v && v.api.q; k++) {
        const q = v.api.q;
        if (q.type === 'dots') { v.api.select(q.row.dots); v.api.submit(); } else v.api.pick(q.row.id);
        v.api.cont();
      }
    },
    /** 走完整课（测验全对，经 finish → 记录 → 课结果）。 */
    'lesson-done': () => {
      const v = ctx.go('lesson', { index: LESSON_DEMO });
      v.api.skipTo('test');
      for (let k = 0; k < 40 && current === v; k++) { v.api.select(v.api.row.dots); v.api.submit(); v.api.cont(); }
    },
    'learn-front': () => ctx.go('learn'),
    'learn-back': () => ctx.go('learn', { flipped: true }),
    'learn-mirror': () => { ctx.settings.mirror = true; ctx.go('learn', { flipped: true }); },
    'practice-dots': () => {
      const r = demoRow();
      ctx.go('round', { mode: 'practice', force: { type: 'dots', rowId: r.id } }).api.select(r.dots.slice(0, 2));
    },
    'practice-wrong': () => {
      const r = demoRow();
      const v = ctx.go('round', { mode: 'practice', force: { type: 'dots', rowId: r.id } });
      v.api.select(wrongPick(r));
      v.api.submit();
    },
    'practice-choose': () => {
      const r = demoRow();
      ctx.go('round', { mode: 'practice', force: { type: 'choose', rowId: r.id } });
    },
    'practice-wrong-mirror': () => {
      ctx.settings.mirror = true;
      const r = demoRow();
      const v = ctx.go('round', { mode: 'practice', force: { type: 'dots', rowId: r.id } });
      v.api.select(wrongPick(r));
      v.api.submit();
    },
    'practice-correct': () => {
      const r = demoRow();
      const v = ctx.go('round', { mode: 'practice', force: { type: 'dots', rowId: r.id } });
      v.api.select(r.dots);
      v.api.submit();
    },
    'practice-choose': () => ctx.go('round', { mode: 'practice', force: { type: 'choose', rowId: demoRow().id } }),
    'practice-choose-wrong': () => {
      const v = ctx.go('round', { mode: 'practice', force: { type: 'choose', rowId: demoRow().id } });
      v.api.pick(v.api.q.options.find((o) => o.id !== v.api.q.row.id).id);
    },
    review: () => ctx.go('round', { mode: 'review', force: { type: 'dots' } }),
    wrong: () => ctx.go('round', { mode: 'wrong', force: { type: 'choose' } }),
    result: () => ctx.go('result', {
      summary: { mode: 'practice', total: 10, correct: 8, acc: 0.8, totalSec: 52.4, avgSec: 5.24, wrongIds: weakIds().slice(0, 2) },
      bestStreak: 6,
    }),
    /** 连续答对 3 题（答案取自当前题目的 CSV 行），停在第 3 题揭晓态，顶栏应显示「连对 3」。 */
    'practice-streak': () => {
      const v = ctx.go('round', { mode: 'practice', force: { type: 'dots', rowId: demoRow().id } });
      for (let k = 0; k < 3; k++) {
        if (k) v.api.cont();
        const q = v.api.q;
        if (q.type === 'dots') { v.api.select(q.row.dots); v.api.submit(); } else v.api.pick(q.row.id);
      }
    },
    /** 设置页滚到底，点最下面的开关/按钮后仍应停在原位（输出 scrollTop 前后值）。 */
    'me-scroll': async () => {
      ctx.go('me');
      await new Promise((r) => setTimeout(r, 80));
      const b = document.querySelector('.page-body');
      b.scrollTop = b.scrollHeight;
      const before = b.scrollTop; const max0 = b.scrollHeight - b.clientHeight;
      const sws = document.querySelectorAll('.switch');
      sws[sws.length - 1].click();
      await new Promise((r) => setTimeout(r, 80));
      const after = document.querySelector('.page-body').scrollTop;
      console.warn('me-scroll before=' + before + ' after=' + after + ' max=' + max0);
    },
    /** 设置页底部「关于」：点按 5 次版本号再按住约 1.5 秒后显示反馈行。 */
    'me-about': async () => {
      ctx.go('me');
      await new Promise((r) => setTimeout(r, 80));
      const v = document.querySelector('.about-ver');
      const ev = (t) => v.dispatchEvent(new PointerEvent(t, { bubbles: true, button: 0, pointerType: 'mouse' }));
      for (let i = 0; i < 5; i++) { ev('pointerdown'); await new Promise((r) => setTimeout(r, 60)); ev('pointerup'); await new Promise((r) => setTimeout(r, 150)); }
      ev('pointerdown');
      await new Promise((r) => setTimeout(r, 1700));
      ev('pointerup');
      await new Promise((r) => setTimeout(r, 300));
      const pb = document.querySelector('.page-body'); pb.style.scrollBehavior = 'auto'; pb.scrollTop = pb.scrollHeight;
      await new Promise((r) => setTimeout(r, 200));
    },
    'lesson-learn': () => ctx.go('lesson', { index: LESSON_DEMO }),
    /** 单课学习卡背面（含迷你点图）。 */
    'lesson-study': () => ctx.go('lesson', { index: LESSON_DEMO }).api.flip(),
    /** 测验答错揭晓（盲写 → 揭晓时显示编号与迷你点图）。 */
    'lesson-test-reveal': () => {
      const v = ctx.go('lesson', { index: LESSON_DEMO });
      v.api.skipTo('test');
      v.api.select(wrongPick(v.api.row));
      v.api.submit();
    },
    'lesson-practice': () => {
      const v = ctx.go('lesson', { index: LESSON_DEMO });
      v.api.skipTo('practice');
      v.api.hint();
    },
    'lesson-card': () => {
      const v = ctx.go('lesson', { index: LESSON_DEMO });
      v.api.skipTo('practice');
      v.api.select(wrongPick(v.api.row));
      v.api.submit();
      v.api.cont();
    },
    'lesson-test': () => {
      const v = ctx.go('lesson', { index: LESSON_DEMO });
      v.api.skipTo('test');
      v.api.select(v.api.row.dots.slice(0, 1));
    },
    'lesson-result': () => {
      const L = ctx.plan[LESSON_DEMO];
      ctx.go('lessonResult', {
        index: LESSON_DEMO,
        result: { total: L.ids.length * 2, correct: L.ids.length * 2 - 1, acc: (L.ids.length * 2 - 1) / (L.ids.length * 2), avgSec: 7.4, stars: 2, wrongIds: L.ids.slice(0, 1) },
        improved: true,
      });
    },
  };

  async function settle() {
    await document.fonts.ready;
    await nextFrame();
    await Promise.all(document.getAnimations().map((a) => a.finished.catch(() => {})));
    await nextFrame();
  }
  /** 截图自检：含盲文方的内容不得越出其卡片 / 面 / 答题区的边框（> 1px 即报告）。 */
  function overflowReport(name) {
    const bad = [];
    const inside = (a, b) => a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top - 1 && a.bottom <= b.bottom + 1;
    for (const host of document.querySelectorAll('.face:not([aria-hidden="true"]), .q-body:not(.card-holder), .cell-card, .option')) {
      const hr = host.getBoundingClientRect();
      if (!hr.width) continue;
      for (const c of host.querySelectorAll('.cell, .digits, .sym, .mini-cell, .osym, .key')) {
        const r = c.getBoundingClientRect();
        if (r.width && !inside(r, hr)) bad.push(host.className.split(' ')[0] + ' > ' + c.className.split(' ')[0]);
      }
    }
    const nav = document.querySelector('.page-body');
    if (nav && nav.scrollHeight > nav.clientHeight + 1 && document.querySelector('.q-body, .card-holder')) bad.push('page-body scrolls');
    console.warn('overflow ' + name + ': ' + (bad.length ? [...new Set(bad)].join('; ') : 'none'));
  }
  async function runShot(name) {
    ctx.progress = demoProgress();
    ctx.fx.sync();
    root.BMTheme.setSeed(shotSeed);
    root.BMTheme.setStyle(ctx.settings.style);
    ctx.rng = root.BMPick.makeRng(42);
    const fn = SHOTS[name];
    if (!fn) { console.error('unknown shot ' + name); ctx.go('learn'); } else await fn();
    await new Promise((r) => setTimeout(r, 60)); // 让 ctx.later(…, 0) 的跳转先完成
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    await settle();
    overflowReport(name);
    root.bm.shotReady(name);
  }

  /** 冒烟：在已读入的真实进度（--user-data 目录）上跑一个预设流程，存档照常写入。 */
  async function runE2e(name, loaded) {
    ctx.shot = false;
    ctx.settings.autoNext = false;
    ctx.rng = root.BMPick.makeRng(7);
    if (SHOTS[name]) SHOTS[name](); else console.error('unknown e2e ' + name);
    await new Promise((r) => setTimeout(r, 100));
    await saving;
    console.log('e2e loaded=' + (loaded ? 'yes' : 'no') + ' symbols=' + Object.keys(ctx.progress.symbols).length + ' lessons=' + Object.keys(ctx.progress.lessons).length);
    root.bm.shotReady(name);
  }

  // ---------- 启动 ----------
  function renderError(errors) {
    $app.replaceChildren(h('main', { class: 'screen error-page', tabindex: '-1' },
      h('div', { class: 'error', role: 'alert' }, ICON.cross(), h('span', { text: STR.tableError }),
        h('span', { class: 'n', text: (errors || []).slice(0, 3).join(' ') }))));
  }

  (async function boot() {
    const b = await root.bm.boot();
    ctx.cfg = b.config;
    if (!b.table.ok) {
      renderError(b.table.errors);
      if (b.shot && b.shot !== '*batch*') { await settle(); root.bm.shotReady('error'); }
      return;
    }
    ctx.table = b.table.rows;
    // 扩展符号表：缺失或有错时 ctx.extraRows = null，相关功能隐藏，且已有扩展记录原样保留
    ctx.extraRows = b.extra && b.extra.ok ? b.extra.rows : null;
    ctx.ext = ctx.extraRows ? root.BMExt.build(ctx.extraRows) : null;
    // 翻盲文引擎：规则数据、拼音还原表、两张字表都就绪才有；否则为 null，规则相关入口隐藏
    ctx.translator = null;
    try {
      if (b.rules && b.rules.ok && b.pinyinMap && b.pinyinMap.ok && ctx.extraRows) {
        const t = root.BMTranslate.createTranslator({
          table: ctx.table, extra: ctx.extraRows, rules: root.BMRules.parseRules(b.rules.text), map: JSON.parse(b.pinyinMap.text),
        });
        ctx.translator = t.ok ? t : null;
      }
    } catch (_) { ctx.translator = null; }
    // 规则 / 词句题目库（有翻盲文引擎才有）；至少要有可出的题，否则规则相关入口隐藏
    ctx.ruleData = null;
    try {
      if (ctx.translator) {
        const d = root.BMRuleItems.build({ rules: ctx.translator.rules, translator: ctx.translator });
        ctx.ruleData = d.cards.length && root.BMRuleRound.availableTypes(d).length ? d : null;
      }
    } catch (_) { ctx.ruleData = null; }
    // 拼音库分词时合并被通用分词器拆开的词：已知词 = 规则例词按其自身分写拆出的词块（只给分词，不给点位）
    try { root.BMPinyinLib.setWords(ctx.ruleData ? root.BMPinyinProvider.exampleChunks(ctx.ruleData.words, ctx.translator.parse).flat() : []); } catch (_) { /* 无 */ }
    ctx.cats = root.BMCsv.categoriesOf(ctx.table);
    ctx.rowsById = new Map(ctx.table.map((r) => [r.id, r]));
    ctx.plan = root.BMCourse.planLessons(ctx.table, ctx.cfg.lessonSize);
    // 自定义文本库：读入后清洗；没有翻盲文引擎时题目为 null，已有文本记录原样保留
    { const n = root.BMTexts.normalizeStore(b.texts); ctx.texts = n.ok ? n.store : root.BMTexts.emptyStore(); }
    ctx.rebuildTexts();
    ctx.progress = ctx.normProgress(b.progress);
    ctx.shot = !!b.shot;
    ctx.version = b.version || '';
    ctx.hasUndo = false;
    if (!b.shot) { try { ctx.hasUndo = !!(await root.bm.loadBackup()); } catch (_) { ctx.hasUndo = false; } }
    ctx.contact = b.contact || null; // 本机私有联系方式（可缺失）；不记录日志
    if (b.shot && b.fontScale) document.documentElement.style.fontSize = (b.fontScale * 100) + '%'; // 模拟安卓文字缩放
    shotStyle = b.style === 'glass' ? 'glass' : 'material';
    shotSeed = b.seed || root.BMPalette.DEFAULT_SEED;
    if (b.shot && b.style) ctx.settings.style = b.style;
    root.BMTheme.setSeed(b.shot ? shotSeed : ctx.settings.seed);
    root.BMTheme.setStyle(ctx.settings.style);
    ctx.fx.sync();
    if (b.shot === '*batch*') {
      root.bm.onShotShow((page) => runShot(page));
      root.bm.shotPages(Object.keys(SHOTS));
      return;
    }
    if (b.shot && b.shot.startsWith('e2e:')) { runE2e(b.shot.slice(4), b.progress); return; }
    if (b.shot) { runShot(b.shot); return; }
    ctx.rng = root.BMPick.makeRng((Date.now() ^ (performance.now() * 1000)) >>> 0);
    if (b.themeSource !== ctx.settings.theme) root.bm.setTheme(ctx.settings.theme);
    ctx.go('learn', {}, { dir: 'tab' });
  })();

  root.BMApp = { ctx, SHOTS };
})(typeof self !== 'undefined' ? self : this);
