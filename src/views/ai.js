/**
 * AI 校对（可选）的界面部分：「设置 → AI 校对」的接口配置（服务、地址、Key、模型、查询可用模型、测试连接），
 * 以及文本详情里的「AI 校对分词」执行器。请求格式与结果校验在 core/ai.js，网络请求由平台层（window.bm.aiRequest）发出。
 * window.BMAiViews
 */
(function (root) {
  'use strict';
  const { h } = root.BMDom;
  const W = root.BMW;
  const STR = root.STR;
  const AI = root.BMAi;

  /** 读取配置（启动时调一次，缓存在 ctx.aiConfig）。 */
  async function loadConfig(ctx) {
    try { ctx.aiConfig = root.bm.aiGetConfig ? AI.normalizeConfig(await root.bm.aiGetConfig()) : null; } catch (_) { ctx.aiConfig = null; }
    return ctx.aiConfig;
  }
  const available = () => !!(root.bm && root.bm.aiRequest && root.bm.aiGetConfig);

  /** 发一个请求并给出可读的失败原因。 */
  async function send(req) {
    if (!req) return { ok: false, why: STR.aiErr.config };
    let r;
    try { r = await root.bm.aiRequest(req); } catch (_) { r = { ok: false, reason: 'network' }; }
    if (r && r.ok) return r;
    if (r && r.status) return Object.assign({ why: STR.aiErr.status(r.status, AI.errorMessage(r.text || '')) }, r);
    const base = STR.aiErr[(r && r.reason) || 'network'] || STR.aiErr.network;
    return Object.assign({}, r || {}, { why: base + (r && r.detail ? '（' + r.detail + '）' : '') });
  }

  /**
   * 流式发送对话请求（平台支持时）：边收边解析，onProgress({reasoning, content}) 报告已收到的思考 / 回答字数；
   * 返回 {ok, text: 模型的回答文字} 或失败原因。平台不支持流式时退回普通请求。
   */
  async function chat(cfg, system, user, onProgress, onId) {
    if (!root.bm.aiStream) {
      const r = await send(AI.chatRequest(cfg, system, user));
      return r.ok ? { ok: true, text: AI.parseChat(cfg.kind, r.text) || '' } : r;
    }
    const req = AI.chatRequest(cfg, system, user, { stream: true });
    if (!req) return { ok: false, why: STR.aiErr.config };
    const parser = AI.createStreamParser(cfg.kind);
    let raw = '';
    let r;
    try {
      r = await root.bm.aiStream(req, (chunk) => {
        if (raw.length < AI.LIMITS.responseChars) raw += chunk;
        parser.feed(chunk);
        try { onProgress({ reasoning: parser.reasoning(), content: parser.content().length }); } catch (_) { /* 忽略 */ }
      }, onId);
    } catch (_) { r = { ok: false, reason: 'network' }; }
    parser.end();
    if (r && r.ok) {
      // 服务没按 SSE 回（直接给了整段 JSON）时按普通响应解析
      const text = parser.events() ? parser.content() : AI.parseChat(cfg.kind, raw);
      return { ok: true, text: text || '' };
    }
    if (r && r.status) return Object.assign({}, r, { why: STR.aiErr.status(r.status, AI.errorMessage(r.text || '')) });
    if (r && r.reason === 'canceled') return Object.assign({}, r, { why: STR.aiErr.canceled });
    const base = STR.aiErr[(r && r.reason) || 'network'] || STR.aiErr.network;
    return Object.assign({}, r || {}, { why: base + (r && r.detail ? '（' + r.detail + '）' : '') });
  }

  /** 「设置 → AI 校对」分组的内容。 */
  function settingsRows(ctx) {
    let cfg = AI.normalizeConfig(ctx.aiConfig);
    const stop = (e) => e.stopPropagation(); // 输入框里的按键不触发页面快捷键 / 手柄导航
    const field = (attrs) => { const i = h('input', Object.assign({ class: 'field', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off' }, attrs)); i.addEventListener('keydown', stop); return i; };
    const preset = h('select', { class: 'field', 'aria-label': STR.aiPreset },
      AI.PRESETS.map((p) => h('option', { value: p.id, text: p.name })));
    preset.value = cfg.preset;
    const kind = h('select', { class: 'field', 'aria-label': STR.aiKind },
      AI.KINDS.map((k) => h('option', { value: k, text: STR.aiKinds[k] })));
    kind.value = cfg.kind;
    const base = field({ type: 'url', value: cfg.base, 'aria-label': STR.aiBase, placeholder: 'https://…/v1' });
    const key = field({ type: 'password', value: cfg.key, 'aria-label': STR.aiKey, placeholder: STR.aiKeyHint });
    const model = field({ value: cfg.model, 'aria-label': STR.aiModel, placeholder: STR.aiModelHint });
    const models = h('div', { class: 'ai-models', role: 'listbox', 'aria-label': STR.aiModels });
    const statusEl = h('p', { class: 'text-hint', role: 'status' });
    const slowEl = h('p', { class: 'text-hint ai-slow', text: STR.aiSlowModel });
    const syncSlow = () => { slowEl.hidden = !AI.isReasoningModel(model.value); };
    const kindRow = h('label', { class: 'ai-field' }, h('span', { class: 'li-label', text: STR.aiKind }), kind);
    const keyRow = h('label', { class: 'ai-field' }, h('span', { class: 'li-label', text: STR.aiKey }), key);

    const read = () => AI.normalizeConfig({ preset: preset.value, kind: kind.value, base: base.value, key: key.value, model: model.value });
    const sync = () => {
      const p = AI.presetOf(preset.value);
      kindRow.hidden = preset.value !== 'custom';
      syncSlow();
      keyRow.hidden = !!(p && p.noKey);
    };
    async function save() {
      cfg = read();
      ctx.aiConfig = cfg;
      const ok = await root.bm.aiSetConfig(cfg);
      if (!ok) ctx.toast(STR.aiSaveFail);
    }
    preset.addEventListener('change', () => {
      const p = AI.presetOf(preset.value);
      if (p && p.base) base.value = p.base;
      if (p) kind.value = p.kind;
      model.value = '';
      models.replaceChildren();
      sync();
      save();
    });
    for (const el of [kind, base, key, model]) el.addEventListener('change', save);
    model.addEventListener('input', syncSlow);

    const listBtn = W.btn(STR.aiListModels, async () => {
      await save();
      listBtn.disabled = true;
      statusEl.textContent = STR.aiListing;
      try {
        const r = await send(AI.modelsRequest(cfg));
        if (!r.ok) { statusEl.textContent = r.why; return; }
        const ids = AI.parseModels(cfg.kind, r.text);
        if (!ids || !ids.length) { statusEl.textContent = STR.aiNoModels; return; }
        statusEl.textContent = STR.aiModelsFound(ids.length);
        models.replaceChildren(...ids.slice(0, 80).map((id) => h('button', {
          class: 'ai-model sl' + (id === model.value ? ' selected' : ''), type: 'button', role: 'option', 'aria-selected': String(id === model.value), text: id,
          onclick: (e) => {
            model.value = id;
            syncSlow();
            for (const b of models.children) { const on = b === e.currentTarget; b.classList.toggle('selected', on); b.setAttribute('aria-selected', String(on)); }
            save();
          },
        })));
      } finally { listBtn.disabled = false; }
    }, { variant: 'tonal' });
    const testBtn = W.btn(STR.aiTest, async () => {
      await save();
      if (!AI.ready(cfg)) { statusEl.textContent = STR.aiErr.config; return; }
      testBtn.disabled = true;
      statusEl.textContent = STR.aiTesting;
      try {
        const t0 = Date.now();
        const tick = setInterval(() => { statusEl.textContent = STR.aiTesting + ' ' + Math.round((Date.now() - t0) / 1000) + ' 秒'; }, 1000);
        const r = await chat(cfg, STR.aiTestSystem, STR.aiTestUser, () => {});
        clearInterval(tick);
        const text = r.ok ? r.text : null;
        statusEl.textContent = r.ok ? (text ? STR.aiTestOkIn(((Date.now() - t0) / 1000).toFixed(1)) : STR.aiErr.format) : r.why;
      } finally { testBtn.disabled = false; }
    }, { variant: 'tonal' });

    sync();
    return [
      h('div', { class: 'list-item stack ai-config' },
        h('p', { class: 'text-hint', text: STR.aiPrivacy }),
        h('label', { class: 'ai-field' }, h('span', { class: 'li-label', text: STR.aiPreset }), preset),
        kindRow,
        h('label', { class: 'ai-field' }, h('span', { class: 'li-label', text: STR.aiBase }), base),
        keyRow,
        h('label', { class: 'ai-field' }, h('span', { class: 'li-label', text: STR.aiModel }), model),
        slowEl,
        models,
        h('div', { class: 'ta-actions wrap' }, listBtn, testBtn),
        statusEl),
    ];
  }

  /** 同时在途的请求数：小批 + 两路并行，单个请求更快返回，也不容易超时。 */
  const PARALLEL = 2;
  /** 一批失败（超时 / 网络 / 5xx / 429）时最多重试的次数。 */
  const RETRIES = 2;
  const retryable = (r) => !r.status || r.status === 429 || r.status >= 500;

  /**
   * 把一组汉字段交给 AI 校对（分小批、两路并行、失败重试、不合格的段单独重问），返回逐段校验通过的结果。
   * @returns {Promise<{fixes:Map<string,{start:number,end:number,tokens:object[]}[]>, bad:{run:object,reason:string}[], failure:string|null, prog:object}>}
   */
  async function reviewRuns(ctx, cfg, runs, onStep, ctl) {
    const tr = ctx.translator;
    const system = AI.systemPrompt(tr.rules);
    const fixes = new Map(); // 句 id → [{start, end, tokens}]
    const groups = AI.batches(runs);
    const prog = { done: 0, total: runs.length, batchesDone: 0, batches: groups.length, waiting: 0, retry: 0, reasoning: 0, content: 0 };
    const live = new Map(); // 在途批次 → 已收到的思考 / 回答字数
    let failure = null;
    let next = 0;
    let inflight = 0;
    const report = () => {
      let rs = 0; let ct = 0;
      for (const v of live.values()) { rs += v.reasoning; ct += v.content; }
      try { onStep(Object.assign({}, prog, { waiting: inflight, reasoning: rs, content: ct })); } catch (_) { /* 忽略 */ }
    };
    report();

    const bad = []; // 不合格的段：{run, reason, detail}
    async function runBatch(batch, again) {
      let r = null;
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        if (attempt) { prog.retry++; report(); await new Promise((res) => setTimeout(res, 1500 * attempt)); }
        if (ctl && ctl.stopped()) { r = { ok: false, reason: 'canceled', why: STR.aiErr.canceled }; break; }
        let sid = null;
        live.set(batch, { reasoning: 0, content: 0 });
        r = await chat(cfg, system, AI.userPrompt(batch, again ? STR.aiRetryNote : ''), (p) => { live.set(batch, p); report(); }, (id) => { sid = id; if (ctl && ctl.ids) ctl.ids.add(id); });
        live.delete(batch);
        if (sid && ctl && ctl.ids) ctl.ids.delete(sid);
        if (r.ok || r.reason === 'canceled' || !retryable(r)) break;
      }
      if (!r.ok) { if (r.reason !== 'canceled' && !failure) failure = r.why; return; }
      const json = AI.extractJson(r.text);
      const got = json && Array.isArray(json.runs) ? new Map(json.runs.filter((x) => x && typeof x.id === 'string').map((x) => [x.id, x.w])) : new Map();
      for (const run of batch) {
        const c = AI.checkRun(run, got.get(run.id), tr.parse);
        if (!c.ok) { bad.push({ run, reason: c.reason, detail: c.detail }); continue; }
        if (!fixes.has(run.sent)) fixes.set(run.sent, []);
        fixes.get(run.sent).push({ start: run.start, end: run.end, tokens: AI.keepBaseTone(c.tokens, run, tr.parse) });
      }
      if (!again) { prog.done += batch.length; prog.batchesDone++; }
    }
    async function worker() {
      while (next < groups.length && !failure && !(ctl && ctl.stopped())) {
        const batch = groups[next++];
        inflight++; report();
        try { await runBatch(batch); } finally { inflight--; report(); }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL, groups.length) }, worker));
    // 不合格的段单独再问一次（提醒逐字照抄原文、一字一音节）；仍不合格的才忽略
    if (bad.length && !failure && !(ctl && ctl.stopped())) {
      const redo = bad.splice(0).map((b) => b.run);
      prog.retry++; inflight++; report();
      try { for (const g of AI.batches(redo)) { if (failure || (ctl && ctl.stopped())) break; await runBatch(g, true); } } finally { inflight--; report(); }
    }
    return { fixes, bad, failure, prog };
  }

  /**
   * 对一篇文本做 AI 校对：分小批发送汉字段（两路并行，失败自动重试），逐段校验，合格的写回（标为 AI）。
   * 中途失败或被停止时，已经校验通过的结果照样写回（partial）。改之前的文本库存在 ctx.aiUndo 里，可一键撤销。
   * @param {(p:{done:number, total:number, batchesDone:number, batches:number, waiting:number, retry:number})=>void} onStep 进度（段数）
   * @param {{stopped:()=>boolean, ids?:Set<string>}} [ctl] stopped() 返回 true 时不再发新的批次；ids 收集在途的流式请求（停止时可取消）
   * @returns {Promise<{ok:boolean, why?:string, partial?:boolean, stopped?:boolean, changed:number, rejected:number, done:number, total:number}>}
   */
  async function reviewText(ctx, textId, onStep, ctl) {
    const cfg = AI.normalizeConfig(ctx.aiConfig);
    const empty = { changed: 0, rejected: 0, done: 0, total: 0 };
    if (!AI.ready(cfg)) return Object.assign({ ok: false, why: STR.aiErr.config }, empty);
    const T = root.BMTexts;
    const tr = ctx.translator;
    const text = ctx.texts.texts.find((t) => t.id === textId);
    if (!text || !tr) return Object.assign({ ok: false, why: STR.aiErr.config }, empty);
    const runs = [];
    for (const s of text.sentences) runs.push(...AI.runsOf(s.id, s.tokens, s.id + 'r'));
    if (!runs.length) return Object.assign({ ok: true }, empty);
    const { fixes, bad, failure, prog } = await reviewRuns(ctx, cfg, runs, onStep, ctl);
    let rejected = bad.length;

    const before = ctx.texts;
    let store = ctx.texts;
    let changed = 0;
    const now = new Date().toISOString();
    for (const s of text.sentences) {
      const f = fixes.get(s.id);
      if (!f) continue;
      const a = AI.applyRuns(s.tokens, f);
      if (!a.changed) continue;
      const nx = T.updateSentence(store, textId, s.id, a.tokens, now);
      if (!nx) { rejected += a.changed; continue; }
      store = nx;
      changed += a.changed;
    }
    if (changed) {
      ctx.aiUndo = { textId, store: before };
      ctx.setTexts(store);
      const ok = await ctx.saveTexts();
      ctx.save();
      if (!ok) ctx.toast(STR.textSaveFail);
    }
    const stopped = !failure && prog.done < prog.total;
    const rejectedInfo = bad.slice(0, 3).map((b) => ({ text: b.run.text, reason: b.reason }));
    return { ok: !failure, why: failure || undefined, partial: !!failure && prog.done > 0, stopped, changed, rejected, rejectedInfo, done: prog.done, total: prog.total };
  }


  /**
   * 不入库的句子（文字转盲文页）做 AI 校对：返回每句校订后的 token（不合格的段保留原样）。
   * @param {{id:string, tokens:object[]}[]} sentences
   */
  async function reviewSentences(ctx, sentences, onStep, ctl) {
    const cfg = AI.normalizeConfig(ctx.aiConfig);
    if (!AI.ready(cfg) || !ctx.translator) return { ok: false, why: STR.aiErr.config, changed: 0, rejected: 0 };
    const runs = [];
    for (const s of sentences) runs.push(...AI.runsOf(s.id, s.tokens, s.id + 'r'));
    if (!runs.length) return { ok: true, sentences, changed: 0, rejected: 0 };
    const { fixes, bad, failure, prog } = await reviewRuns(ctx, cfg, runs, onStep, ctl);
    let changed = 0;
    const out = sentences.map((s) => {
      const f = fixes.get(s.id);
      if (!f) return s;
      const a = AI.applyRuns(s.tokens, f);
      changed += a.changed;
      return { id: s.id, tokens: a.tokens };
    });
    return { ok: !failure, why: failure || undefined, sentences: out, changed, rejected: bad.length, rejectedInfo: bad.slice(0, 3).map((b) => ({ text: b.run.text, reason: b.reason })), done: prog.done, total: prog.total };
  }

  /**
   * 盲文转文字：请 AI 由反译出的带调拼音推测汉字原文（仅供参考）。字数与音节数对不上时 fits = false。
   * @param {string} pinyin 反译结果（词间空格，含标点数字）
   * @param {number} syllables 音节数
   */
  async function guessHanzi(ctx, pinyin, syllables, onProgress) {
    const cfg = AI.normalizeConfig(ctx.aiConfig);
    if (!AI.ready(cfg)) return { ok: false, why: STR.aiErr.config };
    const r = await chat(cfg, STR.aiHanziSystem, JSON.stringify({ pinyin }), onProgress || (() => {}));
    if (!r.ok) return r;
    const j = AI.extractJson(r.text);
    const text = j && typeof j.text === 'string' ? j.text.replace(/\s+/g, '').slice(0, 2000) : '';
    if (!text) return { ok: false, why: STR.aiErr.format };
    const han = Array.from(text).filter((c) => /[㐀-鿿豈-﫿]/.test(c)).length;
    return { ok: true, text, fits: han === syllables };
  }

  root.BMAiViews = { loadConfig, available, settingsRows, reviewText, reviewSentences, guessHanzi };
})(typeof self !== 'undefined' ? self : this);
