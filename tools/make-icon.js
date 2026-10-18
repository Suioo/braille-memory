'use strict';
/**
 * 生成应用图标（在 Electron 里渲染 SVG）：
 *   npx electron tools/make-icon.js
 * 输出：build/icon.svg、build/icon-<N>.png（16…256）、build/icon.png（256）、build/icon.ico（多尺寸），
 *       src/assets/icon.png、src/assets/icon.ico（窗口 / 任务栏用，随应用打包），
 *       docs/shots/icon-preview.png（16/32/48/256 并排 + 小尺寸放大）。
 * 点位：取 data/braille_table.csv 的第一条数据行（运行时读取，不在代码中写死），纯装饰。
 * 颜色：默认种子（teal）浅色方案的 primary-container（底）与 primary（点）。
 */
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { parseTable } = require('../src/core/csv.js');
const Pal = require('../src/core/palette.js');
const { iconSvg, buildIco, pngSize } = require('./icon-lib.js');

const ROOT = path.join(__dirname, '..');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const SMALL_MAX = 24;

app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'braille-memory-icon-')));
app.commandLine.appendSwitch('disable-lcd-text');

const svgUrl = (svg) => 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const pngUrl = (buf) => 'data:image/png;base64,' + buf.toString('base64');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const table = parseTable(fs.readFileSync(path.join(ROOT, 'data', 'braille_table.csv'), 'utf8'));
  if (table.errors.length || !table.rows.length) throw new Error('CSV: ' + table.errors.join(' '));
  const first = table.rows[0];
  const sc = Pal.scheme(Pal.SEEDS[Pal.DEFAULT_SEED], false);
  const colors = { bg: sc.primaryContainer, dot: sc.primary, ring: sc.primary + '59' };
  const full = iconSvg({ dots: first.dots, colors });
  const small = iconSvg({ dots: first.dots, colors, small: true });
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.svg'), full + '\n', 'utf8');
  fs.writeFileSync(path.join(ROOT, 'build', 'icon-small.svg'), small + '\n', 'utf8');

  const win = new BrowserWindow({
    width: 960, height: 760, show: false, frame: false, transparent: true, useContentSize: true,
    enableLargerThanScreen: true,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true },
  });
  win.webContents.setFrameRate(30);
  await win.loadURL('data:text/html,' + encodeURIComponent(
    '<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden"><img id="i" style="display:block"></body></html>'));

  const pngs = [];
  for (const n of SIZES) {
    const url = svgUrl(n <= SMALL_MAX ? small : full);
    await win.webContents.executeJavaScript(
      `new Promise((r) => { const i = document.getElementById('i'); i.onload = () => requestAnimationFrame(() => requestAnimationFrame(r)); i.width = ${n}; i.height = ${n}; i.src = ${JSON.stringify(url)}; })`);
    await sleep(80);
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: n, height: n });
    if (img.getSize().width !== n) img = img.resize({ width: n, height: n, quality: 'best' });
    const buf = img.toPNG();
    const sz = pngSize(buf);
    if (sz.width !== n || sz.height !== n) throw new Error('size ' + n + ' got ' + JSON.stringify(sz));
    fs.writeFileSync(path.join(ROOT, 'build', 'icon-' + n + '.png'), buf);
    pngs.push(buf);
  }
  const ico = buildIco(pngs);
  const png256 = pngs[pngs.length - 1];
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.ico'), ico);
  fs.writeFileSync(path.join(ROOT, 'build', 'icon.png'), png256);
  fs.mkdirSync(path.join(ROOT, 'src', 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'icon.ico'), ico);
  fs.writeFileSync(path.join(ROOT, 'src', 'assets', 'icon.png'), png256);

  // 预览：浅 / 深底上的 16、32、48、256 原尺寸，以及 16、32 放大 6 倍（像素化）
  const pick = (n) => pngUrl(pngs[SIZES.indexOf(n)]);
  const dark = Pal.scheme(Pal.SEEDS[Pal.DEFAULT_SEED], true);
  const strip = (bg) => `<div style="display:flex;align-items:flex-end;gap:28px;padding:24px;background:${bg}">`
    + [16, 32, 48, 256].map((n) => `<img src="${pick(n)}" width="${n}" height="${n}">`).join('')
    + `<img src="${pick(16)}" width="96" height="96" style="image-rendering:pixelated">`
    + `<img src="${pick(32)}" width="192" height="192" style="image-rendering:pixelated"></div>`;
  await win.webContents.executeJavaScript(`document.body.innerHTML = ${JSON.stringify(
    '<div style="width:960px">' + strip(sc.surface) + strip(dark.surface) + '</div>')}; new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
  await sleep(150);
  const h = await win.webContents.executeJavaScript('document.body.firstChild.getBoundingClientRect().height');
  const prev = await win.webContents.capturePage({ x: 0, y: 0, width: 960, height: Math.ceil(h) });
  fs.mkdirSync(path.join(ROOT, 'docs', 'shots'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'shots', 'icon-preview.png'), prev.toPNG());
  console.log('icon: CSV row id=' + first.id + ', sizes ' + SIZES.join('/') + ', ico ' + ico.length + ' bytes');
}

app.whenReady().then(main).then(() => app.exit(0), (e) => { console.error(e); app.exit(1); });
