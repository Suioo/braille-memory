/**
 * 文本详情（全屏）：逐句核对自动标注。每句一行：原文 + 状态；标红处直接列出原因；「标注详情」默认折叠，
 * 展开后点某个词 / 标点可改拼音、拆开、并下一个、加空方、此处不练习、补拼音、移除。盲文从不在这里出现，也不由这里计算。
 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  const chars = (s) => Array.from(String(s));
  const clip = (s, n) => { const a = chars(s); return a.length > n ? a.slice(0, n).join('') + '…' : s; };
  const CJK_ALL = /^[㐀-鿿]+$/;

  Views.textdetail = function (ctx, params) {
    const T = root.BMTexts;
    const A = root.BMAnnotate;
    const tr = ctx.translator;
    const back = () => ctx.go('practice', {}, { dir: 'back' });
    const find = () => ctx.texts.texts.find((t) => t.id === params.textId);
    if (!find() || !ctx.textData) { ctx.later(back, 0); return { el: h('div', { class: 'page' }) }; }

    const summary = h('p', { class: 'text-sum', role: 'status' });
    // AI 校对（可选）：配置好接口后出现；结果逐段校验后写回，标为「AI」；可撤销本次修改
    const aiOn = !!(root.BMAiViews && root.BMAiViews.available() && root.BMAi.ready(ctx.aiConfig));
    const aiStatus = h('p', { class: 'text-hint', role: 'status' });
    if (ctx.aiLastNote && ctx.aiLastNote.textId === params.textId) { aiStatus.textContent = ctx.aiLastNote.text; ctx.aiLastNote = null; }
    let aiBusy = false;
    let aiStop = false;
    const aiIds = new Set(); // 在途的流式请求，点「停止」时立即取消
    const aiBar = W.progressBar(0, STR.aiReview);
    aiBar.hidden = true;
    const stopBtn = W.btn(STR.aiStop, () => {
      aiStop = true; stopBtn.disabled = true; aiStatus.textContent = STR.aiStopping;
      for (const id of aiIds) { try { root.bm.aiCancel(id); } catch (_) { /* 忽略 */ } }
    }, { variant: 'text' });
    stopBtn.hidden = true;
    const aiBtn = aiOn ? W.btn(STR.aiReview, async () => {
      if (aiBusy) return;
      aiBusy = true; aiStop = false; aiBtn.disabled = true; stopBtn.hidden = false; stopBtn.disabled = false; aiBar.hidden = false;
      // 实时进度：段数 / 批次，等待模型时每秒刷新已等待的秒数
      let last = null;
      let waitFrom = Date.now();
      const paint = () => {
        if (!last || aiStop) return;
        aiStatus.textContent = STR.aiReviewing(last, Math.round((Date.now() - waitFrom) / 1000));
        aiBar.style.setProperty('--v', String(last.total ? last.done / last.total : 0));
        aiBar.setAttribute('aria-valuenow', String(Math.round(100 * (last.total ? last.done / last.total : 0))));
      };
      const tick = setInterval(paint, 1000);
      try {
        const r = await root.BMAiViews.reviewText(ctx, params.textId, (p) => {
          if (!last || p.done !== last.done || p.retry !== last.retry) waitFrom = Date.now();
          last = p;
          paint();
        }, { stopped: () => aiStop, ids: aiIds });
        clearInterval(tick);
        const msg = !r.ok ? STR.aiPartial(r.why, r.done, r.total, r.changed)
          : r.stopped ? STR.aiStopped(r.done, r.total, r.changed) : STR.aiReviewDone(r.changed, r.rejected);
        const why = r.rejectedInfo && r.rejectedInfo.length ? STR.aiRejected(r.rejectedInfo.map((x) => ({ text: x.text, reason: STR.aiRejectReason[x.reason] || x.reason }))) : '';
        if (r.changed) { ctx.toast(msg); ctx.aiLastNote = why ? { textId: params.textId, text: msg + '。' + why } : null; ctx.go('textdetail', { textId: params.textId }, { dir: 'none' }); return; }
        aiStatus.textContent = msg + (why ? '。' + why : '');
      } finally {
        clearInterval(tick);
        aiBusy = false;
        if (aiBtn.isConnected) { aiBtn.disabled = false; stopBtn.hidden = true; aiBar.hidden = true; }
      }
    }, { variant: 'tonal' }) : null;
    const undoBtn = ctx.aiUndo && ctx.aiUndo.textId === params.textId ? W.btn(STR.aiUndo, async () => {
      const prev = ctx.aiUndo.store;
      ctx.aiUndo = null;
      ctx.setTexts(prev);
      const ok = await ctx.saveTexts();
      ctx.save();
      ctx.toast(ok ? STR.aiUndone : STR.textSaveFail);
      ctx.go('textdetail', { textId: params.textId }, { dir: 'none' });
    }, { variant: 'text' }) : null;
    const practiceBtn = W.btn(STR.start, () => { ctx.textScope = params.textId; ctx.go('ruleround', { mode: 'practice', scope: 'text', textId: params.textId }); }, { variant: 'filled', icon: ICON.play(), cls: 'fab' });
    const list = h('div', { class: 'sent-list' });
    const el = h('div', { class: 'page text-detail' },
      W.topBar(C.backBtn(back), h('h1', { text: clip(find().title, 14) }), null),
      h('div', { class: 'page-body' },
        h('div', { class: 'text-banner', role: 'note' }, h('span', { class: 'tb-flag', text: STR.textAuto }), summary),
        aiBtn || undoBtn ? h('div', { class: 'ai-review' }, h('div', { class: 'ta-actions wrap' }, aiBtn, stopBtn, undoBtn), aiBar, aiStatus) : null,
        root.BMTextViews.statsEl(ctx, params.textId),
        list,
        h('div', { class: 'footer' }, practiceBtn)));

    const status = (sid) => ctx.textData.status.get('t:' + params.textId + '#' + sid);
    /** 这句最近 / 最快用时（开「计时」练过才有）。 */
    function timeNote(sid) {
      const e = ctx.progress.texts.items['t:' + params.textId + '#' + sid];
      if (!e || e.lastMs === undefined) return '';
      const f = (ms) => (ms / 1000 < 10 ? (ms / 1000).toFixed(1) : String(Math.round(ms / 1000)));
      return ' · ' + STR.textLastFast(f(e.lastMs), e.bestMs !== undefined ? f(e.bestMs) : null);
    }
    function updateSummary() {
      const st = ctx.textData.texts.find((t) => t.id === params.textId);
      summary.textContent = STR.textReady(st.ready, st.total);
      practiceBtn.disabled = st.ready === 0;
    }

    /** 一处问题 → 一行文字。 */
    function issueText(tokens, is) {
      const t = tokens[is.i] || {};
      const what = t.c ? '「' + clip(t.c, 8) + '」' : '';
      const why = is.kind === 'engine' ? STR.textEngineReason + (is.detail ? '：' + is.detail : '')
        : STR.textReasons[is.reason] || (is.kind === 'pinyin' ? STR.textKinds.pinyin + '：' + is.reason + (is.detail ? ' ' + is.detail : '') : is.reason);
      return (STR.textKinds[is.kind] || '') + ' · ' + what + why;
    }

    function commit(sent, tokens) {
      const next = T.updateSentence(ctx.texts, params.textId, sent.id, tokens, new Date().toISOString());
      if (!next) { ctx.toast(STR.textSaveFail); return false; }
      ctx.setTexts(next);
      ctx.saveTexts().then((ok) => { if (!ok) ctx.toast(STR.textSaveFail); });
      ctx.save();
      return true;
    }

    function sentenceEl(sent, n, open, selected) {
      const st = status(sent.id);
      const ok = !!(st && st.ok);
      const tokens = sent.tokens;
      const redraw = (o, sel) => {
        const cur = find().sentences.find((x) => x.id === sent.id);
        const nu = sentenceEl(cur, n, o, sel);
        row.replaceWith(nu);
        row = nu;
        updateSummary();
      };
      const edit = (fn) => {
        const toks = tokens.map((t) => Object.assign({}, t));
        const sel = fn(toks);
        if (sel === false) return;
        if (commit(sent, toks)) redraw(detail.isOpen(), typeof sel === 'number' ? sel : null);
      };

      // ---- 标注详情（折叠）：词条 + 选中词条的操作 ----
      const toks = tokens.map((t, i) => {
        const label = t.k === 'w' ? t.c + ' ' + t.p : t.k === 'b' ? '␣' : t.k === 'x' ? (t.skip ? '〔' + t.c + '〕' : t.c) : t.c;
        const bad = st && !st.ok && st.issues.some((x) => x.i === i);
        const b = h('button', {
          class: 'tok sl k-' + t.k + (bad ? ' bad' : '') + (t.skip ? ' skip' : '') + (selected === i ? ' sel' : '') + (t.a === 'edited' ? ' edited' : '') + (t.a === 'ai' ? ' ai' : ''), type: 'button',
          'aria-pressed': String(selected === i), onclick: () => redraw(true, selected === i ? null : i),
          'aria-label': ({ w: STR.textTokenWord, u: STR.textTokenPunct, n: STR.textTokenNum, b: STR.textTokenBlank, x: STR.textTokenX })[t.k] + ' ' + label + (bad ? '，' + STR.textSentenceMarked : '') + (t.skip ? '，' + STR.textSkipped : '') + (t.a === 'ai' ? '，' + STR.textTokenAi : ''),
        }, h('span', { text: label }));
        return b;
      });
      const actions = h('div', { class: 'tok-actions' });
      if (selected != null && tokens[selected]) {
        const t = tokens[selected];
        const i = selected;
        const btns = [];
        const editor = (initial, onSave) => {
          const inp = h('input', { class: 'field', type: 'text', value: initial, 'aria-label': STR.textEditPinyin, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' });
          const save = () => {
            const v = inp.value.normalize('NFC').trim().toLowerCase();
            if (!v || /\s/.test(v)) { ctx.toast(STR.textReasons[v ? 'space' : 'empty']); return; }
            onSave(v);
          };
          inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } e.stopPropagation(); });
          actions.replaceChildren(inp, h('p', { class: 'text-hint', text: STR.textPinyinHint }),
            h('div', { class: 'ta-actions' }, W.btn(STR.textRevert, () => redraw(true, i), { variant: 'text' }), W.btn(STR.textSave, save, { variant: 'filled' })));
          if (!root.matchMedia('(pointer: coarse)').matches) inp.focus({ preventScroll: true });
        };
        if (t.k === 'w') {
          btns.push(W.btn(STR.textEditPinyin, () => editor(t.p, (v) => edit((a) => { a[i] = { k: 'w', c: t.c, p: v, a: 'edited' }; return i; })), { variant: 'tonal' }));
          if (chars(t.c).length > 1) {
            btns.push(W.btn(STR.textSplit, () => edit((a) => {
              const r = tr.parse(t.p, { chars: t.c });
              const syl = r.ok && r.words.length === 1 ? r.words[0].syllables : null;
              if (!syl || syl.length !== chars(t.c).length) { ctx.toast(STR.textSplitFail); return false; }
              a.splice(i, 1, ...chars(t.c).map((c, k) => ({ k: 'w', c, p: syl[k].raw + (syl[k].keepTone ? '!' : ''), a: 'edited' })));
              return i;
            }), { variant: 'tonal' }));
          }
          const nx = tokens[i + 1];
          if (nx && nx.k === 'w') {
            btns.push(W.btn(STR.textMerge, () => edit((a) => { a.splice(i, 2, { k: 'w', c: t.c + nx.c, p: t.p + nx.p, a: 'edited' }); return i; }), { variant: 'tonal' }));
          }
        }
        if (t.k === 'x') {
          btns.push(W.btn(t.skip ? STR.textUnskip : STR.textSkip, () => edit((a) => { if (a[i].skip) delete a[i].skip; else a[i].skip = true; return i; }), { variant: 'tonal' }));
          if (CJK_ALL.test(t.c)) btns.push(W.btn(STR.textFillPinyin, () => editor('', (v) => edit((a) => { a[i] = { k: 'w', c: t.c, p: v, a: 'edited' }; return i; })), { variant: 'tonal' }));
        }
        if (t.k !== 'b') btns.push(W.btn(STR.textAddBlank, () => edit((a) => { a.splice(i + 1, 0, { k: 'b' }); return i; }), { variant: 'tonal' }));
        btns.push(W.btn(STR.textRemove, () => edit((a) => { a.splice(i, 1); return null; }), { variant: 'text' }));
        actions.replaceChildren(h('div', { class: 'ta-actions wrap' }, ...btns));
      }
      const detail = W.collapse({ title: STR.textAnnoDetail, cls: 'sent-detail', open: !!open }, h('div', { class: 'tok-list' }, ...toks), actions);

      const issues = st && !st.ok ? st.issues : [];
      let row = h('article', { class: 'sent' + (ok ? ' ok' : ' bad'), 'data-sent': sent.id },
        h('div', { class: 'sent-head' },
          h('span', { class: 'sent-no num', text: STR.textSentence(n) + timeNote(sent.id) }),
          h('span', { class: 'sent-flag ' + (ok ? 'ok' : 'bad'), text: ok ? STR.textOk : STR.textIssues(issues.length) })),
        h('p', { class: 'sent-raw', text: sent.raw }),
        issues.length ? h('ul', { class: 'sent-issues' }, ...issues.slice(0, 4).map((is) => h('li', { text: issueText(tokens, is) })), issues.length > 4 ? h('li', { text: '…' }) : null) : null,
        detail);
      return row;
    }

    find().sentences.forEach((s, k) => list.append(sentenceEl(s, k + 1, false, null)));
    updateSummary();

    function onKey(e) {
      if (e.key === 'Escape') { back(); return true; }
      return false;
    }
    return { el, onKey };
  };
})(typeof self !== 'undefined' ? self : this);
