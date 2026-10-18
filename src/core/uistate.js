/**
 * 界面偏好（折叠状态等）：只存在本机，不进存档、不导出。纯函数 + 可注入的 storage。
 * 渲染进程：window.BMUiState；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMUiState = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'braille-memory.ui';
  /** 「我的」页的设置分组（AI 在对应阶段才出现）。 */
  const GROUPS = ['look', 'practice', 'data', 'ai', 'about'];
  /** 默认只展开常用的一组。 */
  const DEFAULT_OPEN = { practice: true };

  /** 清洗读入的偏好：未知分组丢弃，非布尔值用默认。 */
  function normalize(raw) {
    const g = raw && typeof raw === 'object' && raw.groups && typeof raw.groups === 'object' ? raw.groups : {};
    const groups = {};
    for (const id of GROUPS) groups[id] = typeof g[id] === 'boolean' ? g[id] : !!DEFAULT_OPEN[id];
    return { version: 1, groups };
  }

  /**
   * @param {{getItem:Function, setItem:Function}|null} storage 缺失 / 抛错时一律回到默认值，页面照常可用
   * @param {string} [key]
   */
  function createStore(storage, key) {
    const k = key || KEY;
    const load = () => {
      try { return normalize(JSON.parse(storage.getItem(k))); } catch (_) { return normalize(null); }
    };
    return {
      load,
      /** 某组是否展开。 */
      isOpen(group) { return load().groups[group] === true; },
      /** 记下某组的展开 / 折叠。返回是否写成功（失败不影响当前页面）。 */
      set(group, open) {
        if (!GROUPS.includes(group)) return false;
        const s = load();
        s.groups[group] = !!open;
        try { storage.setItem(k, JSON.stringify(s)); return true; } catch (_) { return false; }
      },
    };
  }

  return { KEY, GROUPS, DEFAULT_OPEN, normalize, createStore };
});
