/**
 * 把 M3 配色写入 CSS 变量（CSSOM，符合 CSP），跟随系统深浅色变化。
 * window.BMTheme
 */
(function (root) {
  'use strict';
  const Pal = root.BMPalette;
  const mq = root.matchMedia('(prefers-color-scheme: dark)');
  let seedName = Pal.DEFAULT_SEED;
  let styleName = 'material';
  let forced = null; // Web/Capacitor 手动主题：'light' | 'dark' | null（跟随系统）

  /** 当前是否深色。 */
  const isDark = () => (forced ? forced === 'dark' : mq.matches);

  function update() {
    const dark = isDark();
    const sc = Pal.scheme(Pal.SEEDS[seedName] || Pal.SEEDS[Pal.DEFAULT_SEED], dark);
    const st = document.documentElement.style;
    for (const [role, hex] of Object.entries(sc)) st.setProperty(Pal.cssVar(role), hex);
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    document.documentElement.dataset.seed = seedName;
    document.documentElement.dataset.style = styleName;
    const g = Pal.GLASS;
    st.setProperty('--g-a', String(dark ? g.fillAlpha : g.fillAlphaLight));
    st.setProperty('--g-a-fallback', String(g.fallbackAlpha));
    st.setProperty('--g-blob', String(dark ? g.blobDark : g.blobLight));
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    if (root.bm && typeof root.bm.syncSystemBars === 'function') root.bm.syncSystemBars();
  }

  /** 强制深浅色（Electron 用 nativeTheme，不需要；Web/Capacitor 用这个）。 */
  function setMode(mode) {
    forced = mode === 'light' || mode === 'dark' ? mode : null;
    update();
  }

  /** 设置种子色名并应用。 */
  function setSeed(name) {
    seedName = Pal.SEEDS[name] ? name : Pal.DEFAULT_SEED;
    update();
  }

  /** 视觉风格：'material' | 'glass'（只切换 <html data-style>，DOM 不变）。 */
  function setStyle(name) {
    styleName = name === 'glass' ? 'glass' : 'material';
    update();
  }

  /** 某个种子在当前深浅色下的 primary（用于颜色选择圆点）。 */
  const swatch = (name) => Pal.scheme(Pal.SEEDS[name], isDark()).primary;

  mq.addEventListener('change', update);
  update();
  root.BMTheme = { setSeed, setStyle, setMode, update, isDark, swatch };
})(typeof self !== 'undefined' ? self : this);
