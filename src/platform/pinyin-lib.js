/**
 * 拼音库懒加载：第一次需要自动标注时才加载 vendor/pinyin-pro.js（约 320KB），之后复用。
 * 加载失败（文件缺失 / 被拦）返回 null，调用方提示「自动标注不可用」，仍可手动输入拼音。
 * 渲染进程：window.BMPinyinLib.load()
 */
(function (root) {
  'use strict';
  let pending = null;

  let words = [];
  /** 设置额外的已知词（规则例词等），用于分词时合并被拆开的词。 */
  function setWords(list) { words = Array.isArray(list) ? list : []; }

  /** @returns {Promise<{segment:Function}|null>} */
  function load() {
    if (pending) return pending.then((ok) => (ok ? root.BMPinyinProvider.createProvider(root.pinyinPro, { words }) : null));
    pending = new Promise((resolve) => {
      const done = () => resolve(!!(root.pinyinPro && root.BMPinyinProvider));
      if (root.pinyinPro) return done();
      try {
        const s = root.document.createElement('script');
        s.src = 'vendor/pinyin-pro.js';
        s.onload = done;
        s.onerror = () => { s.remove(); pending = null; resolve(null); };
        root.document.head.append(s);
      } catch (_) { pending = null; resolve(null); }
    });
    return load();
  }

  root.BMPinyinLib = { load, setWords };
})(typeof self !== 'undefined' ? self : this);
