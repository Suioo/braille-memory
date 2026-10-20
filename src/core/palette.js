/**
 * Material 3 风格配色：由种子色生成色调板（tone = CIELAB L*，0 黑 … 100 白），
 * 再按 M3 角色（primary / surface / outline …）取色。纯函数。
 * 说明：M3 官方用 HCT（CAM16 色相/彩度 + L*）；这里用 CIELAB 的色相/彩度近似，
 * 色调（L*）与官方一致，因此对比度规律相同。超出 sRGB 时降低彩度保持色相与色调。
 * 渲染进程：window.BMPalette；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPalette = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 可选种子色（默认 teal）。 */
  const SEEDS = Object.freeze({
    teal: '#2F6F8F',
    indigo: '#4F5BB5',
    green: '#3F7D4E',
    terracotta: '#B5603A',
  });
  const DEFAULT_SEED = 'teal';
  const ERROR_SEED = '#B3261E';

  // ---------- 颜色空间 ----------
  const E = 216 / 24389;
  const K = 24389 / 27;
  const WHITE = [0.95047, 1, 1.08883];

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex);
    if (!m) throw new Error('bad hex ' + hex);
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHex(rgb) {
    return '#' + rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const toLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const fromLin = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

  function rgbToLab(rgb) {
    const [r, g, b] = rgb.map(toLin);
    const xyz = [
      0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
      0.2126729 * r + 0.7151522 * g + 0.0721750 * b,
      0.0193339 * r + 0.1191920 * g + 0.9503041 * b,
    ];
    const f = xyz.map((v, i) => { const t = v / WHITE[i]; return t > E ? Math.cbrt(t) : (K * t + 16) / 116; });
    return [116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])];
  }
  /** Lab → 线性 sRGB（可能越界）。 */
  function labToLinear(L, a, b) {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const xr = fx ** 3 > E ? fx ** 3 : (116 * fx - 16) / K;
    const yr = L > K * E ? fy ** 3 : L / K;
    const zr = fz ** 3 > E ? fz ** 3 : (116 * fz - 16) / K;
    const [X, Y, Z] = [xr * WHITE[0], yr * WHITE[1], zr * WHITE[2]];
    return [
      3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z,
      -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z,
      0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z,
    ];
  }
  const inGamut = (lin) => lin.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

  /** 种子色的 LCh。 */
  function lch(hex) {
    const [L, a, b] = rgbToLab(hexToRgb(hex));
    return { L, C: Math.hypot(a, b), h: (Math.atan2(b, a) * 180 / Math.PI + 360) % 360 };
  }

  /**
   * 指定色相/彩度/色调的颜色；越界时二分降低彩度。
   * @returns {string} #RRGGBB
   */
  function toneColor(h, C, tone) {
    if (tone <= 0) return '#000000';
    if (tone >= 100) return '#FFFFFF';
    const rad = h * Math.PI / 180;
    const at = (c) => labToLinear(tone, c * Math.cos(rad), c * Math.sin(rad));
    let lin = at(C);
    if (!inGamut(lin)) {
      let lo = 0; let hi = C;
      for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; if (inGamut(at(mid))) lo = mid; else hi = mid; }
      lin = at(lo);
    }
    return rgbToHex(lin.map((v) => fromLin(Math.min(1, Math.max(0, v)))));
  }

  /** 色调板：tone → hex。 */
  const palette = (h, C) => (tone) => toneColor(h, C, tone);

  /** WCAG 相对亮度与对比度。 */
  function luminance(hex) {
    const [r, g, b] = hexToRgb(hex).map(toLin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contrast(a, b) {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  }

  /**
   * 生成配色方案（M3 Tonal Spot 规则的近似）。
   * @param {string} seedHex
   * @param {boolean} dark
   * @returns {Object<string,string>} 角色 → #RRGGBB
   */
  function scheme(seedHex, dark) {
    const s = lch(seedHex);
    const e = lch(ERROR_SEED);
    const P = palette(s.h, Math.min(Math.max(s.C, 36), 48));
    const S = palette(s.h, 16);
    const T = palette((s.h + 60) % 360, 28);
    const N = palette(s.h, 4);
    const NV = palette(s.h, 8);
    const R = palette(e.h, Math.max(e.C, 60));
    const pick = (light, darkTone) => (dark ? darkTone : light);
    return {
      primary: P(pick(40, 80)),
      onPrimary: P(pick(100, 20)),
      primaryContainer: P(pick(90, 30)),
      onPrimaryContainer: P(pick(10, 90)),
      secondary: S(pick(40, 80)),
      onSecondary: S(pick(100, 20)),
      secondaryContainer: S(pick(90, 30)),
      onSecondaryContainer: S(pick(10, 90)),
      tertiary: T(pick(40, 80)),
      onTertiary: T(pick(100, 20)),
      tertiaryContainer: T(pick(90, 30)),
      onTertiaryContainer: T(pick(10, 90)),
      error: R(pick(40, 80)),
      onError: R(pick(100, 20)),
      errorContainer: R(pick(90, 30)),
      onErrorContainer: R(pick(10, 90)),
      surface: N(pick(98, 6)),
      surfaceContainerLowest: N(pick(100, 4)),
      surfaceContainerLow: N(pick(96, 10)),
      surfaceContainer: N(pick(94, 12)),
      surfaceContainerHigh: N(pick(92, 17)),
      surfaceContainerHighest: N(pick(90, 22)),
      onSurface: N(pick(10, 90)),
      onSurfaceVariant: NV(pick(30, 80)),
      outline: NV(pick(50, 60)),
      outlineVariant: NV(pick(80, 30)),
      inverseSurface: N(pick(20, 90)),
      inverseOnSurface: N(pick(95, 20)),
    };
  }

  /** 角色名 → CSS 变量名（camelCase → --kebab-case）。 */
  const cssVar = (role) => '--' + role.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

  /**
   * 需要满足的对比度（WCAG 2.x）：正文 ≥ 4.5，控件/图形 ≥ 3。
   * [前景, 背景, 最低值, 用途]
   */
  const CONTRAST_PAIRS = [
    ['onSurface', 'surface', 4.5, '正文'],
    ['onSurface', 'surfaceContainerHigh', 4.5, '卡片正文'],
    ['onSurface', 'surfaceContainerHighest', 4.5, '卡片正文'],
    ['onSurfaceVariant', 'surface', 4.5, '次要文字'],
    ['onSurfaceVariant', 'surfaceContainer', 4.5, '导航标签'],
    ['onSurfaceVariant', 'surfaceContainerHigh', 4.5, '卡片次要文字'],
    ['primary', 'surface', 4.5, '文字按钮 / 强调文字'],
    ['primary', 'surfaceContainerHigh', 3, '凸起点（填充）'],
    ['onPrimary', 'primary', 4.5, '填充按钮文字 / 点内编号'],
    ['onPrimaryContainer', 'primaryContainer', 4.5, '选中标签'],
    ['onSecondaryContainer', 'secondaryContainer', 4.5, '色调按钮 / 选中芯片'],
    ['onTertiaryContainer', 'tertiaryContainer', 4.5, '第三色容器'],
    ['tertiary', 'surfaceContainerHigh', 3, '漏点虚线圈'],
    ['error', 'surfaceContainerHigh', 3, '多点外圈'],
    ['onErrorContainer', 'errorContainer', 4.5, '多点内编号 / 错误容器'],
    ['onError', 'error', 4.5, '错误按钮文字'],
    ['error', 'primary', 1, '多点外圈与命中点（仅记录）'],
    ['outline', 'surface', 3, '控件边框 / 禁用文字'],
    ['outline', 'surfaceContainerHigh', 3, '空点细圈'],
    ['onSurfaceVariant', 'secondaryContainer', 4.5, '导航选中指示'],
  ];

  /**
   * 玻璃风格参数（styles.css 通过 theme.js 写入的 --g-a / --g-blob 使用同一组数）。
   * 填充 = 浅色 surface-container-lowest / 深色 surface-container-high，不透明度 fillAlpha，叠在模糊后的背景上。
   */
  /** 玻璃参数：填充不透明度（浅色更通透，否则白底上白玻璃看不出质感）、无模糊时的兜底不透明度、背景色块强度。 */
  const GLASS = { fillAlpha: 0.6, fillAlphaLight: 0.48, fallbackAlpha: 0.94, blobLight: 0.42, blobDark: 0.34 };

  const mix = (top, bottom, a) => {
    const t = hexToRgb(top); const b = hexToRgb(bottom);
    return rgbToHex(t.map((v, i) => v * a + b[i] * (1 - a)));
  };

  /**
   * 玻璃表面可能出现的背景最不利点：纯 surface、各色块峰值、色块叠加处（背景模糊后不会比峰值更极端）。
   * @returns {{name:string, bg:string}[]} 填充（含透明度）合成后的底色
   */
  function glassBackdrops(sc, dark) {
    const a = dark ? GLASS.blobDark : GLASS.blobLight;
    const base = dark ? sc.surfaceContainerHigh : sc.surfaceContainerLowest;
    const spots = {
      surface: sc.surface,
      'blob-primary': mix(sc.primary, sc.surface, a),
      'blob-tertiary': mix(sc.tertiary, sc.surface, a),
      'blob-secondary': mix(sc.secondary, sc.surface, a),
      'blob-primary+tertiary (falloff overlap, each at half strength)': mix(sc.tertiary, mix(sc.primary, sc.surface, a / 2), a / 2),
    };
    return Object.entries(spots).map(([name, bg]) => ({ name, bg, fill: mix(base, bg, dark ? GLASS.fillAlpha : GLASS.fillAlphaLight) }));
  }

  return { GLASS, glassBackdrops, SEEDS, DEFAULT_SEED, hexToRgb, rgbToHex, rgbToLab, lch, toneColor, scheme, contrast, luminance, cssVar, CONTRAST_PAIRS };
});
