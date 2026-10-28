/**
 * 帧率探针（平台层，调试用）：设置 → 关于 → 「帧率探针」打开后，屏幕左上角出现一条小浮层（fps / 最差帧 / 掉帧数），
 * 按「复制报告」得到按页面 / 按动画归类的文字报告，发给开发者即可知道哪里在掉帧。关闭后不再有任何开销（rAF 循环停止）。
 * 统计逻辑在 core/frameprobe.js（有单元测试）；这里只管 rAF、long-animation-frame 采集和浮层。window.BMFrameProbe
 */
(function (root) {
  'use strict';
  const Core = root.BMFrameProbeCore;
  const doc = root.document;
  const probe = Core ? Core.createProbe() : null;
  let on = false;
  let raf = 0;
  let timer = null;
  let el = null;
  let line = null;
  let env = { meta: () => ({}), copy: () => Promise.resolve(false), toast: () => {} };
  let obs = null;
  const now = () => (root.performance ? root.performance.now() : Date.now());

  const frame = (t) => { raf = 0; if (!on) return; probe.frame(t); raf = root.requestAnimationFrame(frame); };
  function paint() {
    if (!line) return;
    const s = probe.summary();
    line.textContent = s.fps + ' fps · 最差 ' + s.worst + ' ms · 掉帧 ' + s.drops + (s.longs ? ' · 长帧 ' + s.longs : '');
    el.dataset.state = s.drops > s.frames * 0.1 || s.longs ? 'bad' : s.drops > 0 ? 'warn' : 'ok';
  }
  function build() {
    el = doc.createElement('div');
    el.className = 'fp-overlay';
    el.setAttribute('role', 'status');
    line = doc.createElement('span');
    const mkBtn = (text, fn) => { const b = doc.createElement('button'); b.type = 'button'; b.className = 'fp-btn'; b.textContent = text; b.addEventListener('click', fn); return b; };
    el.append(line,
      mkBtn('复制报告', async () => { const ok = await env.copy(probe.report(env.meta())); env.toast(ok ? '已复制报告' : '复制失败'); }),
      mkBtn('清零', () => { probe.reset(); paint(); }));
    doc.body.append(el);
  }
  function startObserver() {
    try {
      if (!root.PerformanceObserver || !(root.PerformanceObserver.supportedEntryTypes || []).includes('long-animation-frame')) return;
      obs = new root.PerformanceObserver((list) => { for (const e of list.getEntries()) probe.addLoaf({ duration: e.duration, blockingDuration: e.blockingDuration, startTime: e.startTime, scripts: e.scripts ? Array.from(e.scripts) : [] }); });
      obs.observe({ type: 'long-animation-frame', buffered: false });
    } catch (_) { obs = null; }
  }

  root.BMFrameProbe = {
    /** e：{meta(): {version, style, theme, …}, copy(text): Promise<boolean>, toast(text)} */
    init(e) { if (e) env = Object.assign(env, e); },
    get enabled() { return on; },
    set(v) {
      v = !!v;
      if (!probe || v === on) return;
      on = v;
      if (on) {
        probe.reset();
        build(); paint();
        startObserver();
        raf = root.requestAnimationFrame(frame);
        timer = root.setInterval(paint, 500);
      } else {
        if (raf) root.cancelAnimationFrame(raf);
        raf = 0;
        if (timer) root.clearInterval(timer);
        timer = null;
        if (obs) { try { obs.disconnect(); } catch (_) { /* 忽略 */ } obs = null; }
        if (el) { el.remove(); el = null; line = null; }
      }
    },
    scene(label) { if (on) probe.scene(label); },
    tag(label, ms) { if (on) probe.tag(label, now(), ms); },
  };
})(typeof self !== 'undefined' ? self : this);
