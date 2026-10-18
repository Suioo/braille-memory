/**
 * 记录导出 / 导入 / 撤销（纯逻辑，不碰 DOM 和平台）。
 * 导出文件 = { app, kind, format, exportedAt, appVersion, progress, texts? }，progress 即完整存档（含设置），texts 是自定义文本库（可选）。
 * format 1 = 只有 progress；format 2 = 可带 texts。导入两种都接受；文件里没有 texts 时不动现有文本。
 * 导入只接受本应用导出的文件；记录交给 normalizeProgress 清洗（字表签名不符的记录丢弃），盲文点位从不经过导入。
 * 渲染进程：window.BMBackup；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./progress.js'));
  else root.BMBackup = factory(root.BMProgress);
})(typeof self !== 'undefined' ? self : this, function (P) {
  'use strict';

  const APP = 'braille-memory';
  const KIND = 'progress-export';
  const FORMAT = 2;
  const MIN_FORMAT = 1;
  /** 导入文件大小上限（字符数）：正常存档远小于此。 */
  const MAX_CHARS = 2 * 1024 * 1024;

  /**
   * @param {object} progress 当前存档
   * @param {string} [appVersion]
   * @param {Date} [now]
   * @param {object|null} [texts] 自定义文本库（已清洗的 store）；省略 = 文件里不带 texts
   * @returns {string} 导出文件文本
   */
  function buildExport(progress, appVersion, now, texts) {
    const doc = {
      app: APP,
      kind: KIND,
      format: FORMAT,
      exportedAt: (now || new Date()).toISOString(),
      appVersion: String(appVersion || ''),
      progress: JSON.parse(JSON.stringify(progress)),
    };
    if (texts) doc.texts = JSON.parse(JSON.stringify(texts));
    return JSON.stringify(doc, null, 1);
  }

  /** 默认文件名：braille-memory-YYYYMMDD.json（ASCII，避免个别环境下中文文件名被丢弃） */
  function defaultFileName(now) {
    const d = now || new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    return 'braille-memory-' + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + '.json';
  }

  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const countKeys = (v) => (isObj(v) ? Object.keys(v).length : 0);
  const countEntries = (p) => countKeys(p.symbols) + countKeys(p.lessons) + countKeys(p.ext && p.ext.symbols) + countKeys(p.rules && p.rules.items) + countKeys(p.texts && p.texts.items);

  /**
   * 校验并清洗导入文本。不修改任何现有数据。
   * textsApi = { normalize(raw)→{ok, store, dropped}|{ok:false, reason}, entries(store)→{key,sig}[]|undefined, current: 现有文本库 }
   *   （entries 返回 undefined = 没有引擎 / 文本库不可用，已有记录原样保留）
   * @returns {{ok:true, progress:object, imported:number, skipped:number, texts:object|null, textCount:number|null}
   *          | {ok:false, reason:'empty'|'size'|'json'|'format'|'version'|'limit'}}
   *   imported / skipped 的单位是「项」（符号、课程、扩展、规则、文本句子记录）；texts 为 null = 文件里没有文本库，现有文本不动。
   */
  function parseImport(text, rows, plan, cfg, categories, extraRows, ruleEntries, textsApi) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
    if (text.length > MAX_CHARS) return { ok: false, reason: 'size' };
    let doc;
    try { doc = JSON.parse(text); } catch (_) { return { ok: false, reason: 'json' }; }
    if (!isObj(doc) || doc.app !== APP || doc.kind !== KIND || !isObj(doc.progress)) return { ok: false, reason: 'format' };
    const v = doc.progress.version;
    if (!Number.isInteger(doc.format) || doc.format < MIN_FORMAT || doc.format > FORMAT || !Number.isInteger(v) || v < P.MIN_VERSION || v > P.VERSION) return { ok: false, reason: 'version' };
    let texts = null;
    if (doc.texts !== undefined) {
      if (!textsApi) return { ok: false, reason: 'format' };
      const n = textsApi.normalize(doc.texts);
      if (!n.ok) return { ok: false, reason: n.reason === 'limit' ? 'limit' : 'format' };
      texts = n.store;
    }
    const final = texts || (textsApi ? textsApi.current : null);
    const textEntries = textsApi && final ? textsApi.entries(final) : undefined;
    const progress = P.normalizeProgress(doc.progress, rows, plan, cfg, categories, extraRows, ruleEntries, textEntries); // 旧版本在这里迁移到当前版本
    const total = countEntries(doc.progress);
    const imported = countEntries(progress);
    return { ok: true, progress, imported, skipped: Math.max(0, total - imported), texts, textCount: texts ? texts.texts.length : null };
  }

  const isBundle = (o) => isObj(o) && o.kind === 'bundle' && isObj(o.progress);

  /**
   * 覆盖当前记录：先备份当前记录，再写入新记录；写入失败则自动恢复。
   * 旧调用：current / next 是 progress，io = { saveBackup, saveProgress }。
   * 新调用：current = {kind:'bundle', progress, texts}（现状），next = {kind:'bundle', progress, texts|null}（texts 为 null = 不动文本），
   *         io 另有 saveTexts(store)。备份里记下 textsReplaced，撤销时才还原文本。
   * @returns {Promise<{ok:true} | {ok:false, reason:'backup'|'save'}>}
   */
  async function applyImport(current, next, io) {
    const bundle = isBundle(next);
    const replaceTexts = bundle && next.texts != null;
    let ok = false;
    try { ok = !!(await io.saveBackup(bundle ? Object.assign({}, current, { kind: 'bundle', textsReplaced: replaceTexts }) : current)); } catch (_) { ok = false; }
    if (!ok) return { ok: false, reason: 'backup' };
    const restore = async () => {
      try { await io.saveProgress(bundle ? current.progress : current); } catch (_) { /* 原记录仍在内存中，下次保存会再写 */ }
      if (replaceTexts) { try { await io.saveTexts(current.texts); } catch (_) { /* 同上 */ } }
    };
    try { ok = !!(await io.saveProgress(bundle ? next.progress : next)); } catch (_) { ok = false; }
    if (ok && replaceTexts) { try { ok = !!(await io.saveTexts(next.texts)); } catch (_) { ok = false; } }
    if (!ok) { await restore(); return { ok: false, reason: 'save' }; }
    return { ok: true };
  }

  /**
   * 撤销最近一次导入：把备份写回存档（备份是 bundle 且当时替换过文本库时，文本库一并写回），成功后清除备份。
   * io = { loadBackup()→object|null, saveProgress(data)→bool, saveTexts(store)→bool, clearBackup() }
   * @returns {Promise<{ok:true, data:object, texts?:object} | {ok:false, reason:'none'|'save'}>}
   */
  async function undoImport(io) {
    let data = null;
    try { data = await io.loadBackup(); } catch (_) { data = null; }
    if (!isObj(data)) return { ok: false, reason: 'none' };
    const bundle = isBundle(data);
    const progress = bundle ? data.progress : data;
    const restoreTexts = bundle && data.textsReplaced === true && data.texts != null;
    let ok = false;
    try { ok = !!(await io.saveProgress(progress)); } catch (_) { ok = false; }
    if (ok && restoreTexts) { try { ok = !!(await io.saveTexts(data.texts)); } catch (_) { ok = false; } }
    if (!ok) return { ok: false, reason: 'save' };
    try { await io.clearBackup(); } catch (_) { /* 备份残留无害，下次导入会覆盖 */ }
    return restoreTexts ? { ok: true, data: progress, texts: data.texts } : { ok: true, data: progress };
  }

  return { APP, KIND, FORMAT, MIN_FORMAT, MAX_CHARS, buildExport, defaultFileName, parseImport, applyImport, undoImport };
});
