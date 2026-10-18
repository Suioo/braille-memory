/**
 * Web / Capacitor 存档：localStorage，与 Electron 的 progress.json 同一 JSON 结构。
 * - 近似原子写入：先写 <key>.tmp，再写 <key>，最后删 .tmp；读时若主键缺失而 .tmp 在，则用 .tmp 恢复。
 * - 损坏：原文另存到 <key>.corrupt（已有则加时间戳），删除主键，按空进度开始。
 * storage 由调用方注入（测试用假 localStorage）。
 * 渲染进程：window.BMWebStore；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMWebStore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_KEY = 'braille-memory.progress';

  class WebStore {
    /**
     * @param {{getItem:Function, setItem:Function, removeItem:Function}} storage
     * @param {string} [key]
     * @param {() => number} [now] 时间戳（测试可注入）
     */
    constructor(storage, key, now) {
      this.storage = storage;
      this.key = key || DEFAULT_KEY;
      this.tmpKey = this.key + '.tmp';
      this.now = now || (() => Date.now());
    }

    /** @returns {{status:'ok'|'empty'|'corrupt', data:object|null, backup?:string, recovered?:boolean}} */
    load() {
      let text = this.storage.getItem(this.key);
      let recovered = false;
      if (text == null) {
        const tmp = this.storage.getItem(this.tmpKey);
        if (tmp == null) return { status: 'empty', data: null };
        text = tmp;
        recovered = true;
      }
      try {
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not object');
        if (recovered) { this.storage.setItem(this.key, text); this.storage.removeItem(this.tmpKey); }
        return recovered ? { status: 'ok', data, recovered: true } : { status: 'ok', data };
      } catch (_) {
        let backup = this.key + '.corrupt';
        if (this.storage.getItem(backup) != null) backup = this.key + '.' + this.now() + '.corrupt';
        this.storage.setItem(backup, text);
        this.storage.removeItem(this.key);
        this.storage.removeItem(this.tmpKey);
        return { status: 'corrupt', data: null, backup };
      }
    }

    /** @param {object} data */
    save(data) {
      const text = JSON.stringify(data);
      this.storage.setItem(this.tmpKey, text);
      this.storage.setItem(this.key, text);
      this.storage.removeItem(this.tmpKey);
    }
  }

  return { WebStore, DEFAULT_KEY };
});
