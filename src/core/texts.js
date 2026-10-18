/**
 * 自定义文本库（纯逻辑）：数据结构、校验、限额、.txt 解码、由文本推出练习题目。
 * 文本只存在本机（texts 存储，不放进 progress），练习进度在 progress.texts；导出 / 导入一并带上。
 *
 * store = { version: 1, texts: [ { id, title, source:'paste'|'file'|'ai', created, updated,
 *             sentences: [ { id, raw, tokens: [annotate.js 的 token] } ] } ] }
 * 渲染进程：window.BMTexts；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./annotate.js'));
  else root.BMTexts = factory(root.BMAnnotate);
})(typeof self !== 'undefined' ? self : this, function (A) {
  'use strict';

  const LIMITS = {
    fileBytes: 200 * 1024,   // .txt 文件
    textChars: 20000,        // 单篇字数
    texts: 50,               // 篇数
    storeChars: 1500000,     // 存储 JSON 总长
    title: 40,
    sentenceChars: 400,      // 载入时单句字数上限（防畸形数据）
    tokensPerSentence: 400,
  };
  const SOURCES = ['paste', 'file', 'ai'];
  const SIG_PREFIX = 't:';

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const emptyStore = () => ({ version: 1, texts: [] });
  const clean = (s, max) => String(s).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);
  const countChars = (s) => Array.from(String(s)).length;

  /** 清洗一个 token；非法返回 null。 */
  function normToken(t) {
    if (!isObj(t)) return null;
    if (t.k === 'w') {
      if (typeof t.c !== 'string' || !/^[\u3400-\u9fff\uf900-\ufaff]+$/.test(t.c) || countChars(t.c) > 30 || typeof t.p !== 'string' || !t.p || t.p.length > 120) return null;
      return { k: 'w', c: t.c, p: clean(t.p, 120), a: ['auto', 'edited', 'ai'].includes(t.a) ? t.a : 'auto' };
    }
    if (t.k === 'u') return typeof t.c === 'string' && t.c && countChars(t.c) <= 2 ? { k: 'u', c: t.c } : null;
    if (t.k === 'n') return typeof t.c === 'string' && /^[0-9]{1,30}$/.test(t.c) ? { k: 'n', c: t.c } : null;
    if (t.k === 'b') return { k: 'b' };
    if (t.k === 'x') {
      if (typeof t.c !== 'string' || !t.c || t.c.length > 200) return null;
      const o = { k: 'x', c: clean(t.c, 200) };
      if (t.skip === true) o.skip = true;
      return o;
    }
    return null;
  }

  /**
   * 清洗读入 / 导入的文本库：非法的 token / 句 / 文本被丢弃（计数返回）；超出限额返回 {ok:false, reason:'limit'}。
   * @returns {{ok:true, store:object, dropped:number}|{ok:false, reason:'format'|'limit'}}
   */
  function normalizeStore(raw) {
    if (raw == null) return { ok: true, store: emptyStore(), dropped: 0 };
    if (!isObj(raw) || !Array.isArray(raw.texts)) return { ok: false, reason: 'format' };
    if (raw.texts.length > LIMITS.texts) return { ok: false, reason: 'limit' };
    const store = emptyStore();
    const ids = new Set();
    let dropped = 0;
    for (const t of raw.texts) {
      if (!isObj(t) || typeof t.id !== 'string' || !/^t_[0-9a-z]{3,12}$/.test(t.id) || ids.has(t.id) || !Array.isArray(t.sentences)) { dropped++; continue; }
      const sids = new Set();
      const sentences = [];
      for (const s of t.sentences) {
        if (!isObj(s) || typeof s.id !== 'string' || !/^s[0-9]{1,6}$/.test(s.id) || sids.has(s.id) || typeof s.raw !== 'string' || s.raw.length > LIMITS.sentenceChars || !Array.isArray(s.tokens) || s.tokens.length > LIMITS.tokensPerSentence) { dropped++; continue; }
        const tokens = s.tokens.map(normToken);
        if (tokens.some((x) => !x)) { dropped++; continue; }
        sids.add(s.id);
        sentences.push({ id: s.id, raw: clean(s.raw, LIMITS.sentenceChars), tokens });
      }
      ids.add(t.id);
      store.texts.push({
        id: t.id, title: clean(typeof t.title === 'string' ? t.title : '', LIMITS.title) || t.id, source: SOURCES.includes(t.source) ? t.source : 'paste',
        created: typeof t.created === 'string' ? t.created.slice(0, 40) : '', updated: typeof t.updated === 'string' ? t.updated.slice(0, 40) : '', sentences,
      });
    }
    if (JSON.stringify(store).length > LIMITS.storeChars) return { ok: false, reason: 'limit' };
    return { ok: true, store, dropped };
  }

  const sizeOf = (store) => JSON.stringify(store).length;

  /** 新文本 id：t_ + 5 位小写字母数字，不与现有重复。 */
  function newId(store, rng) {
    const have = new Set(store.texts.map((t) => t.id));
    for (let n = 0; n < 50; n++) {
      let s = 't_';
      for (let i = 0; i < 5; i++) s += '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rng() * 36)];
      if (!have.has(s)) return s;
    }
    return 't_' + Date.now().toString(36).slice(-6);
  }

  /**
   * 由原文生成一篇文本（切句 + 标注）。不修改传入的 store。
   * @param {{title?:string, raw:string, source?:string, now?:string, rng:()=>number, map:object, provider:object}} o
   * @returns {{ok:true, text:object}|{ok:false, reason:'empty'|'too-long'|'too-many'|'store-size'|'provider', detail?:string}}
   */
  function createText(store, o) {
    const raw = String(o.raw == null ? '' : o.raw).replace(/^﻿/, '');
    if (!raw.trim()) return { ok: false, reason: 'empty' };
    if (countChars(raw) > LIMITS.textChars) return { ok: false, reason: 'too-long' };
    if (store.texts.length >= LIMITS.texts) return { ok: false, reason: 'too-many' };
    const sentences = [];
    let n = 0;
    for (const s of A.splitSentences(raw)) {
      const tk = A.tokenize(s, { map: o.map, provider: o.provider });
      if (!tk.ok) return { ok: false, reason: 'provider', detail: tk.detail };
      if (!tk.tokens.length) continue;
      sentences.push({ id: 's' + (++n), raw: s, tokens: tk.tokens });
    }
    if (!sentences.length) return { ok: false, reason: 'empty' };
    const now = o.now || new Date().toISOString();
    const title = clean(o.title || '', LIMITS.title).trim() || Array.from(raw.trim()).slice(0, 12).join('');
    const text = { id: newId(store, o.rng), title, source: SOURCES.includes(o.source) ? o.source : 'paste', created: now, updated: now, sentences };
    if (sizeOf({ version: 1, texts: store.texts.concat([text]) }) > LIMITS.storeChars) return { ok: false, reason: 'store-size' };
    return { ok: true, text };
  }

  const addText = (store, text) => ({ version: 1, texts: store.texts.concat([text]) });
  const removeText = (store, id) => ({ version: 1, texts: store.texts.filter((t) => t.id !== id) });

  /** 替换某句的 token（人工编辑后）；返回新 store，找不到返回 null。 */
  function updateSentence(store, textId, sentenceId, tokens, now) {
    const norm = tokens.map(normToken);
    if (norm.some((x) => !x) || norm.length > LIMITS.tokensPerSentence) return null;
    let hit = false;
    const texts = store.texts.map((t) => {
      if (t.id !== textId) return t;
      return Object.assign({}, t, { updated: now || t.updated, sentences: t.sentences.map((s) => {
        if (s.id !== sentenceId) return s;
        hit = true;
        return Object.assign({}, s, { tokens: norm });
      }) });
    });
    return hit ? { version: 1, texts } : null;
  }

  /**
   * .txt 解码：严格 UTF-8（不是就拒绝，不乱码继续）、去 BOM、限制大小、拒绝二进制。
   * @param {Uint8Array|ArrayBuffer} bytes
   * @returns {{ok:true, text:string}|{ok:false, reason:'size'|'utf8'|'binary'|'empty'}}
   */
  function decodeUtf8(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.byteLength > LIMITS.fileBytes) return { ok: false, reason: 'size' };
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (_) { return { ok: false, reason: 'utf8' }; }
    text = text.replace(/^﻿/, '');
    if (/\u0000/.test(text)) return { ok: false, reason: 'binary' };
    if (!text.trim()) return { ok: false, reason: 'empty' };
    return { ok: true, text };
  }

  /**
   * 由文本库推出练习题目（每句一题：翻盲文）。能练习的句子才有题目；其余句子给出逐处问题（issues）。
   * @param {object} store
   * @param {object} translator createTranslator 的结果
   * @returns {{items:object[], entries:{key:string,sig:string}[], byKey:Map, status:Map<string,object>, texts:{id:string, title:string, total:number, ready:number}[]}}
   */
  function buildItems(store, translator) {
    const items = [];
    const status = new Map();
    const texts = [];
    for (const t of store.texts) {
      let ready = 0;
      for (const s of t.sentences) {
        const key = SIG_PREFIX + t.id + '#' + s.id;
        const st = A.check(s.tokens, translator);
        status.set(key, st);
        if (!st.ok) continue;
        ready++;
        const cells = st.result.cells.map((c) => c.dots.slice());
        const cellsText = A.cellsKey(cells);
        const canon = s.tokens.map((x) => [x.k, x.c || '', x.p || '', x.skip ? 1 : 0].join('\u0001')).join('\u0002');
        items.push({
          id: key, key, textId: t.id, sentenceId: s.id, ruleId: null, chars: s.raw, pinyin: A.pinyinLine(s.tokens), display: A.pinyinLine(s.tokens), note: '',
          result: st.result, cells, cellsText, sig: A.hash(canon + '|' + cellsText),
        });
      }
      texts.push({ id: t.id, title: t.title, total: t.sentences.length, ready });
    }
    return { items, entries: items.map((x) => ({ key: x.key, sig: x.sig })), byKey: new Map(items.map((x) => [x.key, x])), status, texts };
  }

  return { LIMITS, SOURCES, emptyStore, normalizeStore, sizeOf, newId, createText, addText, removeText, updateSentence, decodeUtf8, buildItems };
});
