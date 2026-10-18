'use strict';
/**
 * v20 交互检查（开发用，不写真实存档；复用 main.js 截图模式：临时数据目录、glass、dark、412x915）：
 *   npx electron tools/anim-check-v20.js [输出目录，默认 docs/shots/v20]
 * (a) 学习页点类别芯片 + 阅读/镜像分段：中途帧，核对节点未被重建；
 * (b) 镜像视角选符号题：点迷你点图翻面，核对 aria-pressed 与布局 = 阅读视角的 cellLayout；
 * (c) 设置页分段按钮：真实鼠标 按下 -> 拖过 -> 抓中途帧（设置未变）-> 松开（只变一次）。
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, ipcMain, BrowserWindow } = require('electron');

const outDir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.js') && a !== '.') || path.join(__dirname, '..', 'docs', 'shots', 'v20'));
process.argv.push('--shot=learn-front', '--out=' + path.join(outDir, '_unused.png'), '--theme=dark', '--size=412x915', '--style=glass');
require('../main.js');

const sleep0 = (ms) => new Promise((r) => setTimeout(r, ms));
let pump = null;
// 窗口不显示时页面不出帧：等待期间不断截图以驱动动画
const sleep = async (ms) => { const t = Date.now(); while (Date.now() - t < ms) { if (pump) await pump(); await sleep0(16); } };
let started = false;
app.whenReady().then(() => {
  setTimeout(() => {
    ipcMain.removeAllListeners('shot:ready');
    ipcMain.on('shot:ready', async () => {
      if (started) return;
      started = true;
      const wc = BrowserWindow.getAllWindows()[0].webContents;
      const ev = (code) => wc.executeJavaScript(code);
      pump = () => wc.capturePage();
      const snap = async (file) => {
        await wc.capturePage(); await sleep0(16); const img = await wc.capturePage();
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, file), img.toPNG());
      };
      try {
        // ---- (a) ----
        await ev(`(() => { const p = document.querySelector('.page-body'); p.__m = 'same'; const chips = [...document.querySelectorAll('.chip.filter')]; chips.forEach((c, i) => c.__m = 'c' + i); const sg = document.querySelector('.segmented'); sg.__m = 'seg'; document.querySelector('.seg-ind').__m = 'ind'; window.__cnt0 = document.querySelector('.tb-meta').textContent; 0; })()`);
        await ev(`document.querySelectorAll('.chip.filter')[1].click(); document.querySelector('.seg[data-value="true"]').click(); 0`);
        await sleep(90); await snap('a-learn-mid.png');
        console.log('[a] mid ' + await ev(`(() => { const chips = [...document.querySelectorAll('.chip.filter')]; const ico = getComputedStyle(chips[1].querySelector('.chip-ico')); return JSON.stringify({ page: document.querySelector('.page-body').__m, chipsSame: chips.every((c, i) => c.__m === 'c' + i), seg: document.querySelector('.segmented').__m, ind: document.querySelector('.seg-ind').__m, chip1: chips[1].className, icoOpacity: ico.opacity, icoW: ico.width, indTransform: getComputedStyle(document.querySelector('.seg-ind')).transform, counter: window.__cnt0 + ' -> ' + document.querySelector('.tb-meta').textContent, mirrored: !!document.querySelector('.card .cell.mirrored'), focus: document.activeElement.className }); })()`));
        await sleep(700); await snap('a-learn-after.png');
        console.log('[a] after ' + await ev(`JSON.stringify({ chipsSame: [...document.querySelectorAll('.chip.filter')].every((c, i) => c.__m === 'c' + i), checked: [...document.querySelectorAll('.chip.filter')].map(c => c.getAttribute('aria-checked')).join(','), scope: BMApp.ctx.settings.scope, mirror: BMApp.ctx.settings.mirror })`));

        // ---- (b) ----
        await ev(`(() => { const c = BMApp.ctx; c.settings.mirror = true; c.settings.scope = 'all'; const r = c.table.find((x) => x.dots.length >= 3 && x.dots.length <= 5); window.__row = r; c.go('round', { mode: 'practice', force: { type: 'choose', rowId: r.id } }); 0; })()`);
        await sleep(600); await snap('b-mini-before.png');
        const lay = `(() => { const m = document.querySelector('.mini-cell'); const got = [...m.querySelectorAll('i')].map((i) => [i.style.gridRow, i.style.gridColumn, i.classList.contains('r')].join('/')); const want = BMCell.cellLayout(__row.dots, false).map((d) => [d.row, d.col, d.raised].join('/')); const wantM = BMCell.cellLayout(__row.dots, true).map((d) => [d.row, d.col, d.raised].join('/')); return JSON.stringify({ tag: m.tagName, pressed: m.getAttribute('aria-pressed'), label: m.getAttribute('aria-label'), equalsReading: got.join() === want.join(), equalsMirror: got.join() === wantM.join(), bigMirrored: document.querySelector('.cell-card .cell').classList.contains('mirrored'), globalMirror: BMApp.ctx.settings.mirror }); })()`;
        console.log('[b] before ' + await ev(lay));
        await ev(`document.querySelector('.mini-cell').click(); 0`);
        await sleep(70); await snap('b-mini-mid.png');
        console.log('[b] mid scaleX ' + await ev(`getComputedStyle(document.querySelector('.mini-cell')).transform`));
        await sleep(450); await snap('b-mini-after.png');
        console.log('[b] after ' + await ev(lay));
        await ev(`document.querySelector('.mini-cell').click(); 0`);
        await sleep(450);
        console.log('[b] second tap ' + await ev(lay));

        // ---- (c) ----
        await ev(`(() => { window.__saves = 0; const o = BMApp.ctx.save; BMApp.ctx.save = () => { window.__saves++; return o(); }; BMApp.ctx.go('me'); 0; })()`);
        await sleep(600);
        await ev(`document.querySelector('[data-key="qtype"]').scrollIntoView({ block: 'center' }); 0`);
        await sleep(200);
        const info = JSON.parse(await ev(`(() => { const g = document.querySelector('[data-key="qtype"] .segmented'); g.__m = 'g'; const bs = [...g.querySelectorAll('.seg')]; return JSON.stringify({ cur: BMApp.ctx.settings.qtype, vals: bs.map((b) => b.dataset.value), rects: bs.map((b) => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }) }); })()`));
        const to = info.vals.indexOf(info.cur) === 0 ? 2 : 0;
const from = to;
        const pt = (i) => ({ x: Math.round(info.rects[i][0]), y: Math.round(info.rects[i][1]) });
        const mouse = (type, p) => wc.sendInputEvent({ type, x: p.x, y: p.y, button: 'left', clickCount: 1 });
        const a = pt(from), b = pt(to);
        // 从选中段按下，拖向另一端
        const start = pt(info.vals.indexOf(info.cur));
        mouse('mouseMove', start); mouse('mouseDown', start);
        const steps = 8;
        for (let k = 1; k <= steps; k++) { mouse('mouseMove', { x: Math.round(start.x + (b.x - start.x) * k / steps), y: start.y }); await sleep(30); }
        await sleep(150); await snap('c-drag-mid.png');
        console.log('[c] mid ' + await ev(`JSON.stringify({ qtype: BMApp.ctx.settings.qtype, saves: __saves, dragging: document.querySelector('[data-key="qtype"] .segmented').classList.contains('dragging'), ind: getComputedStyle(document.querySelector('[data-key="qtype"] .seg-ind')).transform, indW: getComputedStyle(document.querySelector('[data-key="qtype"] .seg-ind')).width })`) + ' target=' + info.vals[to] + ' cur=' + info.cur);
        mouse('mouseUp', b);
        await sleep(700); await snap('c-drag-after.png');
        console.log('[c] after ' + await ev(`JSON.stringify({ qtype: BMApp.ctx.settings.qtype, saves: __saves, sameNode: document.querySelector('[data-key="qtype"] .segmented').__m === 'g', selected: document.querySelector('[data-key="qtype"] .seg.selected').dataset.value })`));
        // 点按仍可用
        await ev(`document.querySelector('[data-key="qtype"] .seg[data-value="${info.cur}"]').click(); 0`);
        await sleep(100);
        console.log('[c] tap ' + await ev(`JSON.stringify({ qtype: BMApp.ctx.settings.qtype, saves: __saves })`));
      } catch (err) { console.error('anim-check-v20 failed: ' + err.stack); }
      app.exit(0);
    });
  }, 0);
});
