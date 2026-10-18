/**
 * 扩展符号的一轮答题（全屏）：练习 / 复习 / 错题。题型：逐方点位（dots）、看符号选点位（chooseCells）、看点位选符号（chooseSymbol）。
 * 规则在 BMExtRound；本文件只负责显示、输入、计时与自动下一题。
 */
(function (root) {
  'use strict';
  const { h, ICON, symClass, replay } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const P = root.BMProgress;
  const Views = (root.BMViews = root.BMViews || {});

  const MODE_LABEL = () => ({ practice: STR.practice, review: STR.review, wrong: STR.mistakes });

  Views.extround = function (ctx, params) {
    const S = ctx.settings;
    const mode = params.mode;
    const round = new root.BMExtRound.ExtRound({
      mode, rows: C.extScopeRows(ctx), ext: ctx.ext, progress: ctx.progress, cfg: ctx.cfg,
      length: S.roundLength, qtype: S.qtype, rng: ctx.rng,
    });
    const sw = new root.BMTimer.Stopwatch(() => performance.now());
    let q = null;
    let input = null;
    let phase = 'ask'; // ask | correct | wrong
    let guardUntil = 0;
    let wrongCount = 0;
    let streak = 0;
    let bestStreak = 0;
    let promptEl = null;

    const leave = () => ctx.go('practice', {}, { dir: 'back' });
    const titleNum = h('span', { class: 'num' });
    const counter = h('span', { class: 'counter' });
    const streakEl = h('span', { class: 'streak num', hidden: true });
    const mirrorBtn = C.mirrorToggle(ctx, onMirror);
    const progressHolder = h('div', { class: 'progress-holder' });
    const body = h('div', { class: 'q-body' });
    const resultEl = h('div', { class: 'result' });
    const footer = h('div', { class: 'footer' });
    const el = h('div', { class: 'page round-page ext-round mode-' + mode },
      W.topBar(C.backBtn(leave), h('h1', {}, h('span', { text: MODE_LABEL()[mode] }), titleNum), h('div', { class: 'actions' }, streakEl, counter, mirrorBtn)),
      progressHolder,
      h('div', { class: 'page-body q-page' }, body, resultEl, footer));

    const isChoice = () => q && q.type !== 'dots';
    function updateHead() {
      const n = q ? q.n : round.index;
      if (mode === 'wrong') {
        const left = P.extWeakRows(ctx.progress, round.rows).length;
        titleNum.textContent = String(n);
        counter.setAttribute('aria-label', STR.a11yWeakLeft(left));
        counter.replaceChildren(W.legendGlyph('missed'), String(left));
      } else {
        titleNum.textContent = n + ' / ' + S.roundLength;
        counter.setAttribute('aria-label', STR.a11yWrong(wrongCount));
        counter.replaceChildren(h('span', { class: 'cnt-ico err' }, ICON.cross()), String(wrongCount));
        progressHolder.replaceChildren(W.progressBar(round.log.length / S.roundLength, STR.a11yProgress(n, S.roundLength)));
      }
    }
    /** 点位题的主操作：不是最后一方 →「下一方」（当前方有点才可点）；最后一方 →「提交」（每一方都有点才可点）。 */
    const lastCell = () => input.cur === input.n - 1;
    function mainAction() {
      if (phase !== 'ask' || !q || q.type !== 'dots') return;
      if (lastCell()) { if (input.complete) submit(); } else if (input.curFilled) input.next();
    }
    function renderFooter() {
      if (phase === 'ask' && q.type === 'dots') {
        const btns = [];
        if (input.n > 1) btns.push(W.btn(STR.prevCell, () => input.prev(), { variant: 'text', disabled: input.cur === 0 }));
        btns.push(W.btn(lastCell() ? STR.submit : STR.nextCell, mainAction,
          { variant: 'filled', cls: 'fab', disabled: lastCell() ? !input.complete : !input.curFilled }));
        footer.replaceChildren(...btns);
      } else if (phase === 'wrong' || (phase === 'correct' && (!S.autoNext || ctx.shot))) {
        footer.replaceChildren(W.btn(STR.next, cont, { variant: 'filled', cls: 'fab', icon: ICON.next() }));
        if (!ctx.shot) footer.querySelector('button').focus({ preventScroll: true });
      } else {
        footer.replaceChildren();
      }
    }

    /** 看点位选符号的题面：类别 + 整串带编号的大方格（各方按视角排列，方数多时自动缩小）。 */
    function seqBig(cells, mirror) {
      const wrap = h('div', { class: 'seq-big' });
      wrap.style.setProperty('--n', String(cells.length));
      for (const index of root.BMSeq.displayOrder(cells.length, mirror)) {
        wrap.append(h('div', { class: 'seq-cell' }, h('div', { class: 'cell-card small' }, W.cellEl({ dots: new Set(cells[index]), mirror, numbers: true })),
          cells.length > 1 ? h('span', { class: 'cell-no num', 'aria-hidden': 'true', text: String(index + 1) }) : null));
      }
      return wrap;
    }
    const promptSymbol = () => [W.catTag(q.row.category), h('div', { class: 'sym ' + symClass(q.row.symbol), text: q.row.symbol })];

    function ask(force, animate) {
      q = round.next(force);
      if (!q) { ctx.later(finish, 0); return; }
      phase = 'ask';
      if (q.type === 'dots') {
        input = new W.SeqDotsInput({ n: q.row.cells.length, mirror: S.mirror, numbers: true });
        input.onChange = renderFooter;
        input.onTap = () => ctx.haptic('tap');
        promptEl = h('div', { class: 'prompt prompt-ext' }, ...promptSymbol());
        body.replaceChildren(promptEl, input.el);
        ctx.say(q.row.category + '，' + q.row.symbol);
      } else if (q.type === 'chooseCells') {
        input = new W.SeqChooseInput(q.options, pick, { mode: 'cells', mirror: S.mirror });
        promptEl = h('div', { class: 'prompt prompt-ext' }, ...promptSymbol());
        body.replaceChildren(promptEl, input.el);
        ctx.say(q.row.category + '，' + q.row.symbol);
      } else {
        input = new W.SeqChooseInput(q.options, pick, { mode: 'symbol', mirror: S.mirror });
        promptEl = h('div', { class: 'prompt prompt-ext' }, W.catTag(q.row.category), seqBig(q.row.cells, S.mirror));
        body.replaceChildren(promptEl, input.el);
        ctx.say(q.row.category + '，' + STR.a11ySeq(q.row.cellsText));
      }
      body.classList.toggle('choose', isChoice());
      body.classList.toggle('ext-dots', q.type === 'dots');
      resultEl.replaceChildren();
      updateHead();
      renderFooter();
      if (animate) replay(body, 'q-enter');
      guardUntil = performance.now() + ctx.cfg.timing.inputGuardMs;
      sw.reset();
      if (!document.hidden && document.hasFocus()) sw.start();
    }
    const guarded = () => performance.now() < guardUntil;

    function submit() {
      if (phase !== 'ask' || q.type !== 'dots' || guarded()) return;
      const res = round.answer({ cells: input.answer }, sw.stop());
      ctx.save();
      after(res);
    }
    function pick(id) {
      if (phase !== 'ask' || !isChoice() || guarded() || id == null) return;
      const res = round.answer({ optionId: id }, sw.stop());
      ctx.save();
      input.showResult(id, q.row.id);
      after(res);
    }
    function after(res) {
      if (res.correct) {
        phase = 'correct';
        if (q.type === 'dots') input.lock(res.judge);
        resultEl.replaceChildren(h('div', { class: 'result-row' }, W.verdictEl(true)));
        ctx.fx.burst(body.querySelectorAll('.dot.on'));
        streak++; bestStreak = Math.max(bestStreak, streak);
        showStreak();
        ctx.fx.bump(streakEl);
        ctx.haptic(streak % 5 === 0 ? 'pass' : 'correct');
        ctx.say(STR.a11yCorrect);
        if (S.autoNext && !ctx.shot) ctx.later(cont, ctx.autoNextMs());
      } else {
        phase = 'wrong';
        wrongCount++;
        streak = 0;
        showStreak();
        ctx.haptic('wrong');
        if (q.type === 'dots') {
          input.showReveal(res.judge);
          resultEl.replaceChildren(W.extRevealPanel(res.judge, q.row.cellsText));
          ctx.say(STR.a11yIncorrect + '，' + STR.answer + ' ' + q.row.cellsText);
        } else {
          const ans = q.type === 'chooseCells' ? W.seqStripEl(q.row.cells, S.mirror) : h('span', { class: 'digits', text: q.row.symbol });
          resultEl.replaceChildren(h('div', { class: 'result-row' }, W.verdictEl(false),
            h('div', { class: 'answer' }, h('span', { class: 'k', text: STR.answer }), ans)));
          ctx.say(STR.a11yIncorrect + '，' + STR.answer + ' ' + (q.type === 'chooseCells' ? q.row.cellsText : q.row.symbol));
        }
      }
      updateHead();
      renderFooter();
    }
    function cont() {
      if (phase === 'ask') return;
      ctx.clearLater();
      ask(null, true);
    }
    function showStreak() {
      streakEl.hidden = streak < 2;
      streakEl.textContent = STR.streak + ' ' + streak;
      streakEl.setAttribute('aria-label', STR.a11yStreak(streak));
    }
    function finish() { ctx.go('result', { summary: round.summary(), bestStreak, module: 'ext' }); }

    function onMirror(m) {
      if (!q) return;
      if (q.type === 'dots') {
        input.setMirror(m);
      } else if (q.type === 'chooseCells') {
        input.setMirror(m); // 作答后选项已锁定，保持原样
        if (phase !== 'ask') { const strip = resultEl.querySelector('.seq-strip'); if (strip) strip.replaceWith(W.seqStripEl(q.row.cells, m)); }
      } else {
        promptEl.replaceChildren(W.catTag(q.row.category), seqBig(q.row.cells, m));
      }
    }

    const pause = () => sw.pause();
    const resume = () => { if (phase === 'ask' && !document.hidden) sw.start(); };
    const vis = () => (document.hidden ? pause() : resume());
    window.addEventListener('blur', pause);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', vis);

    function onKey(e) {
      if (e.key === 'Escape') { leave(); return true; }
      if (!q) return false;
      if (/^[1-6]$/.test(e.key) && q.type === 'dots' && phase === 'ask') {
        if (!guarded()) input.toggle(Number(e.key)); // 按点位编号，与镜像位置无关
        return true;
      }
      if (e.key === 'Backspace' && q.type === 'dots' && phase === 'ask') { input.prev(); return true; }
      if (/^[1-4]$/.test(e.key) && isChoice() && phase === 'ask') {
        pick(input.idAt(Number(e.key)));
        return true;
      }
      if (e.key === 'Enter') {
        if (phase === 'ask') mainAction(); else cont();
        return true;
      }
      return false;
    }
    function destroy() {
      window.removeEventListener('blur', pause);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', vis);
    }

    ask(params.force, false);
    return {
      el, onKey, destroy,
      api: {
        get q() { return q; },
        get input() { return input; },
        select(cells) { input.set(cells); renderFooter(); },
        submit() { guardUntil = 0; submit(); },
        pick(id) { guardUntil = 0; pick(id); },
        cont() { cont(); },
      },
    };
  };
})(typeof self !== 'undefined' ? self : this);
