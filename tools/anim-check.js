'use strict';
/**
 * 动效脚本检查（开发用，不写真实存档）：
 *   npx electron tools/anim-check.js [输出目录，默认 docs/shots/v19]
 * 复用 main.js 的截图模式（临时数据目录，--style=glass --theme=dark --size=412x915），
 * 页面就绪后接管 shot:ready：
 *   (a) 学习卡翻面：翻转中抓 3 帧 + 结束后 1 帧，并检查卡片外没有多余元素、翻完后面上没有残留；
 *   (b) 设置页：点开关与分段按钮，约 80 ms 抓一帧，核对控件仍是同一个 DOM 节点且正在过渡。
 */
const path = require('node:path');
const fs = require('node:fs');
const { app, ipcMain, BrowserWindow } = require('electron');

const outDir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('-') && !a.endsWith('.js') && a !== '.') || path.join(__dirname, '..', 'docs', 'shots', 'v19'));
process.argv.push('--shot=learn-front', '--out=' + path.join(outDir, '_unused.png'), '--theme=dark', '--size=412x915', '--style=glass');
require('../main.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let started = false;
app.whenReady().then(() => {
  setTimeout(() => {
    ipcMain.removeAllListeners('shot:ready');
    ipcMain.on('shot:ready', async (_e, name) => {
      if (started) return;
      started = true;
      const win = BrowserWindow.getAllWindows()[0];
      const wc = win.webContents;
      const ev = (code) => wc.executeJavaScript(code);
      const snap = async (file) => {
        await wc.capturePage(); await sleep(16); const img = await wc.capturePage();
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, file), img.toPNG());
      };
      try {
        console.log('[ready] ' + name + ' fx-on=' + await ev('document.documentElement.classList.contains("fx-on")'));
        // ---- (a) 翻卡 ----
        const before = await ev('(() => { const c = document.querySelector(".card"); return { cardKids: c.children.length, all: document.querySelectorAll("*").length }; })()');
        await ev('document.querySelector(".controls .btn.filled").click(); 0');
        await sleep(100); await snap('flip-1.png');
        console.log('[a] t~100 ' + await ev('(() => { const c = document.querySelector(".card"); const s = getComputedStyle(c.querySelector(".card-inner")); return JSON.stringify({ cls: c.className, scale: s.scale, extraKids: c.children.length }); })()'));
        await sleep(140); await snap('flip-2.png');
        console.log('[a] t~240 ' + await ev('(() => { const c = document.querySelector(".card"); const s = getComputedStyle(c.querySelector(".card-inner")); return JSON.stringify({ cls: c.className, scale: s.scale }); })()'));
        await sleep(120); await snap('flip-3.png');
        await sleep(700); await snap('flip-after.png');
        console.log('[a] after ' + await ev(`(() => {
          const c = document.querySelector(".card"); const cr = c.getBoundingClientRect();
          const out = []; for (const el of document.querySelectorAll("body *")) { if (el.closest(".card") || !el.closest(".card-holder")) continue; out.push(el.className); }
          const f = c.querySelector(".face.back"); const fs2 = getComputedStyle(c.querySelector(".card-inner"));
          const stray = document.querySelectorAll(".fx-lift,.fx-sheen,.fx-sheen-bar").length;
          return JSON.stringify({ cardKids: c.children.length, outsideCard: out, stray, scale: fs2.scale, anim: fs2.animationName, faceAnim: getComputedStyle(f).animationName });
        })()`) + ' (before ' + JSON.stringify(before) + ')');
        // ---- (b) 设置页 ----
        await ev('window.__ctx && 0; document.querySelector("[data-tab=me]").click(); 0');
        await sleep(600);
        const probe = async (selector, file, label) => {
          await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); el.__mark = "same-node"; 0; })()`);
          await ev(`(${(label === 'switch') ? 'sel => document.querySelector(sel).click()' : 'sel => document.querySelector(sel).click()'})(${JSON.stringify(selector)}); 0`);
          await sleep(80); await snap(file);
          const mid = await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const th = el.querySelector ? el.querySelector(".thumb") : null; const ind = el.parentElement && el.parentElement.querySelector(".seg-ind");
            return JSON.stringify({ sameNode: el.__mark === "same-node", thumb: th ? [getComputedStyle(th).left, getComputedStyle(th).width] : null, ind: ind ? getComputedStyle(ind).transform : null, active: document.activeElement === el }); })()`);
          await sleep(700);
          const end = await ev(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); const th = el.querySelector(".thumb"); const ind = el.parentElement && el.parentElement.querySelector(".seg-ind");
            return JSON.stringify({ thumb: th ? [getComputedStyle(th).left, getComputedStyle(th).width] : null, ind: ind ? getComputedStyle(ind).transform : null }); })()`);
          console.log('[b] ' + label + ' mid=' + mid + ' end=' + end);
        };
        await probe('[data-key="timing"] .switch', 'settings-switch-mid.png', 'switch');
        await probe('[data-key="qtype"] .seg[data-value="dots"]', 'settings-seg-mid.png', 'segmented');
        await snap('settings-after.png');
      } catch (err) { console.error('anim-check failed: ' + err.stack); }
      app.exit(0);
    });
  }, 0);
});
