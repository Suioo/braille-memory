/**
 * 拼音库懒加载：第一次需要自动标注时才加载 vendor/pinyin-pro.js（约 320KB），之后复用。
 * 加载失败（文件缺失 / 被拦）返回 null，调用方提示「自动标注不可用」，仍可手动输入拼音。
 * 渲染进程：window.BMPinyinLib.load()
 */
(function (root) {
  'use strict';
  let pending = null;

  /** @returns {Promise<{segment:Function}|null>} */
  function load() {
    if (pending) return pending;
    pending = new Promise((resolve) => {
      const done = () => {
        try { resolve(root.pinyinPro && root.BMPinyinProvider ? root.BMPinyinProvider.createProvider(root.pinyinPro) : null); } catch (_) { resolve(null); }
      };
      if (root.pinyinPro) return done();
      try {
        const s = root.document.createElement('script');
        s.src = 'vendor/pinyin-pro.js';
        s.onload = done;
        s.onerror = () => { s.remove(); pending = null; resolve(null); };
        root.document.head.append(s);
      } catch (_) { pending = null; resolve(null); }
    });
    return pending;
  }

  root.BMPinyinLib = { load };
})(typeof self !== 'undefined' ? self : this);
