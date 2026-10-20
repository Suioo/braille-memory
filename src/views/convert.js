/**
 * 文字盲文互转（全屏，从「学习」页右上角进入）：
 *  - 文字 → 盲文：自动分词注音（与自定义文本同一套标注 + 第 12 章校订），按标准翻成盲文，逐句显示拼音与点位，可复制 Unicode 盲文；
 *    配好 AI 时可「AI 校对分词」让空方位置更准（结果逐词校验，点位仍由程序计算）。
 *  - 盲文 → 文字：输入点位（屏幕上的六点键盘，或粘贴 Unicode 盲文 / 点位数字），还原成带调拼音；简写字直接给出汉字，
 *    其余汉字可让 AI 推测（仅供参考）。
 * 两边都不保存任何内容。
 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  let backT = null; // 反查表（第一次用到时才建，约几十毫秒）

  Views.convert = function (ctx) {
    const A = root.BMAnnotate;
    const tr = ctx.translator;
    const back = () => ctx.go(ctx.lastTab || 'learn', {}, { dir: 'back' });
    if (!tr) { ctx.later(back, 0); return { el: h('div', { class: 'page' }) }; }
    if (!backT) backT = root.BMBackTranslate.createBackTranslator(tr);
    const aiOn = () => !!(root.BMAiViews && root.BMAiViews.available() && root.BMAi.ready(ctx.aiConfig));
    const stop = (e) => e.stopPropagation();
    let mode = ctx.convertMode === 'b2t' ? 'b2t' : 't2b';
    const body = h('div', { class: 'conv-body' });

    const modeSeg = W.segmented(STR.convMode, [{ value: 't2b', text: STR.convT2B }, { value: 'b2t', text: STR.convB2T }], mode, (v) => {
      modeSeg.select(v); mode = v; ctx.convertMode = v; render();
    });
    const viewSeg = C.viewSegmented(ctx, () => render());

    // ---------------- 文字 → 盲文 ----------------
    let t2bText = ctx.convertText || '';
    let t2bSents = null; // [{id, raw, tokens}]
    let aiBusy = false;
    let aiStop = false;
    const aiIds = new Set();

    async function annotate() {
      const raw = t2bText.trim();
      if (!raw) { t2bSents = []; render(); return; }
      const lib = await root.BMPinyinLib.load();
      if (!lib) { ctx.toast(STR.textAddReason['no-lib']); return; }
      const out = [];
      A.splitSentences(raw).slice(0, 60).forEach((s, i) => {
        const t = A.tokenize(s, { map: tr.map, provider: lib });
        out.push({ id: 's' + i, raw: s, tokens: t.ok ? t.tokens : [{ k: 'x', c: s }] });
      });
      t2bSents = out;
      render();
    }

    function sentenceCard(s) {
      const chk = A.check(s.tokens, tr);
      const mirror = ctx.settings.mirror;
      const cells = chk.ok ? chk.result.cells.map((c) => (c.kind === 'space' ? [] : c.dots)) : null;
      const strip = h('div', { class: 'conv-cells' });
      if (cells) {
        // 按词分组排成多行（空方处换行时保持词的完整），扎写视角整串从右往左
        const words = [];
        let cur = [];
        for (const c of cells) { if (!c.length) { if (cur.length) words.push(cur); cur = []; } else cur.push(c); }
        if (cur.length) words.push(cur);
        const order = mirror ? words.slice().reverse() : words;
        for (const w of order) strip.append(W.seqStripEl(w, mirror, { xs: true }));
      }
      return h('article', { class: 'conv-sent' + (chk.ok ? '' : ' bad') },
        h('p', { class: 'conv-raw', text: s.raw }),
        h('p', { class: 'conv-py', text: A.pinyinLine(s.tokens) }),
        cells ? strip : h('p', { class: 'sent-issues', text: STR.convCantTranslate }),
        cells ? h('p', { class: 'conv-uni', text: backT.toUnicode(cells) }) : null);
    }

    function renderT2B() {
      const area = h('textarea', { class: 'field conv-input', rows: '4', placeholder: STR.convT2BHint, 'aria-label': STR.convT2B, spellcheck: 'false' });
      area.value = t2bText;
      area.addEventListener('keydown', stop);
      area.addEventListener('input', () => { t2bText = area.value; ctx.convertText = t2bText; });
      const goBtn = W.btn(STR.convGo, async () => {
        goBtn.disabled = true;
        try { await annotate(); } finally { if (goBtn.isConnected) goBtn.disabled = false; }
      }, { variant: 'filled' });
      const status = h('p', { class: 'text-hint', role: 'status' });
      const aiBtn = aiOn() && t2bSents && t2bSents.length ? W.btn(STR.aiReview, async () => {
        if (aiBusy) return;
        aiBusy = true; aiStop = false; aiBtn.disabled = true;
        const t0 = Date.now();
        let last = null;
        const tick = setInterval(() => { if (last) status.textContent = STR.aiReviewing(last, Math.round((Date.now() - t0) / 1000)); }, 1000);
        try {
          const r = await root.BMAiViews.reviewSentences(ctx, t2bSents.map((s) => ({ id: s.id, tokens: s.tokens })), (p) => { last = p; }, { stopped: () => aiStop, ids: aiIds });
          clearInterval(tick);
          if (r.sentences) t2bSents = t2bSents.map((s, i) => Object.assign({}, s, { tokens: r.sentences[i].tokens }));
          const msg = !r.ok ? r.why : STR.aiReviewDone(r.changed, r.rejected);
          ctx.convertNote = msg;
          render();
        } finally { clearInterval(tick); aiBusy = false; }
      }, { variant: 'tonal' }) : null;
      if (ctx.convertNote) { status.textContent = ctx.convertNote; ctx.convertNote = null; }
      const copyBtn = t2bSents && t2bSents.length ? W.btn(STR.convCopy, async () => {
        const uni = t2bSents.map((s) => {
          const chk = A.check(s.tokens, tr);
          return chk.ok ? backT.toUnicode(chk.result.cells.map((c) => (c.kind === 'space' ? [] : c.dots))) : '';
        }).filter(Boolean).join('\n');
        ctx.toast((await ctx.copyText(uni)) ? STR.convCopied : STR.openFail);
      }, { variant: 'text' }) : null;
      const list = h('div', { class: 'conv-list' }, ...(t2bSents || []).map(sentenceCard));
      return [
        area,
        h('div', { class: 'ta-actions wrap' }, copyBtn, aiBtn, goBtn),
        status,
        t2bSents && t2bSents.length ? h('p', { class: 'text-hint', text: STR.convAutoNote }) : null,
        list,
      ];
    }

    // ---------------- 盲文 → 文字 ----------------
    let b2tText = ctx.convertBraille || '';
    let keyDots = new Set();
    let hanzi = null;

    function renderB2T() {
      const mirror = ctx.settings.mirror;
      const area = h('textarea', { class: 'field conv-input', rows: '3', placeholder: STR.convB2THint, 'aria-label': STR.convB2T, spellcheck: 'false' });
      area.value = b2tText;
      area.addEventListener('keydown', stop);
      const result = h('div', { class: 'conv-result' });
      const status = h('p', { class: 'text-hint', role: 'status' });
      const setText = (v) => { b2tText = v; ctx.convertBraille = v; area.value = v; hanzi = null; paint(); };
      area.addEventListener('input', () => { b2tText = area.value; ctx.convertBraille = b2tText; hanzi = null; paint(); });

      function paint() {
        const cells = backT.parseInput(b2tText);
        result.replaceChildren();
        if (cells == null) { result.append(h('p', { class: 'sent-issues', text: STR.convBadInput })); return; }
        if (!cells.length) return;
        const d = backT.decode(cells);
        const known = d.words.map((w) => w.items.map((it) => it.char || '').join('')).join('');
        const syl = d.words.reduce((n, w) => n + w.items.filter((x) => x.type === 'syl').length, 0);
        const words = [];
        let cur = [];
        for (const c of cells) { if (!c.length) { if (cur.length) words.push(cur); cur = []; } else cur.push(c); }
        if (cur.length) words.push(cur);
        const strip = h('div', { class: 'conv-cells' }, ...(mirror ? words.slice().reverse() : words).map((w) => W.seqStripEl(w, mirror, { xs: true })));
        result.append(...[
          strip,
          h('p', { class: 'conv-py big', text: d.pinyin }),
          d.unknown ? h('p', { class: 'sent-issues', text: STR.convUnknown(d.unknown) }) : null,
          known ? h('p', { class: 'text-hint', text: STR.convKnownChars(known) }) : null,
          hanzi ? h('p', { class: 'conv-raw big', text: hanzi.text }) : null,
          hanzi ? h('p', { class: 'text-hint', text: hanzi.fits ? STR.convHanziNote : STR.convHanziMismatch }) : null].filter(Boolean));
        if (aiOn() && syl) {
          const gBtn = W.btn(STR.convGuess, async () => {
            gBtn.disabled = true;
            const t0 = Date.now();
            const tick = setInterval(() => { status.textContent = STR.aiTesting + ' ' + Math.round((Date.now() - t0) / 1000) + ' 秒'; }, 1000);
            try {
              const r = await root.BMAiViews.guessHanzi(ctx, d.pinyin, syl);
              clearInterval(tick);
              if (!r.ok) { status.textContent = r.why; return; }
              status.textContent = '';
              hanzi = r;
              paint();
            } finally { clearInterval(tick); if (gBtn.isConnected) gBtn.disabled = false; }
          }, { variant: 'tonal' });
          result.append(h('div', { class: 'ta-actions wrap' }, gBtn));
        }
      }

      // 六点键盘：点选点位后「加一方」；阅读视角左列 1 2 3、右列 4 5 6，扎写视角左右互换
      const dotBtns = [];
      const pad = h('div', { class: 'conv-pad', role: 'group', 'aria-label': STR.convPad });
      const order = mirror ? [4, 1, 5, 2, 6, 3] : [1, 4, 2, 5, 3, 6];
      for (const d of order) {
        const b = h('button', {
          class: 'conv-dot sl' + (keyDots.has(d) ? ' on' : ''), type: 'button', 'aria-pressed': String(keyDots.has(d)), text: String(d),
          onclick: () => { if (keyDots.has(d)) keyDots.delete(d); else keyDots.add(d); b.classList.toggle('on', keyDots.has(d)); b.setAttribute('aria-pressed', String(keyDots.has(d))); ctx.haptic('tick'); },
        });
        dotBtns.push(b);
        pad.append(b);
      }
      const uniOf = (dots) => backT.toUnicode([[...dots]]);
      const cur = () => (/^[⠀-⣿\s]*$/.test(b2tText) ? b2tText : backT.toUnicode(backT.parseInput(b2tText) || []));
      const keys = h('div', { class: 'conv-keys' },
        W.btn(STR.convAddCell, () => { if (!keyDots.size) return; setText(cur() + uniOf(keyDots)); keyDots = new Set(); for (const b of dotBtns) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); } }, { variant: 'filled' }),
        W.btn(STR.convSpace, () => setText(cur() + '⠀'), { variant: 'tonal' }),
        W.btn(STR.convBackspace, () => { const a = Array.from(cur()); a.pop(); setText(a.join('')); }, { variant: 'tonal' }),
        W.btn(STR.convClear, () => setText(''), { variant: 'text' }));
      paint();
      return [
        h('p', { class: 'text-hint', text: STR.convB2TNote }),
        h('div', { class: 'conv-pad-row' }, pad, keys),
        area,
        status,
        result,
      ];
    }

    function render() {
      body.replaceChildren(...(mode === 't2b' ? renderT2B() : renderB2T()).filter(Boolean)); // 没有结果时的占位 null 不能交给 DOM（会显示成文字 null）
    }
    render();
    if (mode === 't2b' && t2bText && !t2bSents) annotate();

    const el = h('div', { class: 'page convert-page' },
      W.topBar(C.backBtn(back), h('h1', { text: STR.convTitle }), null),
      h('div', { class: 'page-body' }, h('div', { class: 'seg-row' }, modeSeg), h('div', { class: 'seg-row' }, viewSeg), body));
    function onKey(e) {
      if (e.key === 'Escape') { if (aiBusy) { aiStop = true; for (const id of aiIds) { try { root.bm.aiCancel(id); } catch (_) { /* 忽略 */ } } } back(); return true; }
      return false;
    }
    return { el, onKey, destroy() { aiStop = true; for (const id of aiIds) { try { root.bm.aiCancel(id); } catch (_) { /* 忽略 */ } } } };
  };
})(typeof self !== 'undefined' ? self : this);
