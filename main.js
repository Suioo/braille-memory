'use strict';
/**
 * Electron 主进程。
 * - 读取 data/braille_table.csv（唯一点位来源）与 data/config.json，经 IPC 交给页面。
 * - 存档：userData/progress.json（原子写入，损坏备份）。
 * - 参数：
 *   --user-data=<dir>                 使用指定数据目录（测试/调试用，避免碰真实存档）
 *   --shot=<页面> --out=<png> [--theme=light|dark] [--size=720x960]   截一张图后退出
 *   --shot-all=<目录> [--sizes=720x960,480x640] [--themes=light,dark] [--pages=a,b]  批量截图后退出
 *   --style=material|glass  截图用的视觉风格
 *   --seed=teal|indigo|green|terracotta  截图用的配色种子（非默认时文件名加后缀）
 *   --e2e=<预设> --user-data=<dir>    冒烟：运行一个截图预设流程（会写存档到 dir）后退出
 *   截图模式一律使用临时数据目录且不写存档。
 */
const { app, BrowserWindow, ipcMain, nativeTheme, Menu, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { parseTable, loadExtra: loadExtraText } = require('./src/core/csv.js');
const Rules = require('./src/core/rules.js');
const Pinyin = require('./src/core/pinyin.js');
const { mergeConfig } = require('./src/core/config.js');
const { Store } = require('./src/main/store.js');
const Pal = require('./src/core/palette.js');
const { MAX_CHARS } = require('./src/core/backup.js');

const THEMES = ['system', 'light', 'dark'];

/** 解析 --key=value 形式的命令行参数。 */
function readArgs(argv) {
  const out = {};
  for (const a of argv) {
    const m = /^--(shot|out|theme|size|shot-all|sizes|themes|user-data|seed|style|e2e|pages|font-scale)=(.*)$/.exec(a);
    if (m) out[m[1]] = m[2];
  }
  return out;
}
const parseSize = (s) => {
  const m = /^(\d+)x(\d+)$/.exec(s || '');
  return m ? { w: Number(m[1]), h: Number(m[2]) } : null;
};

const args = readArgs(process.argv.slice(1));
const shot = args.shot || null;
const shotAll = args['shot-all'] || null;
const e2e = args.e2e || null;
if (e2e && !args['user-data']) { console.error('--e2e needs --user-data=<dir>'); process.exit(2); }
const shotMode = !!(shot || shotAll);
if (shot && !args.out) {
  console.error('usage: --shot=<page> --out=<file.png> [--theme=light|dark] [--size=720x960]');
  process.exit(2);
}
if (args.theme && !THEMES.includes(args.theme)) {
  console.error('bad --theme: ' + args.theme);
  process.exit(2);
}
if (shotMode) {
  app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'braille-memory-shot-')));
} else if (args['user-data']) {
  app.setPath('userData', path.resolve(args['user-data']));
}

// 灰度抗锯齿：黑白界面不出现彩色边缘，截图清晰
app.commandLine.appendSwitch('disable-lcd-text');

/** 资源路径：开发时在项目根，打包后在 resources。 */
const resPath = (...p) => (app.isPackaged
  ? path.join(process.resourcesPath, ...p)
  : path.join(__dirname, ...p));

/** 本机私有联系方式：开发时 private/contact.json，打包后 resources/contact.json；缺失或损坏返回 null，从不记录内容。 */
function loadContact() {
  try {
    const f = app.isPackaged ? path.join(process.resourcesPath, 'contact.json') : path.join(__dirname, 'private', 'contact.json');
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    return c && typeof c.qq === 'string' && c.qq ? { label: String(c.label || ''), qq: c.qq, name: String(c.name || '') } : null;
  } catch (_) { return null; }
}

function loadTable() {
  try {
    const res = parseTable(fs.readFileSync(resPath('data', 'braille_table.csv'), 'utf8'));
    if (res.warnings.length) console.warn('[table] ' + res.warnings.join(' '));
    if (res.errors.length) return { ok: false, rows: [], errors: res.errors };
    if (res.rows.length === 0) return { ok: false, rows: [], errors: ['empty'] };
    return { ok: true, rows: res.rows, errors: [] };
  } catch (e) {
    return { ok: false, rows: [], errors: ['read:' + (e.code || e.message)] };
  }
}

