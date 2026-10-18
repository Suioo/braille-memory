'use strict';
// 图标：ICO 容器写入与 SVG 点位（点位从真实 CSV 第一条数据行推出）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { iconSvg, buildIco, readIco, pngSize, squirclePath } = require('../tools/icon-lib.js');
const { table } = require('./helpers/fixtures.js');

/** 只有签名 + IHDR 的最小 PNG 头（足够 pngSize/buildIco 读取宽高）。 */
function fakePng(w, h, extra) {
  const b = Buffer.alloc(33 + (extra || 0));
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

test('pngSize reads IHDR and rejects non-PNG', () => {
  assert.deepEqual(pngSize(fakePng(48, 48)), { width: 48, height: 48 });
  assert.throws(() => pngSize(Buffer.alloc(40)), /not a PNG/);
});

test('buildIco writes header, entries (256 → 0) and contiguous PNG payloads', () => {
  const sizes = [16, 32, 256];
  const pngs = sizes.map((s, i) => fakePng(s, s, i * 7));
  const ico = buildIco(pngs);
  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  assert.equal(ico.readUInt8(6 + 2 * 16), 0); // 256 写成 0
  const dir = readIco(ico);
  assert.deepEqual(dir.entries.map((e) => e.width), sizes);
  let expect = 6 + 16 * sizes.length;
  dir.entries.forEach((e, i) => {
    assert.equal(e.bitCount, 32);
    assert.equal(e.offset, expect);
    assert.equal(e.size, pngs[i].length);
    assert.ok(ico.subarray(e.offset, e.offset + e.size).equals(pngs[i]));
    expect += e.size;
  });
  assert.equal(ico.length, expect);
  assert.throws(() => buildIco([fakePng(512, 512)]), /256/);
});

const COLORS = { bg: '#000001', dot: '#000002', ring: '#000003' };
const filled = (svg) => (svg.match(/fill="#000002"/g) || []).length;
const rings = (svg) => (svg.match(/stroke="#000003"/g) || []).length;

test('icon SVG draws the first CSV row: filled = its dots, rings = the rest', () => {
  const dots = table[0].dots;
  const svg = iconSvg({ dots, colors: COLORS });
  assert.equal(filled(svg), dots.length);
  assert.equal(rings(svg), 6 - dots.length);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 256 256"/);
  const small = iconSvg({ dots, colors: COLORS, small: true });
  assert.equal(filled(small), dots.length);
  assert.equal(rings(small), 0); // 小尺寸不画空点
});

test('squircle path stays inside the canvas', () => {
  const nums = squirclePath(256, 10).match(/[\d.]+/g).map(Number);
  assert.ok(nums.every((v) => v >= 10 - 1e-6 && v <= 246 + 1e-6));
});
