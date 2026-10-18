/**
 * 规则 / 词句的一轮答题（全屏）：练习 / 复习 / 错题。题型：词句翻盲文、盲文读词、规则判断。
 * 规则在 BMRuleRound / BMRuleItems；本文件只负责显示、输入、计时与自动下一题，并把「错在哪条规则」摆出来。
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

  Views.ruleround = function (ctx, params) {
    const S = ctx.settings;
    const mode = params.mode;
    const data = ctx.ruleData;
    const tr = ctx.translator;
    const round = new root.BMRuleRound.RuleRound({
      mode, data, translator: tr, progress: ctx.progress, cfg: ctx.cfg, length: S.roundLength, qtype: ctx.ruleQtype, rng: ctx.rng,
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
    let expectedEl = null;
    let lastRes = null;

    const leave = () => ctx.go('practice', {}, { dir: 'back' });
    const titleNum = h('span', { class: 'num' });
    const counter = h('span', { class: 'counter' });
    const streakEl = h('span', { class: 'streak num', hidden: true });
    const mirrorBtn = C.mirrorToggle(ctx, onMirror);
    const progressHolder = h('div', { class: 'progress-holder' });
    const body = h('div', { class: 'q-body' });
    const resultEl = h('div', { class: 'result' });
    const footer = h('div', { class: 'footer' });
    const el = h('div', { class: 'page round-page rule-round mode-' + mode },
      W.topBar(C.backBtn(leave), h('h1', {}, h('span', { text: MODE_LABEL()[mode] }), titleNum), h('div', { class: 'actions' }, streakEl, counter, mirrorBtn)),
      progressHolder,
      h('div', { class: 'page-body q-page' }, body, resultEl, footer));

    const isChoice = () => q && q.type !== 'translate';
    function updateHead() {
      const n = q ? q.n : round.index;
      if (mode === 'wrong') {
        const left = P.ruleWeakItems(ctx.progress, root.BMRuleRound.availableTypes(data).flatMap((t) => root.BMRuleRound.poolOf(data, t))).length;
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
    function renderFooter() {
      footer.classList.toggle('word-actions', phase === 'ask' && q && q.type === 'translate');
      if (phase === 'ask' && q.type === 'translate') {
        footer.replaceChildren(
          W.btn(STR.del, () => input.del(), { variant: 'text', disabled: !(input.curFilled || input.slots.length > 1) }),
          W.btn(STR.blankCell, () => input.blank(), { variant: 'tonal' }),
          W.btn(STR.nextCell, () => input.next(), { variant: 'tonal', disabled: !input.curFilled }),
          W.btn(STR.submit, submit, { variant: 'filled', cls: 'fab', disabled: !input.canSubmit }));
      } else if (phase === 'wrong' || (phase === 'correct' && (!S.autoNext || ctx.shot))) {
        footer.replaceChildren(W.btn(STR.next, cont, { variant: 'filled', cls: 'fab', icon: ICON.next() }));
        if (!ctx.shot) footer.querySelector('button').focus({ preventScroll: true });
      } else {
        footer.replaceChildren();
      }
    }

    /** 拼音一行（判断题：把被问的那个音节框出来）。 */
    function pinyinLine(item) {
      const line = h('div', { class: 'rule-pinyin' });
      const parsed = tr.parse(item.word.pinyin, { chars: item.word.chars });
      let k = 0;
      parsed.words.forEach((w, wi) => {
        if (wi) line.append(' ');
        for (const s of w.syllables) {
          line.append(h('span', { class: 'py-syl' + (k === item.syllable ? ' target' : ''), text: s.raw }));
          k++;
        }
      });
      return line;
    }
    const charsEl = (chars) => h('div', { class: 'rule-chars q-chars ' + symClass(chars), text: chars });

    /** 读词题的题面：整串点位（空方画成虚线框）。 */
    const readPrompt = () => h('div', { class: 'prompt prompt-read' }, W.wordStripEl(q.item.cells, S.mirror, {}));
    const choiceRows = () => q.options.map((o, i) => ({ id: i + 1, symbol: o.text, key: o.key }));

    function ask(force, animate) {
      q = round.next(force);
      if (!q) { ctx.later(finish, 0); return; }
      phase = 'ask';
      expectedEl = null;
      lastRes = null;
      if (q.type === 'translate') {
        input = new W.WordInput({ mirror: S.mirror, numbers: true });
        input.onChange = renderFooter;
        input.onTap = () => ctx.haptic('tap');
        promptEl = h('div', { class: 'prompt prompt-words' }, charsEl(q.item.chars), h('div', { class: 'rule-pinyin', text: q.item.pinyin }));
        body.replaceChildren(promptEl, input.el);
        ctx.say(q.item.chars + '，' + q.item.display);
      } else if (q.type === 'read') {
        const rows = choiceRows();
        input = new W.ChooseInput(rows, pickIdx);
        promptEl = readPrompt();
        body.replaceChildren(promptEl, input.el);
        ctx.say(STR.a11yWordCells(q.item.cells.length));
      } else {
        const isTone = q.item.family === 'tone';
        const rows = [{ id: 1, symbol: isTone ? STR.toneWrite : STR.contractYes }, { id: 2, symbol: isTone ? STR.toneOmit : STR.contractNo }];
        input = new W.ChooseInput(rows, pickIdx);
        promptEl = h('div', { class: 'prompt prompt-judge' }, charsEl(q.item.word.chars), pinyinLine(q.item),
          h('div', { class: 'judge-ask', text: isTone ? q.item.raw + ' · ' + STR.askTone : q.item.char + ' · ' + STR.askContract }));
        body.replaceChildren(promptEl, input.el);
        ctx.say(q.item.word.chars + '，' + q.item.raw);
      }
      body.dataset.key = q.item.key; // 调试 / 自动化检查用：当前题目的 key 与题型
      body.dataset.type = q.type;
      body.classList.toggle('choose', isChoice());
      body.classList.toggle('ext-dots', q.type === 'translate');
      body.classList.toggle('read-q', q.type === 'read');
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
      if (phase !== 'ask' || q.type !== 'translate' || guarded() || !input.canSubmit) return;
      const res = round.answer({ cells: input.answer }, sw.stop());
      ctx.save();
      after(res);
    }
    function pickIdx(id) {
      if (phase !== 'ask' || !isChoice() || guarded() || id == null) return;
      const rows = q.type === 'read' ? q.options : null;
      let res;
      let correctId;
      if (q.type === 'read') {
        const opt = rows[id - 1];
        res = round.answer({ key: opt.key }, sw.stop());
        correctId = rows.findIndex((o) => o.key === q.item.key) + 1;
      } else {
        const positive = id === 1; // 第 1 项 = 「标调 / 简写」
        res = round.answer({ choice: positive }, sw.stop());
        correctId = q.item.answer ? 1 : 2;
      }
      ctx.save();
      input.showResult(id, correctId);
      after(res);
    }

    /** 「第 N 方 · 类别 · 提示」+ 规则说明条。 */
    function explainEl(ex) {
      const box = h('div', { class: 'explain' });
      if (ex && ex.index != null && ex.kind) {
        const bits = [STR.firstWrong(ex.index + 1), STR.kindName[ex.kind] || ex.kind];
        if (ex.hint === 'toneShouldOmit') bits.push(STR.hintOmit);
        else if (ex.hint === 'toneMissing') bits.push(STR.hintMissing);
        box.append(h('div', { class: 'explain-line', role: 'alert', text: bits.join(' · ') }));
      }
      const ids = (ex && ex.rules) || [];
      if (ids.length) for (const id of ids.slice(0, 2)) { const r = data.rule(id); if (r) box.append(W.ruleBoxEl(r)); }
      else if (ex && ex.kind) box.append(h('div', { class: 'explain-table', text: STR.tableOnly }));
      return box;
    }
    function expectedRow(first) {
      expectedEl = W.wordStripEl(q.item.cells, S.mirror, { first });
      return h('div', { class: 'expected-row' }, h('span', { class: 'k', text: STR.answer }), expectedEl);
    }
    function after(res) {
      lastRes = res;
      const ex = res.explain;
      const nodes = [];
      if (q.type === 'translate') {
        input.reveal(res.judge);
        nodes.push(h('div', { class: 'result-row' }, W.verdictEl(res.correct)));
        nodes.push(expectedRow(res.correct ? -1 : res.judge.firstWrong));
        if (!res.correct) nodes.push(explainEl(ex));
        if (q.item.note) nodes.push(h('div', { class: 'item-note', text: q.item.note }));
      } else if (q.type === 'read') {
        nodes.push(h('div', { class: 'result-row' }, W.verdictEl(res.correct)));
        if (!res.correct) nodes.push(explainEl(ex));
      } else {
        nodes.push(h('div', { class: 'result-row' }, W.verdictEl(res.correct)));
        if (!res.correct) nodes.push(explainEl({ rules: ex.rules }));
      }
      resultEl.replaceChildren(h('div', { class: 'result-col' }, ...nodes));
      if (res.correct) {
        phase = 'correct';
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
        ctx.say(STR.a11yIncorrect + (ex && ex.index != null ? '，' + STR.firstWrong(ex.index + 1) : ''));
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
    function finish() { ctx.go('result', { summary: round.summary(), bestStreak, module: 'rules' }); }

    function onMirror(m) {
      if (!q) return;
      if (q.type === 'translate') {
        input.setMirror(m);
        if (expectedEl) { const first = lastRes && !lastRes.correct ? lastRes.judge.firstWrong : -1; const n = W.wordStripEl(q.item.cells, m, { first }); expectedEl.replaceWith(n); expectedEl = n; }
      } else if (q.type === 'read') {
        const n = readPrompt();
        promptEl.replaceWith(n);
        promptEl = n;
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
      if (q.type === 'translate' && phase === 'ask') {
        if (/^[1-6]$/.test(e.key)) { if (!guarded()) input.toggle(Number(e.key)); return true; }
        if (e.key === 'Backspace') { input.del(); return true; }
        if (e.key === ' ') { input.blank(); return true; }
        if (e.key === 'Enter') { if (input.curFilled) input.next(); else submit(); return true; }
      }
      if (/^[1-4]$/.test(e.key) && isChoice() && phase === 'ask') { pickIdx(input.idAt(Number(e.key))); return true; }
      if (e.key === 'Enter' && phase !== 'ask') { cont(); return true; }
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
        pick(id) { guardUntil = 0; pickIdx(id); },
        cont() { cont(); },
      },
    };
  };
})(typeof self !== 'undefined' ? self : this);