/** 扩展符号表（可缺失：缺失时对应功能隐藏）。 */
function loadExtra(mainRows) {
  let text = null;
  try { text = fs.readFileSync(resPath('data', 'braille_extra.csv'), 'utf8'); } catch (e) {
    if (e.code !== 'ENOENT') return { ok: false, rows: [], errors: ['read:' + (e.code || e.message)] };
  }
  const res = loadExtraText(text, mainRows);
  if (res.warnings && res.warnings.length) console.warn('[extra] ' + res.warnings.join(' '));
  return res;
}

/** 规则数据与拼音还原表（可缺失：缺失时规则相关入口隐藏）。返回 {ok, missing, errors, warnings, text}，text 只在通过校验时带上。 */
function readOptionalText(name) {
  try { return fs.readFileSync(resPath('data', name), 'utf8'); } catch (e) { return e.code === 'ENOENT' ? null : { error: 'read:' + (e.code || e.message) }; }
}
function loadRulesData() {
  const text = readOptionalText('rules.json');
  if (text && typeof text === 'object') return { ok: false, errors: [text.error], warnings: [], text: null };
  const r = Rules.loadRules(text);
  if (r.warnings.length) console.warn('[rules] ' + r.warnings.join(' '));
  return { ok: r.ok, missing: !!r.missing, errors: r.errors, warnings: r.warnings, text: r.ok ? text : null };
}
function loadPinyinMapData() {
  const text = readOptionalText('pinyin_map.json');
  if (text && typeof text === 'object') return { ok: false, errors: [text.error], text: null };
  const r = Pinyin.loadMap(text);
  return { ok: r.ok, missing: !!r.missing, errors: r.errors, text: r.ok ? text : null };
}

