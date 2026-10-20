/**
 * 单课流程：学（卡片）→ 练（点点位，可提示；每符号干净答对 N 次）→ 测（盲写、计时）。
 * 规则在 BMCourse.LessonSession；测验答错写 recordTestMistake，结束写 recordLessonResult。
 * 课内「练」不写分数（只有「测」记错）。
 */
(function (root) {
  'use strict';
  const { h, ICON, symClass, replay, fmtSec } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  Views.lesson = function (ctx, params) {
    const S = ctx.settings;
    const cfg = ctx.cfg;
    const lesson = ctx.plan[params.index];
    const sess = new root.BMCourse.LessonSession(lesson, ctx.rowsById, cfg, ctx.rng);
    const sw = new root.BMTimer.Stopwatch(() => performance.now());
    let card = null;
    let input = null;
    let row = null;
    let sub = 'ask'; // ask | correct | wrong | card
    let guardUntil = 0;
    let tick = null;
    let promptEl = null;

    const toCourse = () => ctx.go('course', { focus: C.sel('data-lesson', lesson.index) }, { dir: 'back' });
    const mirrorBtn = C.mirrorToggle(ctx, onMirror);
    const steps = h('div', { class: 'steps', 'aria-hidden': 'true' });
    const timer = h('span', { class: 'timer num', role: 'timer' });
    const timerWrap = h('span', { class: 'timer-chip' }, ICON.timer(), timer);
    const trackHolder = h('div', { class: 'track-holder' });
    const body = h('div', { class: 'q-body' });
    const resultEl = h('div', { class: 'result' });
    const footer = h('div', { class: 'footer' });
    const el = h('div', { class: 'page lesson-page' },
      W.topBar(C.backBtn(toCourse), h('h1', { text: STR.lessonName(lesson.category, lesson.number) }), mirrorBtn),
      h('div', { class: 'subbar' }, steps, timerWrap),
      h('div', { class: 'page-body q-page' }, trackHolder, body, resultEl, footer));

    function renderSteps() {
      const order = ['learn', 'practice', 'test'];
      const at = order.indexOf(sess.phase);
      steps.replaceChildren(...[STR.stepLearn, STR.stepPractice, STR.stepTest].map((t, k) =>
        h('span', { class: 'step' + (k === at ? ' now' : k < at ? ' done' : ''), text: t })));
    }
    function stopTick() { if (tick) { clearInterval(tick); tick = null; } }
    function showTimer() {
      timerWrap.hidden = sess.phase !== 'test' || !S.timing;
      if (timerWrap.hidden) { timer.textContent = ''; timer.removeAttribute('aria-label'); return; }
      const sec = sw.elapsed() / 1000;
      timer.textContent = STR.sec(fmtSec(sec));
      timer.setAttribute('aria-label', STR.a11yTimer(Math.floor(sec)));
    }

    // ---------- 学 ----------
    function renderLearn(animate, flipped) {
      row = sess.learnRow;
      sub = 'card';
      renderSteps();
      trackHolder.replaceChildren(W.progressBar((sess.learnIndex + 1) / sess.rows.length, STR.a11yProgress(sess.learnIndex + 1, sess.rows.length)));
      card = W.cardEl(row, { mirror: S.mirror, flipped: !!flipped, onFlip: ctx.fx.lift });
      body.className = 'q-body card-holder';
      body.replaceChildren(card.el);
      if (animate) replay(card.el, 'q-enter');
      resultEl.replaceChildren();
      resultEl.hidden = true;
      showTimer();
      footer.replaceChildren(h('div', { class: 'controls' },
        W.iconBtn(ICON.prev(), STR.a11yPrev, () => { sess.learnMove(-1); renderLearn(true); }, { variant: 'outlined', cls: 'lg-btn', disabled: sess.learnIndex === 0 }),
        W.btn(STR.flip, () => card.flip(), { variant: 'tonal', icon: ICON.flip() }),
        W.btn(STR.next, learnNext, { variant: 'filled', icon: ICON.next(), autofocus: true })));
      if (!ctx.shot && !(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)) { const b = footer.querySelector('[data-autofocus]'); if (b) b.focus({ preventScroll: true }); }
      ctx.say(row.symbol);
    }
    function learnNext() {
      sess.learnMove(1);
      if (sess.phase === 'learn') renderLearn(true); else renderQuestion(true);
    }

    // ---------- 练 / 测 ----------
    function practiceTrack() {
      const need = cfg.course.cleanCorrect;
      const wrap = h('div', { class: 'pips', role: 'img', 'aria-label': sess.rows.map((r) => r.symbol + ' ' + sess.cleanCount(r.id) + '/' + need).join('，') });
      for (const r of sess.rows) {
        const g = h('span', { class: 'pip-group' });
        for (let k = 0; k < need; k++) g.append(h('i', { class: k < sess.cleanCount(r.id) ? 'done' : '' }));
        wrap.append(g);
      }
      return wrap;
    }
    function renderQuestion(animate) {
      stopTick();
      const testing = sess.phase === 'test';
      row = testing ? sess.testRow : sess.practiceRow;
      sub = 'ask';
      renderSteps();
      trackHolder.replaceChildren(testing ? W.progressBar(sess.testIndex / sess.testItems.length, STR.a11yProgress(sess.testIndex + 1, sess.testItems.length)) : practiceTrack());
      input = new W.DotsInput({ mirror: S.mirror, numbers: !testing });
      if (testing) input.el.classList.add('blind');
      input.onChange = renderFooter;
      input.onTap = () => ctx.haptic('tap');
      body.className = 'q-body';
      promptEl = h('div', { class: 'prompt' }, h('div', { class: 'sym ' + symClass(row.symbol), text: row.symbol }));
      body.replaceChildren(promptEl, input.el);
      resultEl.replaceChildren();
      resultEl.hidden = false;
      renderFooter();
      if (animate) replay(body, 'q-enter');
      guardUntil = performance.now() + cfg.timing.inputGuardMs;
      sw.reset();
      if (!document.hidden && document.hasFocus()) sw.start();
      if (testing && S.timing && !ctx.shot) tick = setInterval(showTimer, 200);
      showTimer();
      ctx.say(row.symbol);
    }
    function renderFooter() {
      if (sub === 'ask') {
        const hintBtn = sess.phase === 'practice'
          ? W.btn(STR.hint, hint, { variant: 'tonal', icon: ICON.hint(), disabled: sess.hinted }) : null;
        footer.replaceChildren(h('div', { class: 'footer-row' }, hintBtn,
          W.btn(STR.submit, submit, { variant: 'filled', cls: 'fab', disabled: input.selected.size === 0 })));
      } else if (sub === 'wrong' || (sub === 'correct' && (!S.autoNext || ctx.shot))) {
        footer.replaceChildren(W.btn(STR.next, cont, { variant: 'filled', cls: 'fab', icon: ICON.next() }));
        if (!ctx.shot) footer.querySelector('button').focus({ preventScroll: true });
      } else footer.replaceChildren();
    }
    function hint() {
      if (sess.phase !== 'practice' || sub !== 'ask') return;
      sess.useHint();
      resultEl.replaceChildren(h('div', { class: 'result-row' }, W.answerDigits(row.dotsText)));
      ctx.say(STR.a11yCell(row.dotsText));
      renderFooter();
    }
    const guarded = () => performance.now() < guardUntil;
    function submit() {
      if (sub !== 'ask' || guarded() || !input) return;
      const testing = sess.phase === 'test';
      const ms = sw.stop();
      stopTick();
      showTimer();
      let res;
      if (testing) {
        res = sess.answerTest(input.dots, ms);
        if (!res.correct) { root.BMProgress.recordTestMistake(ctx.progress, res.row, cfg); ctx.save(); }
      } else {
        res = sess.answerPractice(input.dots);
      }
      showMini(res.row, true); // 揭晓后才显示迷你点图
      if (res.correct) {
        sub = 'correct';
        input.lock();
        resultEl.replaceChildren(h('div', { class: 'result-row' }, W.verdictEl(true)));
        ctx.fx.burst(input.el.querySelectorAll('.dot.on'));
        ctx.haptic('correct');
        ctx.say(STR.a11yCorrect);
        if (!testing) trackHolder.replaceChildren(practiceTrack());
        if (S.autoNext && !ctx.shot) ctx.later(cont, ctx.autoNextMs());
      } else {
        sub = 'wrong';
        input.showReveal(res.judge);
        ctx.haptic('wrong');
        ctx.later(() => ctx.haptic('dots', { rows: root.BMHapticsCore.dotRows(res.row.dots, S.mirror) }), 520);
        resultEl.replaceChildren(W.revealPanel(res.judge, res.row.dotsText));
        ctx.say(STR.a11yIncorrect + '，' + STR.a11yMissed(res.judge.missed) + '，' + STR.a11yExtra(res.judge.extra));
        if (!testing) { trackHolder.replaceChildren(practiceTrack()); showCardNext = res.row; }
      }
      renderFooter();
    }
    let showCardNext = null;
    function cont() {
      if (sub === 'ask') return;
      ctx.clearLater();
      if (sub === 'card' && sess.phase === 'learn') { learnNext(); return; }
      if (showCardNext) { const r = showCardNext; showCardNext = null; renderReviewCard(r); return; }
      if (sess.phase === 'done') { finish(); return; }
      renderQuestion(true);
    }
    /** 练习答错后：先看该符号的学习卡（背面），再继续。 */
    function renderReviewCard(r) {
      sub = 'card';
      row = r;
      card = W.cardEl(r, { mirror: S.mirror, flipped: true, onFlip: ctx.fx.lift });
      body.className = 'q-body card-holder';
      body.replaceChildren(card.el);
      replay(card.el, 'q-enter');
      resultEl.replaceChildren();
      resultEl.hidden = true;
      footer.replaceChildren(h('div', { class: 'controls' },
        W.btn(STR.flip, () => card.flip(), { variant: 'tonal', icon: ICON.flip() }),
        W.btn(STR.next, () => { if (sess.phase === 'done') finish(); else renderQuestion(true); }, { variant: 'filled', icon: ICON.next() })));
      if (!ctx.shot) footer.querySelectorAll('button')[1].focus({ preventScroll: true });
      ctx.say(r.symbol + ' ' + STR.a11yCell(r.dotsText));
    }
    function finish() {
      stopTick();
      const r = sess.result(S.timing);
      const { improved } = root.BMProgress.recordLessonResult(ctx.progress, lesson, { stars: r.stars, acc: r.acc, avgSec: r.avgSec });
      ctx.save();
      ctx.go('lessonResult', { index: lesson.index, result: r, improved });
    }

    function showMini(r, fade) {
      if (!promptEl) return;
      const old = promptEl.querySelector('.mini-cell');
      const mini = W.miniCellEl(r.dots, S.mirror, { fade, flippable: true });
      if (old) old.replaceWith(mini); else promptEl.append(mini);
    }
    function onMirror() {
      if ((sub === 'correct' || sub === 'wrong') && promptEl && promptEl.querySelector('.mini-cell')) showMini(row, false);
      if (sub === 'card') {
        const f = card.flipped;
        card = W.cardEl(row, { mirror: S.mirror, flipped: f, onFlip: ctx.fx.lift });
        body.replaceChildren(card.el);
      } else if (input) input.setMirror(S.mirror);
    }

    const pause = () => sw.pause();
    const resume = () => { if (sub === 'ask' && sess.phase !== 'learn' && !document.hidden) sw.start(); };
    const vis = () => (document.hidden ? pause() : resume());
    window.addEventListener('blur', pause);
    window.addEventListener('focus', resume);
    document.addEventListener('visibilitychange', vis);

    function onKey(e) {
      if (e.key === 'Escape') { toCourse(); return true; }
      if (sub === 'card') {
        if (e.key === ' ') { card.flip(); return true; }
        if (e.key === 'Enter') {
          if (sess.phase === 'learn') learnNext();
          else if (sess.phase === 'done') finish();
          else renderQuestion(true);
          return true;
        }
        if (sess.phase === 'learn' && e.key === 'ArrowLeft') { sess.learnMove(-1); renderLearn(true); return true; }
        if (sess.phase === 'learn' && e.key === 'ArrowRight') { learnNext(); return true; }
        return false;
      }
      if (/^[1-6]$/.test(e.key) && sub === 'ask') { if (!guarded()) input.toggle(Number(e.key)); return true; }
      if (e.key === 'Enter') {
        if (sub === 'ask') { if (input.selected.size) submit(); } else cont();
        return true;
      }
      return false;
    }
    /** 手柄：学习阶段的卡片 LB / RB 上一张 / 下一张（其余走页面通用处理：A 确认、X 翻面、Y 主按钮）。 */
    function onPad(action) {
      if (sub !== 'card' || sess.phase !== 'learn') return false;
      if (action === 'lb') { sess.learnMove(-1); renderLearn(true); return true; }
      if (action === 'rb') { learnNext(); return true; }
      return false;
    }
    function destroy() {
      stopTick();
      window.removeEventListener('blur', pause);
      window.removeEventListener('focus', resume);
      document.removeEventListener('visibilitychange', vis);
    }

    renderLearn(false);
    return {
      el, onKey, onPad, destroy,
      api: {
        sess,
        /** 截图用：跳到某阶段（练习阶段全部答对以进入测验）。 */
        skipTo(phase) {
          while (sess.phase === 'learn') sess.learnMove(1);
          if (phase === 'test') while (sess.phase === 'practice') sess.answerPractice(sess.practiceRow.dots);
          renderQuestion(false);
        },
        get row() { return row; },
        select(dots) { input.set(dots); renderFooter(); },
        submit() { guardUntil = 0; submit(); },
        hint,
        cont,
        flip() { card.flip(); },
      },
    };
  };
})(typeof self !== 'undefined' ? self : this);
