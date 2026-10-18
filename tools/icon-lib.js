'use strict';
/**
 * 应用图标的纯函数部分（无依赖、可测试）：
 * - iconSvg：M3 风格圆角方（超椭圆）背景 + 居中 2×3 盲文方。
 *   点位由调用方从 data/braille_table.csv 读出后传入（本文件不含任何符号的点位）。
 * - buildIco：把多张 PNG 打包成 .ico（ICONDIR + ICONDIRENTRY + PNG 数据）。
 * - pngSize：读取 PNG 的 IHDR 宽高。
 */
const { cellLayout } = require('../src/core/cell.js');

/**
 * 超椭圆（squircle）路径：|x/a|^n + |y/a|^n = 1。
 * @param {number} size 画布边长
 * @param {number} inset 四周留白
 * @param {number} [n] 指数，越大越方
 * @param {number} [steps] 采样点数
 */
function squirclePath(size, inset, n, steps) {
  n = n || 5;
  steps = steps || 128;
  const c = size / 2;
  const a = c - inset;
  const pts = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    const ct = Math.cos(t);
    const st = Math.sin(t);
    const x = c + a * Math.sign(ct) * Math.pow(Math.abs(ct), 2 / n);
    const y = c + a * Math.sign(st) * Math.pow(Math.abs(st), 2 / n);
    pts.push(x.toFixed(2) + ' ' + y.toFixed(2));
  }
  return 'M' + pts.join(' L') + ' Z';
}

/**
 * 生成图标 SVG（256 视图框）。
 * @param {object} o
 * @param {number[]} o.dots 凸起点位（来自 CSV）
 * @param {{bg:string, dot:string, ring:string}} o.colors
 * @param {boolean} [o.small] 小尺寸版：点更大、空点不画（≤ 24 px 时更清晰）
 * @returns {string}
 */
function iconSvg(o) {
  const S = 256;
  const small = !!o.small;
  const r = small ? 27 : 24;             // 点半径
  const dx = small ? 94 : 64;            // 列间距（圆心）
  const dy = small ? 76 : 60;            // 行间距（圆心）
  const cx = S / 2;
  const cy = S / 2;
  const parts = [];
  parts.push('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">');
  parts.push('<path d="' + squirclePath(S, small ? 2 : 10) + '" fill="' + o.colors.bg + '"/>');
  for (const d of cellLayout(o.dots, false)) {
    const x = cx + (d.col === 1 ? -dx / 2 : dx / 2);
    const y = cy + (d.row - 2) * dy;
    if (d.raised) parts.push('<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + o.colors.dot + '"/>');
    else if (!small) parts.push('<circle cx="' + x + '" cy="' + y + '" r="' + (r - 3) + '" fill="none" stroke="' + o.colors.ring + '" stroke-width="5"/>');
  }
  parts.push('</svg>');
  return parts.join('\n');
}

/** PNG 宽高（IHDR）。 */
function pngSize(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < 24 || !sig.every((b, i) => buf[i] === b)) throw new Error('not a PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/**
 * 多尺寸 ICO（PNG 压缩条目，Windows Vista 起支持）。
 * @param {Buffer[]} pngs 各尺寸 PNG（≤ 256 px）
 * @returns {Buffer}
 */
function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);      // reserved
  header.writeUInt16LE(1, 2);      // type 1 = icon
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  pngs.forEach((png, i) => {
    const { width, height } = pngSize(png);
    if (width > 256 || height > 256) throw new Error('icon > 256 px');
    const e = i * 16;
    entries.writeUInt8(width === 256 ? 0 : width, e);
    entries.writeUInt8(height === 256 ? 0 : height, e + 1);
    entries.writeUInt8(0, e + 2);           // palette colours
    entries.writeUInt8(0, e + 3);           // reserved
    entries.writeUInt16LE(1, e + 4);        // planes
    entries.writeUInt16LE(32, e + 6);       // bits per pixel
    entries.writeUInt32LE(png.length, e + 8);
    entries.writeUInt32LE(offset, e + 12);
    offset += png.length;
  });
  return Buffer.concat([header, entries, ...pngs]);
}

/** 解析 ICO 目录（测试与核对用）。 */
function readIco(buf) {
  const count = buf.readUInt16LE(4);
  const out = [];
  for (let i = 0; i < count; i++) {
    const e = 6 + i * 16;
    out.push({
      width: buf.readUInt8(e) || 256,
      height: buf.readUInt8(e + 1) || 256,
      bitCount: buf.readUInt16LE(e + 6),
      size: buf.readUInt32LE(e + 8),
      offset: buf.readUInt32LE(e + 12),
    });
  }
  return { type: buf.readUInt16LE(2), count, entries: out };
}

module.exports = { squirclePath, iconSvg, pngSize, buildIco, readIco };
