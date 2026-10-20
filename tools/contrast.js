'use strict';
/**
 * 生成 docs/contrast.md：每个种子色 × 浅/深色，列出 M3 角色配对的实测对比度。
 * 用法（项目根）：node tools/contrast.js
 * 只报告数值与是否达到要求的最低值（要求值写在 src/core/palette.js 的 CONTRAST_PAIRS）。
 */
const fs = require('node:fs');
const path = require('node:path');
const Pal = require('../src/core/palette.js');

const lines = [];
lines.push('# 对比度实测（WCAG 2.x 相对亮度公式）', '');
lines.push('由 `node tools/contrast.js` 生成；配色来自 `src/core/palette.js`。要求：正文 ≥ 4.5:1，控件 / 图形 ≥ 3:1。', '');
lines.push('说明：M3 的 `outline-variant` 只用于装饰性分隔线（列表分隔、统计分隔），不承担控件边界；',
  '空点细圈、芯片与分段按钮边框、禁用文字一律使用 `outline`（≥ 3:1）。', '');
let fails = 0;
for (const [name, seed] of Object.entries(Pal.SEEDS)) {
  for (const dark of [false, true]) {
    const sc = Pal.scheme(seed, dark);
    lines.push('## ' + name + '（' + seed + '）· ' + (dark ? '深色' : '浅色'), '');
    lines.push('surface `' + sc.surface + '` · on-surface `' + sc.onSurface + '` · primary `' + sc.primary + '`', '');
    lines.push('| 前景 | 背景 | 用途 | 对比度 | 要求 | 结果 |', '|---|---|---|---|---|---|');
    for (const [fg, bg, min, use] of Pal.CONTRAST_PAIRS) {
      const c = Pal.contrast(sc[fg], sc[bg]);
      const ok = c >= min;
      if (!ok) fails++;
      lines.push(`| ${Pal.cssVar(fg).slice(2)} \`${sc[fg]}\` | ${Pal.cssVar(bg).slice(2)} \`${sc[bg]}\` | ${use} | ${c.toFixed(2)}:1 | ${min}:1 | ${ok ? '达到' : '未达到'} |`);
    }
    const ov = Pal.contrast(sc.outlineVariant, sc.surfaceContainerHigh);
    lines.push(`| outline-variant \`${sc.outlineVariant}\` | surface-container-high \`${sc.surfaceContainerHigh}\` | 仅装饰分隔线（参考） | ${ov.toFixed(2)}:1 | — | 不用于控件 |`, '');
  }
}
// ---------- 玻璃风格：半透明填充叠在最不利的背景点上 ----------
const GLASS_PAIRS = [
  ['onSurface', 4.5, '正文'], ['onSurfaceVariant', 4.5, '次要文字'], ['primary', 4.5, '文字按钮 / 强调文字'],
  ['outline', 3, '空点细圈 / 控件边'], ['tertiary', 3, '漏点虚线圈'], ['error', 3, '多点外圈'],
];
let glassWorst = { c: 99, label: '' };
lines.push('# 玻璃风格对比度（填充 × 最不利背景点）', '');
lines.push(`玻璃填充 = 浅色 surface-container-lowest / 深色 surface-container-high，不透明度 浅 ${Pal.GLASS.fillAlphaLight} / 深 ${Pal.GLASS.fillAlpha}，叠在背景上；背景最不利点 = 纯 surface、各色块峰值（色块不透明度 浅 ${Pal.GLASS.blobLight} / 深 ${Pal.GLASS.blobDark}）及其叠加处。`,
  '模糊只会让背景更平均，不会比峰值更极端，故取峰值为下界。无 backdrop-filter 时填充不透明度 ' + Pal.GLASS.fallbackAlpha + '（更不透明，对比度只会更好）。',
  '凸起点为实心主色（不透明）；选中的分段 / 主按钮 / 容器色块在玻璃风格下仍是实心色，对比度同上面的 Material 表。', '');
for (const [name, seed] of Object.entries(Pal.SEEDS)) {
  for (const dark of [false, true]) {
    const sc = Pal.scheme(seed, dark);
    lines.push('## 玻璃 · ' + name + ' · ' + (dark ? '深色' : '浅色'), '');
    lines.push('| 前景 | 用途 | 最不利背景点 | 合成底色 | 对比度（最小） | 要求 | 结果 |', '|---|---|---|---|---|---|---|');
    const spots = Pal.glassBackdrops(sc, dark);
    for (const [fg, min, use] of GLASS_PAIRS) {
      let worst = null;
      for (const s of spots) {
        const c = Pal.contrast(sc[fg], s.fill);
        if (!worst || c < worst.c) worst = { c, s };
      }
      const ok = worst.c >= min;
      if (!ok) fails++;
      if (worst.c < glassWorst.c) glassWorst = { c: worst.c, label: `${name}/${dark ? 'dark' : 'light'}/${fg}` };
      lines.push(`| ${Pal.cssVar(fg).slice(2)} \`${sc[fg]}\` | ${use} | ${worst.s.name} | \`${worst.s.fill}\` | ${worst.c.toFixed(2)}:1 | ${min}:1 | ${ok ? '达到' : '未达到'} |`);
    }
    for (const fg of ['onSurface', 'onSurfaceVariant']) {
      let worst = null;
      for (const s of spots) { const c = Pal.contrast(sc[fg], s.bg); if (!worst || c < worst.c) worst = { c, s }; }
      const ok = worst.c >= 4.5;
      if (!ok) fails++;
      if (worst.c < glassWorst.c) glassWorst = { c: worst.c, label: `${name}/${dark ? 'dark' : 'light'}/${fg}-bare` };
      lines.push(`| ${Pal.cssVar(fg).slice(2)} \`${sc[fg]}\` | 直接放在背景上的文字（标题、分组名） | ${worst.s.name} | \`${worst.s.bg}\` | ${worst.c.toFixed(2)}:1 | 4.5:1 | ${ok ? '达到' : '未达到'} |`);
    }
    lines.push('');
  }
}
lines.push(`玻璃风格最低实测对比度：${glassWorst.c.toFixed(2)}:1（${glassWorst.label}）`, '');
console.log('glass worst ' + glassWorst.c.toFixed(2) + ' ' + glassWorst.label);
lines.push('未达到要求的配对数：' + fails, '');
fs.writeFileSync(path.join(__dirname, '..', 'docs', 'contrast.md'), lines.join('\n'), 'utf8');
console.log('docs/contrast.md written, below-minimum pairs: ' + fails);
