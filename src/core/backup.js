/**
 * 记录导出 / 导入 / 撤销（纯逻辑，不碰 DOM 和平台）。
 * 导出文件 = { app, kind, format, exportedAt, appVersion, progress }，progress 即完整存档（含设置）。
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
  const FORMAT = 1;
  /** 导入文件大小上限（字符数）：正常存档远小于此。 */
  const MAX_CHARS = 2 * 1024 * 1024;

  /**
   * @param {object} progress 当前存档
   * @param {string} [appVersion]
   * @param {Date} [now]
   * @returns {string} 导出文件文本
   */
  function buildExport(progress, appVersion, now) {
    const doc = {
      app: APP,
      kind: KIND,
      format: FORMAT,
      exportedAt: (now || new Date()).toISOString(),
      appVersion: String(appVersion || ''),
      progress: JSON.parse(JSON.stringify(progress)),
    };
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
  const countEntries = (p) => countKeys(p.symbols) + countKeys(p.lessons) + countKeys(p.ext && p.ext.symbols);

  /**
   * 校验并清洗导入文本。不修改任何现有数据。
   * @returns {{ok:true, progress:object, imported:number, skipped:number} | {ok:false, reason:'empty'|'size'|'json'|'format'|'version'}}
   *   imported / skipped 的单位是「项」（符号记录 + 课程记录）。
   */
  function parseImport(text, rows, plan, cfg, categories, extraRows) {
    if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: 'empty' };
    if (text.length > MAX_CHARS) return { ok: false, reason: 'size' };
    let doc;
    try { doc = JSON.parse(text); } catch (_) { return { ok: false, reason: 'json' }; }
    if (!isObj(doc) || doc.app !== APP || doc.kind !== KIND || !isObj(doc.progress)) return { ok: false, reason: 'format' };
    const v = doc.progress.version;
    if (doc.format !== FORMAT || !Number.isInteger(v) || v < P.MIN_VERSION || v > P.VERSION) return { ok: false, reason: 'version' };
    const progress = P.normalizeProgress(doc.progress, rows, plan, cfg, categories, extraRows); // 旧版本（v1）在这里迁移到当前版本
    const total = countEntries(doc.progress);
    const imported = countEntries(progress);
    return { ok: true, progress, imported, skipped: Math.max(0, total - imported) };
  }

  /**
   * 覆盖当前记录：先备份当前记录，再写入新记录；写入失败则自动恢复。
   * io = { saveBackup(data)→bool, saveProgress(data)→bool }（均可异步）
   * @returns {Promise<{ok:true} | {ok:false, reason:'backup'|'save'}>}
   */
  async function applyImport(current, next, io) {
    let ok = false;
    try { ok = !!(await io.saveBackup(current)); } catch (_) { ok = false; }
    if (!ok) return { ok: false, reason: 'backup' };
    try { ok = !!(await io.saveProgress(next)); } catch (_) { ok = false; }
    if (!ok) {
      try { await io.saveProgress(current); } catch (_) { /* 原记录仍在内存中，下次保存会再写 */ }
      return { ok: false, reason: 'save' };
    }
    return { ok: true };
  }

  /**
   * 撤销最近一次导入：把备份写回存档，成功后清除备份。
   * io = { loadBackup()→object|null, saveProgress(data)→bool, clearBackup() }
   * @returns {Promise<{ok:true, data:object} | {ok:false, reason:'none'|'save'}>}
   */
  async function undoImport(io) {
    let data = null;
    try { data = await io.loadBackup(); } catch (_) { data = null; }
    if (!isObj(data)) return { ok: false, reason: 'none' };
    let ok = false;
    try { ok = !!(await io.saveProgress(data)); } catch (_) { ok = false; }
    if (!ok) return { ok: false, reason: 'save' };
    try { await io.clearBackup(); } catch (_) { /* 备份残留无害，下次导入会覆盖 */ }
    return { ok: true, data };
  }

  return { APP, KIND, FORMAT, MAX_CHARS, buildExport, defaultFileName, parseImport, applyImport, undoImport };
});
