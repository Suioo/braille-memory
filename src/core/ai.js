/**
 * AI 校对（可选，纯逻辑）：用用户自己配置的大模型接口校订自定义文本的「分词 + 拼音」。
 *
 * - 只让模型给出分词和带调拼音；盲文点位永远由 translate.js 按规则计算，模型的输出逐词校验（字必须与原文逐字一致、
 *   音节数必须与字数一致、拼音必须能被拼音还原表解析），任何一处不合格整段都不采用，不会猜。
 * - 支持三种接口格式：OpenAI 兼容（OpenAI、DeepSeek、通义千问、Kimi、智谱、硅基流动、OpenRouter、Ollama / LM Studio 等）、
 *   Anthropic（Claude）、Google Gemini；都能查询可用模型。
 * - 本文件不发请求：只生成请求 {url, method, headers, body} 与解析响应文本，由平台层（Electron 主进程 / 安卓原生 HTTP）发送。
 * 渲染进程：window.BMAi；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMAi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KINDS = ['openai', 'anthropic', 'gemini'];
  /** 常用服务的预设：接口格式 + 默认地址；选「自定义」时地址自己填（OpenAI 兼容格式）。 */
  const PRESETS = [
    { id: 'deepseek', name: 'DeepSeek', kind: 'openai', base: 'https://api.deepseek.com/v1' },
    { id: 'qwen', name: '通义千问', kind: 'openai', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
    { id: 'kimi', name: 'Kimi', kind: 'openai', base: 'https://api.moonshot.cn/v1' },
    { id: 'zhipu', name: '智谱 GLM', kind: 'openai', base: 'https://open.bigmodel.cn/api/paas/v4' },
    { id: 'siliconflow', name: '硅基流动', kind: 'openai', base: 'https://api.siliconflow.cn/v1' },
    { id: 'doubao', name: '豆包（火山方舟）', kind: 'openai', base: 'https://ark.cn-beijing.volces.com/api/v3' },
    { id: 'openai', name: 'OpenAI', kind: 'openai', base: 'https://api.openai.com/v1' },
    { id: 'anthropic', name: 'Claude', kind: 'anthropic', base: 'https://api.anthropic.com/v1' },
    { id: 'gemini', name: 'Gemini', kind: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta' },
    { id: 'openrouter', name: 'OpenRouter', kind: 'openai', base: 'https://openrouter.ai/api/v1' },
    { id: 'ollama', name: 'Ollama（本机）', kind: 'openai', base: 'http://localhost:11434/v1', noKey: true },
    { id: 'lmstudio', name: 'LM Studio（本机）', kind: 'openai', base: 'http://localhost:1234/v1', noKey: true },
    { id: 'custom', name: '自定义（OpenAI 兼容）', kind: 'openai', base: '' },
  ];
  const LIMITS = { key: 400, model: 120, base: 300, responseChars: 2 * 1024 * 1024, batchChars: 300, batchRuns: 12 };

  /** 拼音连写时，a、o、e 开头的音节前加隔音符号 '（《汉语拼音方案》），如 xī'ān、tiān'ānmén，避免切分歧义。 */
  const joinSyllables = (syl) => syl.map((s, i) => (i > 0 && /^[aoeāáǎàōóǒòēéěè]/.test(s) ? "'" + s : s)).join('');
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const presetOf = (id) => PRESETS.find((p) => p.id === id) || null;

  /** 局域网 / 本机地址允许 http（本地模型）；其余必须 https，避免 API Key 明文传输。 */
  function isLocalHost(host) {
    const h = String(host).toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h === '::1' || h.endsWith('.localhost')) return true;
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (!m) return false;
    const [a, b] = [Number(m[1]), Number(m[2])];
    return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
  }
  /** 清洗接口地址：去掉末尾的 /；不合格返回 null。 */
  function normalizeBase(base) {
    const s = str(base, LIMITS.base).replace(/\/+$/, '');
    let u;
    try { u = new URL(s); } catch (_) { return null; }
    if (u.username || u.password || u.search || u.hash) return null;
    if (u.protocol === 'https:') return s;
    if (u.protocol === 'http:' && isLocalHost(u.hostname)) return s;
    return null;
  }

  /** 清洗配置（读入 / 保存都过一遍）。 */
  function normalizeConfig(raw) {
    const r = isObj(raw) ? raw : {};
    const preset = presetOf(r.preset) ? r.preset : 'deepseek';
    const p = presetOf(preset);
    const kind = preset === 'custom' && KINDS.includes(r.kind) ? r.kind : p.kind;
    const base = normalizeBase(r.base) || p.base;
    return { preset, kind, base, key: str(r.key, LIMITS.key).replace(/\s/g, ''), model: str(r.model, LIMITS.model) };
  }
  /** 能否发请求：有地址、有模型，需要 Key 的服务有 Key。 */
  function ready(cfg) {
    const c = normalizeConfig(cfg);
    const p = presetOf(c.preset);
    return !!(normalizeBase(c.base) && c.model && (c.key || (p && p.noKey)));
  }

  function headersFor(c) {
    if (c.kind === 'anthropic') return { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' };
    if (c.kind === 'gemini') return { 'x-goog-api-key': c.key, 'content-type': 'application/json' };
    const hd = { 'content-type': 'application/json' };
    if (c.key) hd.authorization = 'Bearer ' + c.key;
    return hd;
  }

  /** 查询可用模型的请求。 */
  function modelsRequest(cfg) {
    const c = normalizeConfig(cfg);
    const base = normalizeBase(c.base);
    if (!base) return null;
    const url = c.kind === 'gemini' ? base + '/models?pageSize=200' : c.kind === 'anthropic' ? base + '/models?limit=100' : base + '/models';
    const hd = headersFor(c);
    delete hd['content-type'];
    return { url, method: 'GET', headers: hd };
  }
  /** 明显不是对话模型的（嵌入、语音、绘图、审核等）不列出。 */
  const NOT_CHAT = /(embed|embedding|whisper|tts|audio|speech|dall-e|image|moderation|rerank|transcribe|realtime|vision-only|ocr)/i;
  /** 解析模型列表：返回去重、排序后的模型 id；格式不对返回 null。 */
  function parseModels(kind, text) {
    let j;
    try { j = JSON.parse(text); } catch (_) { return null; }
    let ids = [];
    if (kind === 'gemini') {
      if (!isObj(j) || !Array.isArray(j.models)) return null;
      ids = j.models.filter((m) => isObj(m) && (!Array.isArray(m.supportedGenerationMethods) || m.supportedGenerationMethods.includes('generateContent')))
        .map((m) => String(m.name || '').replace(/^models\//, ''));
    } else {
      const arr = isObj(j) && Array.isArray(j.data) ? j.data : isObj(j) && Array.isArray(j.models) ? j.models : Array.isArray(j) ? j : null;
      if (!arr) return null;
      ids = arr.map((m) => (isObj(m) ? String(m.id || m.name || m.model || '') : typeof m === 'string' ? m : ''));
    }
    ids = ids.map((s) => s.trim().slice(0, LIMITS.model)).filter((s) => s && !NOT_CHAT.test(s));
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  }

  /** 对话请求：system + 一条用户消息，要求只回 JSON；温度 0。 */
  function chatRequest(cfg, system, user, opt) {
    const stream = !!(opt && opt.stream);
    const c = normalizeConfig(cfg);
    const base = normalizeBase(c.base);
    if (!base || !c.model) return null;
    const hd = headersFor(c);
    if (c.kind === 'anthropic') {
      return { url: base + '/messages', method: 'POST', headers: hd, body: JSON.stringify(Object.assign({ model: c.model, max_tokens: 8192, temperature: 0, system, messages: [{ role: 'user', content: user }] }, stream ? { stream: true } : {})) };
    }
    if (c.kind === 'gemini') {
      return {
        url: base + '/models/' + encodeURIComponent(c.model) + (stream ? ':streamGenerateContent?alt=sse' : ':generateContent'), method: 'POST', headers: hd,
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0, responseMimeType: 'application/json' } }),
      };
    }
    return { url: base + '/chat/completions', method: 'POST', headers: hd, body: JSON.stringify(Object.assign({ model: c.model, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }, stream ? { stream: true } : {})) };
  }

  /**
   * 流式响应（SSE）解析器：feed(新到的文字) 累计模型的「思考」与「回答」两部分；三种接口格式都支持。
   * 推理模型（如 DeepSeek R1）先长时间输出思考过程，用流式能实时显示进度，连接也不会因长时间无数据被断开。
   * 有的服务把思考放在回答里的 <think>…</think> 中，这部分由 extractJson 去掉。
   * @returns {{feed:(chunk:string)=>void, content:()=>string, reasoning:()=>number, events:()=>number}}
   */
  function createStreamParser(kind) {
    let buf = '';
    let content = '';
    let reasoning = 0;
    let events = 0;
    const take = (j) => {
      if (!isObj(j)) return;
      if (kind === 'anthropic') {
        const d = j.delta;
        if (j.type === 'content_block_delta' && isObj(d)) {
          if (d.type === 'text_delta' && typeof d.text === 'string') content += d.text;
          if (d.type === 'thinking_delta' && typeof d.thinking === 'string') reasoning += d.thinking.length;
        }
        return;
      }
      if (kind === 'gemini') {
        const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
        if (Array.isArray(parts)) for (const p of parts) if (isObj(p) && typeof p.text === 'string') { if (p.thought) reasoning += p.text.length; else content += p.text; }
        return;
      }
      const d = Array.isArray(j.choices) && j.choices[0] && (j.choices[0].delta || j.choices[0].message);
      if (!isObj(d)) return;
      if (typeof d.content === 'string') content += d.content;
      const r = d.reasoning_content || d.reasoning;
      if (typeof r === 'string') reasoning += r.length;
    };
    const line = (ln) => {
      const t = ln.replace(/\r$/, '');
      if (!t.startsWith('data:')) return;
      const data = t.slice(5).trim();
      if (!data || data === '[DONE]') return;
      events++;
      try { take(JSON.parse(data)); } catch (_) { /* 不完整或非 JSON 的行忽略 */ }
    };
    return {
      feed(chunk) {
        buf += String(chunk);
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { line(buf.slice(0, i)); buf = buf.slice(i + 1); }
      },
      /** 流结束：处理最后一行；若服务没走 SSE（直接回了整段 JSON），按普通响应解析。 */
      end() {
        if (buf) { line(buf); buf = ''; }
      },
      content: () => content,
      reasoning: () => reasoning,
      events: () => events,
    };
  }
  /** 从对话响应里取出模型回答的文字；格式不对返回 null。 */
  function parseChat(kind, text) {
    let j;
    try { j = JSON.parse(text); } catch (_) { return null; }
    if (!isObj(j)) return null;
    if (kind === 'anthropic') return Array.isArray(j.content) ? j.content.filter((p) => isObj(p) && p.type === 'text').map((p) => p.text).join('') || null : null;
    if (kind === 'gemini') {
      const parts = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
      return Array.isArray(parts) ? parts.map((p) => (isObj(p) && typeof p.text === 'string' ? p.text : '')).join('') || null : null;
    }
    const m = Array.isArray(j.choices) && j.choices[0] && j.choices[0].message;
    return m && typeof m.content === 'string' ? m.content : null;
  }
  /** 推理 / 思考类模型（回复前会先长时间思考，校对很慢）。 */
  const isReasoningModel = (id) => /(^|[-_/.])(r1|reasoner|reasoning|thinking|think|qwq|o1|o3|o4)([-_/.:]|$)/i.test(String(id || ''));

  /** 服务端返回的错误信息（用于提示）：截短，不含请求内容。 */
  function errorMessage(text) {
    try {
      const j = JSON.parse(text);
      const e = isObj(j) ? (isObj(j.error) ? j.error.message : j.error || j.message) : null;
      if (typeof e === 'string' && e) return e.slice(0, 160);
    } catch (_) { /* 非 JSON */ }
    return '';
  }

  // ---------- 提示词与结果校验 ----------
  /**
   * 系统提示：说明任务、输出格式，并附上标准第 12 章条文与例词（来自 rules.json，不在代码里写规则内容）。
   * @param {{rules:{id:string,title:string,text:string,examples?:string[][]}[]}} rules parseRules 的结果
   */
  function systemPrompt(rules) {
    const seg = (rules && Array.isArray(rules.rules) ? rules.rules : []).filter((r) => /^12\./.test(r.id));
    const lines = seg.map((r) => r.id + ' ' + r.text + (r.examples && r.examples.length ? ' 例：' + r.examples.slice(0, 12).map((e) => e[0] + '（' + e[1] + '）').join('、') : ''));
    return [
      '你是汉语盲文（GF 0019—2018《国家通用盲文方案》）的分词连写与注音校对员。',
      '任务：对给出的每一段汉字，按下面的分词连写规则切分成「连写单位」，并给出每个字的普通话本调拼音。',
      '要求：',
      '1. 连写单位按顺序拼起来必须和原文逐字相同，不增、不删、不改字。',
      '2. 拼音用带调符号的小写字母，一个字一个音节，音节之间用空格分开；轻声不标调；一律写本调，不写变调（「一」永远写 yī，「不」永远写 bù，如「一起」写 yī qǐ、「不要」写 bù yào）；ü 写作 ü。每段的 auto 里括号中是现有读音，没有把握时沿用它。',
      '3. 「的、地、得」作结构助词时读轻声 de；「了、着、过」作动态助词时读轻声。',
      '4. 只输出 JSON，不要任何解释，格式：{"runs":[{"id":"r1","w":[["汉字词","pīn yīn"],…]},…]}，每个输入段都要有对应的 id。',
      '分词连写规则（GF 0019—2018 第 12 章，空格表示分写，音节相连表示连写）：',
      ...lines,
    ].join('\n');
  }
  /** 用户消息：每段一行 JSON（id、原文、当前自动分词供参考）。 */
  function userPrompt(runs, note) {
    return JSON.stringify(Object.assign(note ? { note } : {}, { runs: runs.map((r) => ({ id: r.id, text: r.text, auto: r.auto })) }));
  }

  /** 从模型回答里取出 JSON 对象（允许被 ``` 包住或前后有文字）。 */
  function extractJson(text) {
    if (typeof text !== 'string') return null;
    // 去掉推理模型放在回答里的思考过程（<think>…</think>），再从 "runs" 所在的那个对象开始取
    const s = text.replace(/^﻿/, '').replace(/<think>[\s\S]*?<\/think>/g, '');
    const k = s.indexOf('"runs"');
    const a = k >= 0 ? s.lastIndexOf('{', k) : s.indexOf('{');
    const b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(s.slice(a, b + 1)); } catch (_) { return null; }
  }

  /**
   * 把一句的 token 切成「汉字段」：连续的词 token（k:'w'）为一段；段里有人工改过的词（a:'edited'）就不送去校对，尊重手改。
   * @returns {{id:string, sent:string, start:number, end:number, text:string, auto:string}[]}
   */
  function runsOf(sentId, tokens, prefix) {
    const out = [];
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i].k !== 'w') { i++; continue; }
      let j = i;
      while (j < tokens.length && tokens[j].k === 'w') j++;
      const seg = tokens.slice(i, j);
      if (!seg.some((t) => t.a === 'edited')) {
        out.push({ id: (prefix || 'r') + out.length, sent: sentId, start: i, end: j, text: seg.map((t) => t.c).join(''), auto: seg.map((t) => t.c + '(' + t.p + ')').join(' '), py: seg.map((t) => ({ c: t.c, p: t.p })) });
      }
      i = j;
    }
    return out;
  }
  /** 把所有段分批（每批不超过 batchChars 字 / batchRuns 段）。 */
  function batches(runs) {
    const out = [];
    let cur = [];
    let n = 0;
    for (const r of runs) {
      const len = Array.from(r.text).length;
      if (cur.length && (n + len > LIMITS.batchChars || cur.length >= LIMITS.batchRuns)) { out.push(cur); cur = []; n = 0; }
      cur.push(r); n += len;
    }
    if (cur.length) out.push(cur);
    return out;
  }

  /** 模型常见的拼音写法差异：数字调（zhong1）→ 调号；v / u: → ü。不认识的原样返回，交给解析器判定。 */
  const MARKS = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', 'ü': 'ǖǘǚǜ' };
  function normalizeSyllable(raw) {
    let s = String(raw).normalize('NFC').toLowerCase().trim().replace(/u:/g, 'ü');
    s = s.replace(/^([ln])v/, '$1ü').replace(/v/g, 'ü');
    const m = /^([a-zü]+)([0-5])$/.exec(s);
    if (!m) return s;
    const [base, tone] = [m[1], Number(m[2])];
    if (tone === 0 || tone === 5) return base;
    // 调号位置：有 a / e 标在它上面；ou 标 o；否则标最后一个元音
    let at = base.search(/[ae]/);
    if (at < 0) at = base.indexOf('ou');
    if (at < 0) { for (let q = base.length - 1; q >= 0; q--) if ('iouü'.includes(base[q])) { at = q; break; } }
    if (at < 0) return s;
    return base.slice(0, at) + MARKS[base[at]][tone - 1] + base.slice(at + 1);
  }

  /**
   * 校验模型给某一段的结果，合格则返回新的词 token（a:'ai'），否则返回不合格的原因（便于提示和重试）。
   * reason：missing 没给这一段 / format 格式不对 / chars 字与原文不一致 / syllables 音节数与字数不符 / pinyin 拼音无法解析
   * @param {{text:string}} run
   * @param {*} words 模型给的 [["词","pin yin"],…]
   * @param {(pinyin:string, o:{chars:string})=>{ok:boolean, words?:object[]}} parse 拼音解析（translator.parse）
   * @returns {{ok:true, tokens:object[]}|{ok:false, reason:string, detail?:string}}
   */
  function checkRun(run, words, parse) {
    if (words == null) return { ok: false, reason: 'missing' };
    if (!Array.isArray(words) || !words.length || words.length > 200) return { ok: false, reason: 'format' };
    const out = [];
    let joined = '';
    for (const w of words) {
      if (!Array.isArray(w) || typeof w[0] !== 'string' || typeof w[1] !== 'string') return { ok: false, reason: 'format' };
      const chars = w[0].replace(/\s+/g, '');
      if (!/^[\u3400-\u9fff\uf900-\ufaff]+$/.test(chars)) return { ok: false, reason: 'chars', detail: chars };
      const syl = w[1].split(/[\s'’\-]+/).filter(Boolean).map(normalizeSyllable);
      if (syl.length !== Array.from(chars).length) return { ok: false, reason: 'syllables', detail: chars + ' ' + w[1] };
      const p = joinSyllables(syl);
      let r;
      try { r = parse(p, { chars }); } catch (_) { r = null; }
      if (!r || !r.ok || !Array.isArray(r.words) || r.words.length !== 1 || r.words[0].syllables.length !== syl.length) return { ok: false, reason: 'pinyin', detail: chars + ' ' + w[1] };
      joined += chars;
      out.push({ k: 'w', c: chars, p, a: 'ai' });
    }
    return joined === run.text ? { ok: true, tokens: out } : { ok: false, reason: 'chars', detail: joined };
  }
  /**
   * 「一、不」只写本调（10.1.2 变调音节标本调）：模型常按口语变调写成 yì / bú。
   * 若 AI 给的某个「一 / 不」与原标注只差声调，就改回原标注的读音（声调不同会改变盲文：yī 省写、yì 照写）。
   * @param {object[]} tokens checkRun 通过的 token
   * @param {{py?:{c:string,p:string}[]}} run
   */
  const SANDHI = new Set(['一', '不']);
  function keepBaseTone(tokens, run, parse) {
    if (!run.py || !run.py.length) return tokens;
    const orig = [];
    for (const t of run.py) {
      let r;
      try { r = parse(t.p.replace(/!/g, ''), { chars: t.c }); } catch (_) { r = null; }
      const syl = r && r.ok ? r.words.flatMap((w) => w.syllables) : null;
      if (!syl || syl.length !== Array.from(t.c).length) return tokens;
      Array.from(t.c).forEach((ch, k) => orig.push({ ch, raw: syl[k].raw, plain: syl[k].plain, tone: syl[k].tone }));
    }
    let at = 0;
    return tokens.map((t) => {
      const chars = Array.from(t.c);
      let r;
      try { r = parse(t.p, { chars: t.c }); } catch (_) { r = null; }
      const syl = r && r.ok ? r.words.flatMap((w) => w.syllables) : null;
      if (!syl || syl.length !== chars.length) { at += chars.length; return t; }
      let changed = false;
      const raws = syl.map((s, k) => {
        const o = orig[at + k];
        if (o && SANDHI.has(chars[k]) && o.ch === chars[k] && o.plain === s.plain && o.tone !== s.tone) { changed = true; return o.raw; }
        return s.raw;
      });
      at += chars.length;
      return changed ? Object.assign({}, t, { p: joinSyllables(raws) }) : t;
    });
  }

  /** 同 checkRun，只返回 token 或 null。 */
  function validateRun(run, words, parse) {
    const r = checkRun(run, words, parse);
    return r.ok ? r.tokens : null;
  }

  /**
   * 把校验过的结果写回一句的 token：返回新的 token 数组和改动的段数（结果与原来相同的段不算改动）。
   * @param {object[]} tokens
   * @param {{start:number, end:number, tokens:object[]}[]} fixes 同一句里的段（按 start 升序，互不重叠）
   */
  function applyRuns(tokens, fixes) {
    const sorted = fixes.slice().sort((a, b) => b.start - a.start);
    const out = tokens.slice();
    let changed = 0;
    for (const f of sorted) {
      const old = out.slice(f.start, f.end);
      const same = old.length === f.tokens.length && old.every((t, k) => t.c === f.tokens[k].c && t.p === f.tokens[k].p);
      if (same) continue;
      out.splice(f.start, f.end - f.start, ...f.tokens);
      changed++;
    }
    return { tokens: out, changed };
  }

  return {
    KINDS, PRESETS, LIMITS, presetOf, isLocalHost, normalizeBase, normalizeConfig, ready,
    modelsRequest, parseModels, chatRequest, createStreamParser, parseChat, errorMessage, isReasoningModel,
    systemPrompt, userPrompt, extractJson, runsOf, batches, checkRun, validateRun, keepBaseTone, normalizeSyllable, applyRuns,
  };
});
