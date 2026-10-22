/**
 * 华丽动效（单一模块）：全部入口经 active() 把关——设置关闭或系统「减少动态效果」时一律不碰 DOM。
 * 不循环、不抖动、不闪屏、无水滴/涟漪；每个效果都有上限时长，结束后清理；换页时 cancel()。
 * 效果：
 *   burst  答对：canvas 粒子迸发（20–40 粒，初速 + 重力 + 阻力 + 淡出，≤ 900 ms）+ 方格外一圈柔光（单次）+ 凸起点挤压回弹；
 *   squash 凸起点挤压-拉伸弹跳；ring 单次柔光圈；bump 数字弹跳；lift 翻卡抬起；
 *   popStars 过关星依次弹出 + 小彩纸；countUp 里程表式数字滚动（结束时恢复精确原文）。
 * 粒子物理与里程表列是纯函数（step / spawn / odoCells），可在 Node 中测试。
 * CSS 部分由 <html class="fx-on"> 开关，见 sync()。渲染进程：window.BMFx；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMFx = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const G = typeof self !== 'undefined' ? self : globalThis;

  const MAX_MS = 900;          // 粒子最长寿命
  const GRAVITY = 1100;        // px/s²
  const DRAG = 2.4;            // 1/s，速度按 exp(-DRAG·dt) 衰减
  const BURST_MIN = 20;
  const BURST_MAX = 40;
  const ODO_MS = 760;
  const FALLBACK_COLORS = ['#00668A', '#7A5A9A', '#4A6B7A', '#B8E4FF'];

  /**
   * 生成粒子（纯函数，随机数由调用方注入）。
   * @param {number} n 粒子数
   * @param {() => number} rand 返回 [0,1)
   * @param {string[]} colors 调色板
   * @param {{x:number,y:number,spread?:number,speed?:number,confetti?:boolean}} o
   */
  function spawn(n, rand, colors, o) {
    const out = [];
    const spread = o.spread == null ? 10 : o.spread;
    const speed = o.speed || 1;
    for (let i = 0; i < n; i++) {
      const a = rand() * Math.PI * 2;
      const sp = (160 + rand() * 340) * speed;
      const life = 520 + rand() * (MAX_MS - 520);
      out.push({
        x: o.x + Math.cos(a) * spread * rand(), y: o.y + Math.sin(a) * spread * rand(),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120 * speed,
        r: 2 + rand() * 4.5, // 2–6.5 px：大小不一
        life, age: 0,
        c: colors[Math.floor(rand() * colors.length) % colors.length],
        rot: rand() * Math.PI, vr: (rand() - 0.5) * 12,
        rect: !!o.confetti && rand() < 0.7,
      });
    }
    return out;
  }

  /**
   * 推进一个粒子 dt 秒（纯函数，原地修改）：阻力 → 重力 → 位移。
   * @returns {number} 当前不透明度 0..1（寿命后 40% 线性淡出；寿命到则 0）
   */
  function step(p, dt) {
    const k = Math.exp(-DRAG * dt);
    p.vx *= k;
    p.vy = p.vy * k + GRAVITY * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    p.age += dt * 1000;
    const t = p.age / p.life;
    if (t >= 1) return 0;
    return t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
  }

  /**
   * 里程表列：数字 d 的那一列依次显示 0..9 再滚到 d（共 10 + d + 1 格）。
   * @returns {number[]}
   */
  function odoCells(d) {
    const cells = [];
    for (let i = 0; i <= 9; i++) cells.push(i);
    for (let i = 0; i <= d; i++) cells.push(i);
    return cells;
  }

  /**
   * @param {object} env
   * @param {Document} env.doc
   * @param {() => boolean} env.enabled 设置开关
   * @param {() => boolean} [env.reduced] 系统减少动态效果
   * @param {(fn: Function) => any} [env.raf]
   * @param {(fn: Function, ms: number) => any} [env.later]
   * @param {() => {w:number,h:number,dpr:number}} [env.view]
   * @param {() => string[]} [env.colors] 调色板（种子色派生）
   * @param {() => number} [env.rand]
   * @param {() => number} [env.now] 毫秒
   */
  function create(env) {
    const doc = env.doc;
    const raf = env.raf || ((fn) => requestAnimationFrame(fn));
    const later = env.later || ((fn, ms) => setTimeout(fn, ms));
    const rand = env.rand || Math.random;
    const now = env.now || (() => performance.now());
    const reduced = env.reduced || (() => false);
    const view = env.view || (() => ({ w: G.innerWidth || 400, h: G.innerHeight || 800, dpr: Math.min(2, G.devicePixelRatio || 1) }));
    const active = () => {
      try { return !!env.enabled() && !reduced() && !!doc; } catch (_) { return false; }
    };
    const palette = () => {
      try {
        const c = env.colors ? env.colors() : null;
        if (c && c.length) return c;
        const cs = G.getComputedStyle(doc.documentElement);
        const list = ['--primary', '--tertiary', '--secondary', '--primary-container'].map((v) => cs.getPropertyValue(v).trim()).filter(Boolean);
        return list.length ? list : FALLBACK_COLORS;
      } catch (_) { return FALLBACK_COLORS; }
    };

    const mk = (cls) => { const e = doc.createElement('div'); e.className = cls; return e; };
    const reflow = (el) => { void el.offsetWidth; };

    // ---- 单一 canvas + 单一 rAF 循环：没有粒子就停并移除 ----
    let canvas = null;
    let ctx2d = null;
    let parts = [];
    let running = false;
    let last = 0;
    const layers = new Set();

    function stopCanvas() {
      parts = [];
      running = false;
      if (canvas && canvas.remove) canvas.remove();
      canvas = null; ctx2d = null;
    }
    function frame() {
      if (!running || !ctx2d) return;
      const t = now();
      const dt = Math.min(0.05, Math.max(0.001, (t - last) / 1000));
      last = t;
      const v = view();
      ctx2d.clearRect(0, 0, v.w, v.h);
      const alive = [];
      for (const p of parts) {
        const a = step(p, dt);
        if (a <= 0) continue;
        alive.push(p);
        ctx2d.globalAlpha = a;
        ctx2d.fillStyle = p.c;
        if (p.rect) {
          ctx2d.save(); ctx2d.translate(p.x, p.y); ctx2d.rotate(p.rot);
          ctx2d.fillRect(-p.r, -p.r * 0.55, p.r * 2, p.r * 1.1);
          ctx2d.restore();
        } else {
          ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.r * (0.6 + 0.4 * a), 0, Math.PI * 2); ctx2d.fill();
        }
      }
      ctx2d.globalAlpha = 1;
      parts = alive;
      if (parts.length) raf(frame); else stopCanvas();
    }
    function emit(list) {
      if (!list.length) return;
      if (!canvas) {
        const v = view();
        canvas = doc.createElement('canvas');
        canvas.className = 'fx-canvas';
        canvas.width = Math.round(v.w * v.dpr);
        canvas.height = Math.round(v.h * v.dpr);
        canvas.setAttribute('aria-hidden', 'true');
        ctx2d = canvas.getContext('2d');
        if (ctx2d && ctx2d.scale) ctx2d.scale(v.dpr, v.dpr);
        doc.body.append(canvas);
      }
      parts.push(...list);
      if (!running) { running = true; last = now(); raf(frame); }
    }
    const centerOf = (els) => {
      let x = 0; let y = 0;
      for (const d of els) { const r = d.getBoundingClientRect(); x += r.left + r.width / 2; y += r.top + r.height / 2; }
      return { x: x / els.length, y: y / els.length };
    };

    const api = {
      active,
      /** 把「开」状态写到 <html>，供 CSS 使用。 */
      sync() {
        if (!doc || !doc.documentElement) return;
        doc.documentElement.classList.toggle('fx-on', active());
      },
      /** 换页 / 关闭时：立即清掉粒子、光圈等所有进行中的东西。 */
      cancel() {
        stopCanvas();
        for (const l of layers) l.remove();
        layers.clear();
      },
      /** 答对：粒子迸发 + 柔光圈 + 点挤压回弹。 */
      burst(dotEls) {
        if (!active() || !dotEls || !dotEls.length) return false;
        const els = [...dotEls];
        const c = centerOf(els);
        const n = Math.max(BURST_MIN, Math.min(BURST_MAX, 16 + els.length * 4));
        emit(spawn(n, rand, palette(), { x: c.x, y: c.y, spread: 24 }));
        api.ring(els[0].closest ? els[0].closest('.cell-card') : null);
        api.squash(els);
        return true;
      },
      /** 方格外单次柔光圈（扩大 + 淡出，不循环）。 */
      ring(card) {
        if (!active() || !card || !card.getBoundingClientRect) return false;
        const r = card.getBoundingClientRect();
        const layer = mk('fx-layer');
        const ring = mk('fx-ring');
        ring.style.left = r.left + 'px'; ring.style.top = r.top + 'px';
        ring.style.width = r.width + 'px'; ring.style.height = r.height + 'px';
        try { ring.style.borderRadius = G.getComputedStyle(card).borderRadius; } catch (_) { /* 默认圆角 */ }
        layer.append(ring);
        doc.body.append(layer);
        layers.add(layer);
        later(() => { layer.remove(); layers.delete(layer); }, 820);
        return true;
      },
      /** 凸起点挤压-拉伸弹跳（依次，错开 45 ms）。 */
      squash(dotEls) {
        if (!active() || !dotEls || !dotEls.length) return false;
        const list = [...dotEls];
        list.forEach((d, i) => {
          d.style.setProperty('--d', (i * 45) + 'ms');
          d.classList.remove('fx-squash');
          reflow(d);
          d.classList.add('fx-squash');
        });
        later(() => { for (const d of list) d.classList.remove('fx-squash'); }, 420 + list.length * 45 + 40);
        return true;
      },
      /**
       * 答对的整体反馈（只用变换，不改排版，约 0.7 s）：点阵卡弹一下并扩出一圈光、题目符号上跳落回、对勾弹出、进度条闪一下。
       * @param {HTMLElement} body 题目区（.q-body）；动画挂在它所在的页面上
       */
      cheer(body) {
        if (!active() || !body) return false;
        const page = body.closest('.page') || body;
        page.classList.remove('fx-cheer');
        reflow(page);
        page.classList.add('fx-cheer');
        later(() => page.classList.remove('fx-cheer'), 800);
        return true;
      },
      /** 只对数字本身：缩放 + 颜色闪一下（360 ms）。 */
      bump(el) {
        if (!active() || !el) return false;
        el.classList.remove('fx-bump');
        reflow(el);
        el.classList.add('fx-bump');
        later(() => el.classList.remove('fx-bump'), 420);
        return true;
      },
      /** 翻卡时轻微抬起：卡片（.card-inner）放大到约 1.03 + 面的阴影加深，翻完回落；全部挂在卡片自身上，结束即清理。 */
      lift(card) {
        if (!active() || !card) return false;
        card.classList.remove('fx-lift');
        reflow(card);
        card.classList.add('fx-lift');
        later(() => card.classList.remove('fx-lift'), 700);
        return true;
      },
      /** 过关星依次弹出（CSS），每颗落定时一小团彩纸。 */
      popStars(starsEl) {
        if (!active() || !starsEl) return false;
        starsEl.classList.add('fx-pop');
        const stars = starsEl.querySelectorAll ? [...starsEl.querySelectorAll('i.on')] : [];
        stars.forEach((s, i) => later(() => {
          if (!active() || !starsEl.isConnected) return;
          const r = s.getBoundingClientRect();
          emit(spawn(12, rand, palette(), { x: r.left + r.width / 2, y: r.top + r.height / 2, spread: 6, speed: 0.7, confetti: true }));
        }, 240 * i + 200));
        return true;
      },
      /** 结果数字里程表式滚动：每位数字一列自下滚到目标；结束（或换页）时恢复精确原文。 */
      countUp(el) {
        if (!active() || !el) return false;
        const text = el.textContent;
        const m = /\d+/.exec(text);
        if (!m || !(Number(m[0]) > 0)) return false;
        const digits = m[0].split('').map(Number);
        el.setAttribute('aria-label', text);
        el.replaceChildren();
        el.append(doc.createTextNode(text.slice(0, m.index)));
        const strips = digits.map((d, i) => {
          const col = doc.createElement('span');
          col.className = 'fx-odo-col';
          const strip = doc.createElement('span');
          strip.className = 'fx-odo-strip';
          strip.setAttribute('aria-hidden', 'true');
          for (const c of odoCells(d)) {
            const cell = doc.createElement('span');
            cell.textContent = String(c);
            strip.append(cell);
          }
          strip.style.transitionDuration = (ODO_MS - (digits.length - 1 - i) * 90) + 'ms';
          col.append(strip);
          el.append(col);
          return { strip, to: 10 + d };
        });
        el.append(doc.createTextNode(text.slice(m.index + m[0].length)));
        reflow(el);
        for (const s of strips) s.strip.style.transform = 'translateY(-' + s.to + 'em)';
        later(() => { el.textContent = text; el.removeAttribute('aria-label'); }, ODO_MS + 60);
        return true;
      },
    };
    return api;
  }

  return { create, spawn, step, odoCells, MAX_MS, BURST_MIN, BURST_MAX, ODO_MS, GRAVITY, DRAG };
});
