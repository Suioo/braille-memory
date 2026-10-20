/**
 * 一轮答题（全屏）：练习 / 复习 / 错题。题型：点点位（dots）或选符号（choose）。
 * 规则在 BMRound；本文件只负责显示、输入、计时与自动下一题。
 */
(function (root) {
  'use strict';
  const { h, ICON, symClass, replay } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  const MODE_LABEL = () => ({ practice: STR.practice, review: STR.review, wrong: STR.mistakes });

  Views.round = function (ctx, params) {
    const S = ctx.settings;
    const mode = params.mode;
    const round = new root.BMRound.Round({
      mode, rows: ctx.scopeRows(), table: ctx.table, progress: ctx.progress, cfg: ctx.cfg,
      length: S.roundLength, qtype: S.qtype, rng: ctx.rng,
    });
    const sw = new root.BMTimer.Stopwatch(() => performance.now());
    let q = null;
    let input = null;
    let phase = 'ask'; // ask | correct | wrong
    let guardUntil = 0;
    let wrongCount = 0;
    let streak = 0;      // 当前连对
    let bestStreak = 0;  // 本轮最长连对
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
    const el = h('div', { class: 'page round-page mode-' + mode },
      W.topBar(C.backBtn(leave), h('h1', {}, h('span', { text: MODE_LABEL()[mode] }), titleNum), h('div', { class: 'actions' }, streakEl, counter, mirrorBtn)),
      progressHolder,
      h('div', { class: 'page-body q-page' }, body, resultEl, footer));

    function updateHead() {
      const n = q ? q.n : round.index;
      if (mode === 'wrong') {
        const left = root.BMProgress.weakRows(ctx.progress, round.rows).length;
        titleNum.textContent = String(n);
        counter.setAttribute('aria-label', STR.a11yWeakLeft(left));
        counter.replaceChildren(W.legendGlyph('missed'), String(left));
      } else {
        titleNum.textContent = n + ' / ' + S.roundLength;
        counter.setAttribute('aria-label', STR.a11yWrong(wrongCount));
        counter.replaceChildren(h('span', { class: 'cnt-ico err' }, ICON.cross()), String(wrongCount));
        const done = round.log.length;
        progressHolder.replaceChildren(W.progressBar(done / S.roundLength, STR.a11yProgress(n, S.roundLength)));
      }
    }
    function renderFooter() {
      if (phase === 'ask' && q.type === 'dots') {
        footer.replaceChildren(W.btn(STR.submit, submit, { variant: 'filled', cls: 'fab', disabled: input.selected.size === 0 }));
      } else if (phase === 'wrong' || (phase === 'correct' && (!S.autoNext || ctx.shot))) {
        footer.replaceChildren(W.btn(STR.next, cont, { variant: 'filled', cls: 'fab', icon: ICON.next() }));
        if (!ctx.shot) footer.querySelector('button').focus({ preventScroll: true });
      } else {
        footer.replaceChildren();
      }
    }

    function ask(force, animate) {
      q = round.next(force);
      if (!q) { ctx.later(finish, 0); return; }
      phase = 'ask';
      if (q.type === 'dots') {
        input = new W.DotsInput({ mirror: S.mirror, numbers: true });
        input.onChange = renderFooter;
        input.onTap = () => ctx.haptic('tap');
        promptEl = h('div', { class: 'prompt' }, h('div', { class: 'sym ' + symClass(q.row.symbol), text: q.row.symbol }));
        body.replaceChildren(promptEl, input.el);
        ctx.say(q.row.symbol);
      } else {
        input = new W.ChooseInput(q.options, pick);
        promptEl = h('div', { class: 'prompt prompt-cell' }, ...promptCell());
        body.replaceChildren(promptEl, input.el);
        ctx.say(STR.a11yCell(q.row.dotsText));
      }
      body.classList.toggle('choose', q.type === 'choose');
      resultEl.replaceChildren();
      updateHead();
      renderFooter();
      if (animate) replay(body, 'q-enter');
      guardUntil = performance.now() + ctx.cfg.timing.inputGuardMs;
      sw.reset();
      if (!document.hidden && document.hasFocus()) sw.start();
    }
    /** 选符号题的题面：迷你点图（像真实盲文）+ 带编号的大方格。 */
    const promptCell = () => [
      W.miniCellEl(q.row.dots, S.mirror, { flippable: true }),
      h('div', { class: 'cell-card small' }, W.cellEl({ dots: new Set(q.row.dots), mirror: S.mirror, numbers: true })),
    ];
    /** 点点位题：只在揭晓后显示迷你点图（之前显示会泄露答案）。 */
    function showMini(fade) {
      const old = promptEl.querySelector('.mini-cell');
      const mini = W.miniCellEl(q.row.dots, S.mirror, { fade, flippable: true });
      if (old) old.replaceWith(mini); else promptEl.append(mini);
    }
    const guarded = () => performance.now() < guardUntil;

    function submit() {
      if (phase !== 'ask' || q.type !== 'dots' || guarded()) return;
      const res = round.answer({ dots: input.dots }, sw.stop());
      ctx.save();
      after(res);
    }
    function pick(id) {
      if (phase !== 'ask' || q.type !== 'choose' || guarded() || id == null) return;
      const res = round.answer({ optionId: id }, sw.stop());
      ctx.save();
      input.showResult(id, q.row.id);
      after(res);
    }
    function after(res) {
      if (q.type === 'dots') showMini(true);
      if (res.correct) {
        phase = 'correct';
        if (q.type === 'dots') input.lock();
        resultEl.replaceChildren(h('div', { class: 'result-row' }, W.verdictEl(true)));
        ctx.fx.burst(body.querySelectorAll('.dot.on'));
        streak++; bestStreak = Math.max(bestStreak, streak);
        showStreak();
        ctx.fx.bump(streakEl);
        // 每连对 5 题给一次成功震动作为里程碑，其余答对用轻震
        ctx.haptic(streak % 5 === 0 ? 'pass' : 'correct', { streak });
        ctx.say(STR.a11yCorrect);
        if (S.autoNext && !ctx.shot) ctx.later(cont, ctx.autoNextMs());
      } else {
        phase = 'wrong';
        wrongCount++;
        streak = 0;
        showStreak();
        ctx.haptic('wrong');
        ctx.later(() => ctx.haptic('dots', { rows: root.BMHapticsCore.dotRows(q.row.dots, S.mirror) }), 520); // 答错：先「错」的震，再按行震出正确点位
        if (q.type === 'dots') {
          input.showReveal(res.judge);
          resultEl.replaceChildren(W.revealPanel(res.judge, q.row.dotsText));
          ctx.say(STR.a11yIncorrect + '，' + STR.a11yMissed(res.judge.missed) + '，' + STR.a11yExtra(res.judge.extra));
        } else {
          resultEl.replaceChildren(h('div', { class: 'result-row' }, W.verdictEl(false), W.answerDigits(q.row.symbol)));
          ctx.say(STR.a11yIncorrect + '，' + STR.answer + ' ' + q.row.symbol);
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
    /** 连对 ≥2 才显示，避免第一题就出现「连对 1」 */
    function showStreak() {
      streakEl.hidden = streak < 2;
      streakEl.textContent = STR.streak + ' ' + streak;
      streakEl.setAttribute('aria-label', STR.a11yStreak(streak));
    }
    function finish() { ctx.go('result', { summary: round.summary(), bestStreak }); }

    function onMirror(m) {
      if (!q) return;
      if (q.type === 'dots') {
        input.setMirror(m);
        if (phase !== 'ask') showMini(false);
      } else promptEl.replaceChildren(...promptCell());
    }

    // 计时不含窗口失焦/隐藏
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
      if (/^[1-4]$/.test(e.key) && q.type === 'choose' && phase === 'ask') {
        pick(input.idAt(Number(e.key)));
        return true;
      }
      if (e.key === 'Enter') {
        if (phase === 'ask') { if (q.type === 'dots' && input.selected.size) submit(); } else cont();
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
        select(dots) { input.set(dots); renderFooter(); },
        submit() { guardUntil = 0; submit(); },
        pick(id) { guardUntil = 0; pick(id); },
        cont() { cont(); },
      },
    };
  };
})(typeof self !== 'undefined' ? self : this);