function loadConfig() {
  let raw = null;
  try { raw = JSON.parse(fs.readFileSync(resPath('data', 'config.json'), 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[config] ' + e.message);
  }
  const { config, errors } = mergeConfig(raw);
  if (errors.length) console.warn('[config] ' + errors.join(' '));
  return config;
}

const store = new Store(app.getPath('userData'));
const textsStore = new Store(app.getPath('userData'), 'texts.json'); // 自定义文本库（仅本机）
let savedTexts = { status: 'empty', data: null };
let saved = { status: 'empty', data: null };
/** 窗口底色 = 当前配色的 surface（避免启动白闪）。 */
const seedName = () => {
  if (args.seed && Pal.SEEDS[args.seed]) return args.seed;
  const s = saved.data && saved.data.settings && saved.data.settings.seed;
  return Pal.SEEDS[s] ? s : Pal.DEFAULT_SEED;
};
const bg = () => Pal.scheme(Pal.SEEDS[seedName()], nativeTheme.shouldUseDarkColors).surface;
let win = null;

function createWindow() {
  const size = parseSize(args.size) || { w: 720, h: 960 };
  win = new BrowserWindow({
    width: 720,
    height: 960,
    minWidth: shotMode ? 100 : 480,
    minHeight: shotMode ? 100 : 640,
    useContentSize: true,
    resizable: true,
    show: false,
    title: '盲文记忆',
    icon: path.join(__dirname, 'src', 'assets', 'icon.ico'), // 由 tools/make-icon.js 生成
    backgroundColor: bg(),
    autoHideMenuBar: true,
    enableLargerThanScreen: shotMode,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // 页面脚本错误转到主进程输出（便于冒烟检查）
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error' || e.level === 'warning') console.error('[renderer ' + e.level + '] ' + e.message);
    else if (e2e && e.message.startsWith('e2e')) console.log('[renderer] ' + e.message);
  });
  win.webContents.on('render-process-gone', (_e, d) => console.error('[renderer gone] ' + d.reason));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  if (shotMode) {
    win.setContentSize(size.w, size.h);
    setTimeout(() => { console.error('shot timeout'); app.exit(1); }, shotAll ? 600000 : 20000);
  } else {
    if (!e2e) win.once('ready-to-show', () => win.show());
    else setTimeout(() => { console.error('e2e timeout'); app.exit(1); }, 30000);
  }
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

const fromOurWindow = (e) => win && e.sender === win.webContents;

ipcMain.handle('boot:get', (e) => {
  if (!fromOurWindow(e)) return null;
  const table = loadTable();
  return {
    shot: shot || (shotAll ? '*batch*' : null) || (e2e ? 'e2e:' + e2e : null),
    table,
    extra: loadExtra(table.rows),
    rules: loadRulesData(),
    pinyinMap: loadPinyinMapData(),
    config: loadConfig(),
    progress: shotMode ? null : saved.data,
    texts: shotMode ? null : savedTexts.data,
    storeStatus: shotMode ? 'shot' : saved.status,
    themeSource: nativeTheme.themeSource,
    version: app.getVersion(),
    contact: shotMode ? null : loadContact(),
    seed: args.seed && Pal.SEEDS[args.seed] ? args.seed : null,
    style: args.style === 'glass' ? 'glass' : null,
    fontScale: shotMode && Number(args['font-scale']) > 0 ? Math.min(2, Number(args['font-scale'])) : null,
  };
});
ipcMain.handle('progress:save', (e, data) => {
  if (!fromOurWindow(e) || shotMode) return false; // 截图模式不写盘（e2e 写入 --user-data）
  if (!data || typeof data !== 'object') return false;
  try { store.save(data); return true; } catch (err) { console.error('[save] ' + err.message); return false; }
});

ipcMain.handle('texts:save', (e, data) => {
  if (!fromOurWindow(e) || shotMode) return false;
  if (!data || typeof data !== 'object' || JSON.stringify(data).length > 3 * 1024 * 1024) return false;
  try { textsStore.save(data); return true; } catch (err) { console.error('[texts] ' + err.message); return false; }
});

// 选一个 .txt 文件，返回原始字节（由渲染进程按严格 UTF-8 解码并校验大小）
ipcMain.handle('texts:pick', async (e) => {
  if (!fromOurWindow(e) || shotMode) return { ok: false };
  try {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'TXT', extensions: ['txt'] }] });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    if (fs.statSync(r.filePaths[0]).size > 200 * 1024) return { ok: false, reason: 'size' };
    return { ok: true, bytes: new Uint8Array(fs.readFileSync(r.filePaths[0])) };
  } catch (err) { console.error('[texts] ' + err.message); return { ok: false, reason: 'read' }; }
});

// ---------- 记录导出 / 导入 / 撤销备份 ----------
const backupStore = new Store(app.getPath('userData'), 'progress.backup.json');
const JSON_FILTER = [{ name: 'JSON', extensions: ['json'] }];
ipcMain.handle('backup:export', async (e, text, name) => {
  if (!fromOurWindow(e) || shotMode || typeof text !== 'string' || typeof name !== 'string') return { ok: false };
  try {
    const r = await dialog.showSaveDialog(win, { defaultPath: path.basename(name), filters: JSON_FILTER });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    const tmp = r.filePath + '.tmp';
    fs.writeFileSync(tmp, text, 'utf8');
    fs.renameSync(tmp, r.filePath);
    return { ok: true };
  } catch (err) { console.error('[export] ' + err.message); return { ok: false }; }
});
ipcMain.handle('backup:import', async (e) => {
  if (!fromOurWindow(e) || shotMode) return { ok: false };
  try {
    const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: JSON_FILTER });
    if (r.canceled || !r.filePaths.length) return { ok: false, canceled: true };
    if (fs.statSync(r.filePaths[0]).size > MAX_CHARS * 4) return { ok: false, reason: 'size' };
    return { ok: true, text: fs.readFileSync(r.filePaths[0], 'utf8') };
  } catch (err) { console.error('[import] ' + err.message); return { ok: false, reason: 'read' }; }
});
ipcMain.handle('backup:save', (e, data) => {
  if (!fromOurWindow(e) || shotMode || !data || typeof data !== 'object') return false;
  try { backupStore.save(data); return true; } catch (err) { console.error('[backup] ' + err.message); return false; }
});
ipcMain.handle('backup:load', (e) => {
  if (!fromOurWindow(e) || shotMode) return null;
  try { const r = backupStore.load(); return r.status === 'ok' ? r.data : null; } catch (_) { return null; }
});
ipcMain.handle('backup:clear', (e) => {
  if (!fromOurWindow(e) || shotMode) return false;
  try { fs.rmSync(backupStore.file, { force: true }); return true; } catch (_) { return false; }
});
ipcMain.handle('theme:set', (e, source) => {
  if (!fromOurWindow(e) || !THEMES.includes(source)) return nativeTheme.themeSource;
  if (!shotMode) nativeTheme.themeSource = source;
  return source;
});

