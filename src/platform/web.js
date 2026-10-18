/**
 * 平台适配（Web / Capacitor）：在没有 Electron preload（window.bm）时提供同一套 API。
 * - boot：fetch 打包进 www 的 data/braille_table.csv 与 data/config.json，按同一规则解析校验；
 *   存档从 localStorage 读（BMWebStore）。
 * - setTheme：没有 nativeTheme，改为强制页面深浅色（BMTheme.setMode）；Android 上同步系统栏图标深浅。
 * - 截图相关 API 为空操作。
 * 页面代码不区分平台，只调用 window.bm。
 */
(function (root) {
  'use strict';
  if (root.bm) return; // Electron：preload 已提供

  const THEMES = ['system', 'light', 'dark'];
  let themeSource = 'system';
  let store = null;
  try { store = new root.BMWebStore.WebStore(root.localStorage); } catch (_) { store = null; }

  /** Capacitor 原生桥（无插件包；SystemBars 为 core 自带）。 */
  function nativeCall(plugin, method, options) {
    const cap = root.Capacitor;
    try {
      if (cap && typeof cap.nativePromise === 'function') return cap.nativePromise(plugin, method, options).catch(() => {});
    } catch (_) { /* 非原生环境 */ }
    return Promise.resolve();
  }
  /** 系统栏图标：深色界面用浅色图标（SystemBars 的 DARK 样式），反之亦然。 */
  function syncSystemBars() {
    const dark = root.BMTheme ? root.BMTheme.isDark() : false;
    nativeCall('SystemBars', 'setStyle', { style: dark ? 'DARK' : 'LIGHT' });
  }

  async function fetchText(path) {
    const res = await fetch(path, { cache: 'no-store' });
    if (!res.ok) throw new Error(path + ' ' + res.status);
    return res.text();
  }

  root.bm = {
    platform: 'web',
    async boot() {
      let table;
      try {
        const res = root.BMCsv.parseTable(await fetchText('data/braille_table.csv'));
        if (res.errors.length) table = { ok: false, rows: [], errors: res.errors };
        else if (!res.rows.length) table = { ok: false, rows: [], errors: ['empty'] };
        else table = { ok: true, rows: res.rows, errors: [] };
      } catch (e) {
        table = { ok: false, rows: [], errors: ['read:' + e.message] };
      }
      let raw = null;
      try { raw = JSON.parse(await fetchText('data/config.json')); } catch (_) { raw = null; }
      const config = root.BMConfig.mergeConfig(raw).config;
      let saved = { status: 'empty', data: null };
      try { if (store) saved = store.load(); } catch (_) { saved = { status: 'empty', data: null }; }
      const t = saved.data && saved.data.settings && saved.data.settings.theme;
      if (THEMES.includes(t)) { themeSource = t; if (root.BMTheme) root.BMTheme.setMode(t); }
      syncSystemBars();
      let version = '';
      try { version = JSON.parse(await fetchText('version.json')).version || ''; } catch (_) { version = ''; }
      let contact = null;
      try { contact = JSON.parse(await fetchText('contact.json')); } catch (_) { contact = null; }
      return { shot: null, version, contact, table, config, progress: saved.data, storeStatus: saved.status, themeSource, seed: null };
    },
    async saveProgress(data) {
      if (!store || !data || typeof data !== 'object') return false;
      try { store.save(data); return true; } catch (_) { return false; }
    },
    async setTheme(source) {
      if (!THEMES.includes(source)) return themeSource;
      themeSource = source;
      if (root.BMTheme) root.BMTheme.setMode(source);
      syncSystemBars();
      return source;
    },
    shotReady() {},
    shotPages() {},
    onShotShow() {},
    /** 主题变化（系统或手动）后同步系统栏。 */
    syncSystemBars,
  };
})(typeof self !== 'undefined' ? self : this);
