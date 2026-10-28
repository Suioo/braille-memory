/**
 * 帧率探针（纯逻辑，不碰 DOM）：喂入每一帧的时间戳，统计帧间隔分布、掉帧、按「场景」归类，并生成可复制的文字报告。
 * 场景 = 当前页面名（切页时设置）+ 临时标签（tag：如「转场」「答对动画」在一小段时间内覆盖页面名），
 * 这样能看出是哪个页面 / 哪个动画在掉帧。平台层（platform/frame-probe.js）负责 rAF 循环、悬浮显示和 long-animation-frame 采集。
 * 渲染进程：window.BMFrameProbe 的核心 BMFrameProbeCore；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMFrameProbeCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_GAP_MS = 1000; // 超过这个间隔（后台、休眠）不算一帧
  const BIN = 1; // 直方图桶宽 ms
  const BINS = 400; // 0..400 ms，更大的记进最后一桶
  const LONG_MS = 50;
  const FREEZE_MS = 200;

  const round1 = (v) => Math.round(v * 10) / 10;

  function newBucket() { return { frames: 0, sum: 0, worst: 0, drops: 0, longs: 0, freezes: 0 }; }

  /** @param {{maxWorst?:number, maxLoaf?:number}} [opts] */
  function createProbe(opts) {
    const o = Object.assign({ maxWorst: 8, maxLoaf: 8 }, opts || {});
    let last = null;
    let base = '';
    let tagLabel = '';
    let tagUntil = -Infinity;
    const hist = new Uint32Array(BINS + 1);
    const all = newBucket();
    const scenes = new Map();
    let worst = [];
    let loaf = [];
    let startedAt = null;
    let lastT = 0;

    const refresh = () => { // 刷新间隔估计：直方图的中位数（至少 4 ms）
      if (!all.frames) return 16.7;
      let acc = 0;
      const half = all.frames / 2;
      for (let i = 0; i <= BINS; i++) { acc += hist[i]; if (acc >= half) return Math.max(4, (i + 0.5) * BIN); }
      return 16.7;
    };
    const percentile = (p) => {
      if (!all.frames) return 0;
      let acc = 0;
      const need = all.frames * p;
      for (let i = 0; i <= BINS; i++) { acc += hist[i]; if (acc >= need) return (i + 0.5) * BIN; }
      return BINS * BIN;
    };
    const sceneAt = (t) => (t < tagUntil && tagLabel ? tagLabel : base || '-');
    const bump = (b, dt, ref) => {
      b.frames++; b.sum += dt; if (dt > b.worst) b.worst = dt;
      if (dt > ref * 1.5) b.drops++;
      if (dt > LONG_MS) b.longs++;
      if (dt > FREEZE_MS) b.freezes++;
    };

    return {
      /** 每一帧调用（requestAnimationFrame 的时间戳）。 */
      frame(t) {
        if (startedAt === null) startedAt = t;
        lastT = t;
        if (last === null) { last = t; return; }
        const dt = t - last;
        last = t;
        if (!(dt > 0) || dt > MAX_GAP_MS) return;
        hist[Math.min(BINS, Math.floor(dt / BIN))]++;
        const ref = refresh();
        const label = sceneAt(t);
        bump(all, dt, ref);
        let sc = scenes.get(label);
        if (!sc) { sc = newBucket(); scenes.set(label, sc); }
        bump(sc, dt, ref);
        if (dt > ref * 1.5 && dt > 20) {
          worst.push({ dt: round1(dt), scene: label, at: Math.round(t - startedAt) });
          worst.sort((a, b) => b.dt - a.dt);
          if (worst.length > o.maxWorst) worst.length = o.maxWorst;
        }
      },
      /** 页面名（切页时设置）。 */
      scene(label) { base = String(label || ''); },
      /** 临时标签：t0 起 ms 毫秒内覆盖页面名（如「转场」「答对动画」）。 */
      tag(label, t0, ms) { tagLabel = String(label || ''); tagUntil = t0 + ms; },
      /** 一条 long-animation-frame 记录（Chromium 123+）：只留最长的几条。 */
      addLoaf(e) {
        if (!e || !(e.duration > 0)) return;
        const s = (e.scripts || [])[0] || {};
        loaf.push({ duration: Math.round(e.duration), blocking: Math.round(e.blockingDuration || 0), scene: sceneAt(e.startTime || lastT), src: String(s.sourceURL || s.invoker || '').replace(/^.*\//, '').slice(0, 60), fn: String(s.sourceFunctionName || s.invoker || '').slice(0, 60) });
        loaf.sort((a, b) => b.duration - a.duration);
        if (loaf.length > o.maxLoaf) loaf.length = o.maxLoaf;
      },
      reset() {
        last = null; startedAt = null; hist.fill(0);
        Object.assign(all, newBucket()); scenes.clear(); worst = []; loaf = [];
      },
      /** 悬浮显示用的摘要。 */
      summary() {
        const ref = refresh();
        return { frames: all.frames, refreshMs: round1(ref), fps: all.sum ? Math.round(1000 * all.frames / all.sum) : 0, p95: round1(percentile(0.95)), p99: round1(percentile(0.99)), worst: round1(all.worst), drops: all.drops, longs: all.longs, freezes: all.freezes };
      },
      /** 可复制的文字报告。meta：{version, style, theme, ua, dpr, size}。 */
      report(meta) {
        const m = meta || {};
        const s = this.summary();
        const pct = (a, b) => (b ? Math.round((100 * a) / b) + '%' : '0%');
        const lines = [];
        lines.push('帧率探针报告' + (m.version ? ' · v' + m.version : ''));
        lines.push([m.style && '风格 ' + m.style, m.theme && '主题 ' + m.theme, m.size && '窗口 ' + m.size, m.dpr && 'DPR ' + m.dpr].filter(Boolean).join(' · '));
        if (m.ua) lines.push(String(m.ua).slice(0, 140));
        lines.push('');
        lines.push('总计 ' + s.frames + ' 帧 · 刷新间隔约 ' + s.refreshMs + ' ms · 平均 ' + s.fps + ' fps');
        lines.push('P95 ' + s.p95 + ' ms · P99 ' + s.p99 + ' ms · 最差 ' + s.worst + ' ms');
        lines.push('掉帧(>1.5×刷新间隔) ' + s.drops + '（' + pct(s.drops, s.frames) + '）· 长帧(>' + LONG_MS + ' ms) ' + s.longs + ' · 冻结(>' + FREEZE_MS + ' ms) ' + s.freezes);
        lines.push('');
        lines.push('按场景（帧数 / 掉帧 / 长帧 / 最差 ms / 平均 ms）：');
        const rows = Array.from(scenes.entries()).sort((a, b) => b[1].drops - a[1].drops || b[1].frames - a[1].frames);
        for (const [k, b] of rows) lines.push('  ' + k + '：' + b.frames + ' / ' + b.drops + ' / ' + b.longs + ' / ' + round1(b.worst) + ' / ' + round1(b.sum / Math.max(1, b.frames)));
        if (worst.length) {
          lines.push('');
          lines.push('最差的几帧（ms · 场景 · 距开始 ms）：');
          for (const w of worst) lines.push('  ' + w.dt + ' · ' + w.scene + ' · ' + w.at);
        }
        if (loaf.length) {
          lines.push('');
          lines.push('最长的几次渲染更新 long-animation-frame（总 ms / 阻塞 ms · 场景 · 来源）：');
          for (const l of loaf) lines.push('  ' + l.duration + ' / ' + l.blocking + ' · ' + l.scene + ' · ' + (l.src || '-') + (l.fn && l.fn !== l.src ? ' ' + l.fn : ''));
        }
        return lines.join('\n');
      },
    };
  }

  return { createProbe, MAX_GAP_MS, LONG_MS, FREEZE_MS };
});