// ---------- 截图 ----------
async function capture(file) {
  const img = await win.webContents.capturePage();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, img.toPNG());
  return img.getSize();
}
let waitReady = null;
ipcMain.on('shot:ready', async (e, name) => {
  if (e2e && fromOurWindow(e)) { console.log('e2e ' + name + ' done'); setTimeout(() => app.exit(0), 800); return; }
  if (!shotMode || !fromOurWindow(e)) return;
  if (waitReady) { const r = waitReady; waitReady = null; r(name); return; }
  if (shot) {
    try {
      const out = path.resolve(args.out);
      console.log('shot ' + name + ' -> ' + out + ' ' + JSON.stringify(await capture(out)));
      app.exit(0);
    } catch (err) { console.error('shot failed: ' + err.message); app.exit(1); }
  }
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
ipcMain.on('shot:pages', async (e, pages) => {
  if (!shotAll || !fromOurWindow(e)) return;
  const sizes = (args.sizes || '720x960,480x640').split(',').map(parseSize).filter(Boolean);
  const themes = (args.themes || 'light,dark').split(',').filter((t) => THEMES.includes(t));
  const dir = path.resolve(shotAll);
  if (args.pages) {
    const want = args.pages.split(',');
    const unknown = want.filter((p) => !pages.includes(p));
    if (unknown.length) console.error('unknown pages: ' + unknown.join(','));
    pages = pages.filter((p) => want.includes(p));
  }
  let n = 0;
  try {
    for (const size of sizes) {
      win.setContentSize(size.w, size.h);
      for (const theme of themes) {
        nativeTheme.themeSource = theme;
        for (const page of pages) {
          await sleep(120);
          const ready = new Promise((r) => { waitReady = r; });
          win.webContents.send('shot:show', page);
          await ready;
          const suffix = seedName() === Pal.DEFAULT_SEED ? '' : '-' + seedName();
          const file = path.join(dir, page + '-' + theme + '-' + size.w + 'x' + size.h + suffix + '.png');
          await capture(file);
          n++;
        }
      }
    }
    console.log('shots: ' + n + ' -> ' + dir);
    app.exit(0);
  } catch (err) { console.error('shot-all failed: ' + err.message); app.exit(1); }
});

nativeTheme.on('updated', () => { if (win) win.setBackgroundColor(bg()); });

app.whenReady().then(() => {
  if (!shotMode) {
    try { saved = store.load(); } catch (err) { console.error('[load] ' + err.message); }
    try { savedTexts = textsStore.load(); } catch (err) { console.error('[texts] ' + err.message); }
    if (saved.status === 'corrupt') console.warn('[load] corrupt save backed up to ' + saved.backup);
    const t = saved.data && saved.data.settings && saved.data.settings.theme;
    if (THEMES.includes(t)) nativeTheme.themeSource = t;
  }
  if (args.theme) nativeTheme.themeSource = args.theme;
  Menu.setApplicationMenu(null);
  createWindow();
});
app.on('window-all-closed', () => app.quit());
