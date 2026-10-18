/**
 * 平台适配（Web / Capacitor）：在没有 Electron preload（window.bm）时提供同一套 API。
 * - boot：fetch 打包进 www 的 data/braille_table.csv 与 data/config.json，按同一规则解析校验；
 *   存档从 localStorage 读（BMWebStore）。
 * - setTheme：没有 nativeTheme，改为强制页面深浅色（BMTheme.setMode）；Android 上同步系统栏图标深浅。
 * - 记录导出 / 导入 / 撤销备份：Android 用 Filesystem 写缓存文件再交给 Share；浏览器用 Blob 下载 / 文件选择；
 *   撤销备份存在单独的 localStorage 键。
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
  /** 同 nativeCall，但把失败抛给调用方（导出要知道是否成功）。 */
  function nativeInvoke(plugin, method, options) {
    const cap = root.Capacitor;
    if (!cap || typeof cap.nativePromise !== 'function' || typeof cap.isNativePlatform !== 'function' || !cap.isNativePlatform()) {
      return Promise.reject(new Error('no native'));
    }
    return cap.nativePromise(plugin, method, options);
  }
  const isNative = () => { try { return !!(root.Capacitor && root.Capacitor.isNativePlatform()); } catch (_) { return false; } };
  const maxChars = () => (root.BMBackup ? root.BMBackup.MAX_CHARS : 2 * 1024 * 1024);
  let textsStore = null;
  try { textsStore = new root.BMWebStore.WebStore(root.localStorage, 'braille-memory.texts'); } catch (_) { textsStore = null; }
  let backupStore = null;
  try { backupStore = new root.BMWebStore.WebStore(root.localStorage, 'braille-memory.progress.backup'); } catch (_) { backupStore = null; }

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
      let extra;
      try { extra = root.BMCsv.loadExtra(await fetchText('data/braille_extra.csv'), table.rows); } catch (_) { extra = root.BMCsv.loadExtra(null, table.rows); }
      // 规则数据与拼音还原表（可缺失：缺失时规则相关入口隐藏）；text 只在通过校验时带上
      let rulesText = null;
      let mapText = null;
      try { rulesText = await fetchText('data/rules.json'); } catch (_) { rulesText = null; }
      try { mapText = await fetchText('data/pinyin_map.json'); } catch (_) { mapText = null; }
      const rr = root.BMRules.loadRules(rulesText);
      const mm = root.BMPinyin.loadMap(mapText);
      const rulesData = { ok: rr.ok, missing: !!rr.missing, errors: rr.errors, warnings: rr.warnings, text: rr.ok ? rulesText : null };
      const pinyinMap = { ok: mm.ok, missing: !!mm.missing, errors: mm.errors, text: mm.ok ? mapText : null };
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
      let texts = null;
      try { const tr = textsStore ? textsStore.load() : null; texts = tr && tr.status === 'ok' ? tr.data : null; } catch (_) { texts = null; }
      return { shot: null, texts, version, contact, table, extra, rules: rulesData, pinyinMap, config, progress: saved.data, storeStatus: saved.status, themeSource, seed: null };
    },
    async saveProgress(data) {
      if (!store || !data || typeof data !== 'object') return false;
      try { store.save(data); return true; } catch (_) { return false; }
    },
    async saveTexts(data) {
      if (!textsStore || !data || typeof data !== 'object') return false;
      try { textsStore.save(data); return true; } catch (_) { return false; }
    },
    async setTheme(source) {
      if (!THEMES.includes(source)) return themeSource;
      themeSource = source;
      if (root.BMTheme) root.BMTheme.setMode(source);
      syncSystemBars();
      return source;
    },
    /** 导出记录文本。@returns {Promise<{ok:boolean, canceled?:boolean}>} */
    async exportRecord(text, name) {
      try {
        if (isNative()) {
          const w = await nativeInvoke('Filesystem', 'writeFile', { path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
          await nativeInvoke('Share', 'share', { title: name, url: w.uri, dialogTitle: name });
          return { ok: true };
        }
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = root.document.createElement('a');
        a.href = url; a.download = name; a.style.display = 'none';
        root.document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        return { ok: true };
      } catch (e) {
        // 用户在分享面板里取消不算失败
        return /cancel/i.test(String(e && (e.message || e))) ? { ok: false, canceled: true } : { ok: false };
      }
    },
    /** 选择一个记录文件并读出文本。@returns {Promise<{ok:true,text:string}|{ok:false,canceled?:boolean,reason?:string}>} */
    pickRecord() {
      return new Promise((resolve) => {
        try {
          const input = root.document.createElement('input');
          input.type = 'file'; input.accept = '.json,application/json'; input.style.display = 'none';
          input.addEventListener('change', async () => {
            const f = input.files && input.files[0];
            input.remove();
            if (!f) return resolve({ ok: false, canceled: true });
            if (f.size > maxChars() * 4) return resolve({ ok: false, reason: 'size' });
            try { resolve({ ok: true, text: await f.text() }); } catch (_) { resolve({ ok: false, reason: 'read' }); }
          });
          input.addEventListener('cancel', () => { input.remove(); resolve({ ok: false, canceled: true }); });
          root.document.body.append(input);
          input.click();
        } catch (_) { resolve({ ok: false, reason: 'read' }); }
      });
    },
    /** 导入前的完整备份（供「撤销」）：保存 / 读取 / 清除。 */
    async saveBackup(data) {
      if (!backupStore || !data || typeof data !== 'object') return false;
      try { backupStore.save(data); return true; } catch (_) { return false; }
    },
    async loadBackup() {
      try { const r = backupStore ? backupStore.load() : null; return r && r.status === 'ok' ? r.data : null; } catch (_) { return null; }
    },
    async clearBackup() {
      try { if (backupStore) { backupStore.storage.removeItem(backupStore.key); backupStore.storage.removeItem(backupStore.tmpKey); } return true; } catch (_) { return false; }
    },
    shotReady() {},
    shotPages() {},
    onShotShow() {},
    /** 主题变化（系统或手动）后同步系统栏。 */
    syncSystemBars,
  };
})(typeof self !== 'undefined' ? self : this);
