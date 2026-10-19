/**
 * 手柄操控（纯逻辑，不碰 DOM）：把手柄快照变成「动作事件」，并按屏幕位置就近选择下一个焦点。
 *  - 按键只认 Gamepad API 的 standard 布局，按**物理位置**命名：0 = 右侧四键里下方的（Xbox A / Switch B / PlayStation ×）= 确认，
 *    1 = 右边的（Xbox B / Switch A / PlayStation ○）= 返回，2 = 左边的 = X，3 = 上方的 = Y。三家手柄因此是同一个布局。
 *  - 方向 = 十字键（优先）或左摇杆（死区 0.5，按住约 400 ms 后每 120 ms 连发一次）。
 *  - 按住不重复触发（只在按下的瞬间产生 press）；刚连接 / 刚回到前台时已按着的键不算（resync）。
 * 渲染进程：window.BMPadNav；Node：require()（测试用）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPadNav = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** standard 布局的按键序号 → 动作名。12–15 是十字键（方向，另处理）。 */
  const ACTIONS = ['confirm', 'back', 'x', 'y', 'lb', 'rb', 'lt', 'rt', 'view', 'start', 'ls', 'rs', 'up', 'down', 'left', 'right', 'home'];
  const DPAD = { 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
  const BUTTON_COUNT = ACTIONS.length;
  const DEFAULTS = Object.freeze({ dead: 0.5, firstDelayMs: 400, repeatMs: 120 });

  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

  /**
   * Gamepad 对象 → 统一快照 { key, id, buttons: bool[17], axes: [lx, ly, rx, ry] }。
   * 不是 standard 布局（浏览器不认识的手柄）返回 null：键位不可知，宁可不响应也不乱操作。
   */
  function fromGamepad(gp) {
    if (!gp || gp.connected === false || gp.mapping !== 'standard') return null;
    const buttons = [];
    for (let i = 0; i < BUTTON_COUNT; i++) {
      const b = gp.buttons && gp.buttons[i];
      buttons.push(!!(b && (b.pressed || num(b.value) > 0.5)));
    }
    const a = gp.axes || [];
    return { key: gp.index + ':' + gp.id, id: String(gp.id || ''), buttons, axes: [num(a[0]), num(a[1]), num(a[2]), num(a[3])] };
  }

  /** 安卓原生事件（按键位掩码 + 摇杆）→ 同样的快照。bit i = standard 的第 i 个键。 */
  function fromNative(ev) {
    if (!ev) return null;
    const mask = ev.b | 0;
    const buttons = [];
    for (let i = 0; i < BUTTON_COUNT; i++) buttons.push(((mask >> i) & 1) === 1);
    return { key: 'n:' + ev.id, id: String(ev.name || ev.id), buttons, axes: [num(ev.lx), num(ev.ly), num(ev.rx), num(ev.ry)] };
  }

  /** 摇杆方向：主轴 ≥ 死区才算；已经在某方向上时，只要那一轴还过死区且没被另一轴明显压过就保持（避免斜推时来回跳）。 */
  function stickDir(x, y, prev, dead) {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const of = (horizontal) => (horizontal ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down'));
    if (prev) {
      const h = prev === 'left' || prev === 'right';
      const major = h ? ax : ay;
      const minor = h ? ay : ax;
      if (of(h) === prev && major >= dead && major * 1.5 >= minor) return prev;
    }
    if (Math.max(ax, ay) < dead) return null;
    return of(ax >= ay);
  }

  /** 当前这一帧的方向：十字键优先（上下相抵 = 无），否则看左摇杆。 */
  function dirOf(pad, prev, dead) {
    const b = pad.buttons;
    const v = (b[12] ? 1 : 0) - (b[13] ? 1 : 0);
    const h = (b[14] ? 1 : 0) - (b[15] ? 1 : 0);
    if (b[12] || b[13] || b[14] || b[15]) {
      const keep = prev && ((prev === 'up' && b[12]) || (prev === 'down' && b[13]) || (prev === 'left' && b[14]) || (prev === 'right' && b[15]));
      if (keep) return prev;
      if (v) return v > 0 ? 'up' : 'down';
      if (h) return h > 0 ? 'left' : 'right';
      return null;
    }
    return stickDir(pad.axes[0], pad.axes[1], prev, dead);
  }

  /**
   * 手柄输入状态机。
   * update(pads, t)：喂入当前所有手柄的快照，返回这一帧产生的事件：
   *   { type: 'press', action, pad } —— 某键刚按下（边沿）；
   *   { type: 'dir', dir: 'up'|'down'|'left'|'right', repeat: boolean, pad } —— 方向首次按下或连发（一帧最多一次，不补发积压）。
   * resync(pads, t)：把当前状态当作「已经按着」，不产生事件，也不连发（窗口回到前台、刚连接时用）。
   * 多个手柄各自独立，任何一个都能操作。
   */
  function createPadInput(options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    const states = new Map();
    const fresh = (pad, t) => ({ prev: pad.buttons.slice(), dir: dirOf(pad, null, o.dead), next: t, armed: false });

    function update(pads, t) {
      const events = [];
      const seen = new Set();
      for (const pad of pads || []) {
        if (!pad) continue;
        seen.add(pad.key);
        let st = states.get(pad.key);
        if (!st) { states.set(pad.key, fresh(pad, t)); continue; } // 刚出现：已按着的不算
        for (let i = 0; i < BUTTON_COUNT; i++) {
          if (DPAD[i]) continue;
          if (pad.buttons[i] && !st.prev[i]) events.push({ type: 'press', action: ACTIONS[i], pad: pad.key });
        }
        const d = dirOf(pad, st.dir, o.dead);
        if (d !== st.dir) {
          st.dir = d;
          st.armed = !!d;
          if (d) { events.push({ type: 'dir', dir: d, repeat: false, pad: pad.key }); st.next = t + o.firstDelayMs; }
        } else if (d && st.armed && t >= st.next) {
          events.push({ type: 'dir', dir: d, repeat: true, pad: pad.key });
          st.next = t + o.repeatMs; // 从现在重新计时，不补发错过的次数
        }
        st.prev = pad.buttons.slice();
      }
      for (const k of Array.from(states.keys())) if (!seen.has(k)) states.delete(k);
      return events;
    }

    function resync(pads, t) {
      states.clear();
      for (const pad of pads || []) if (pad) states.set(pad.key, fresh(pad, t));
    }

    return {
      update, resync,
      reset() { states.clear(); },
      /** 有手柄正按着方向（需要继续按帧推进来产生连发）。 */
      get holding() { for (const s of states.values()) if (s.dir && s.armed) return true; return false; },
      get count() { return states.size; },
    };
  }

  /**
   * 按屏幕位置就近选择：从 from 出发，往 dir 方向找最近的候选。
   * 矩形 { left, top, right, bottom }；候选 { id, rect }。方向上「前进量」必须 > 0（中心在该方向一侧），
   * 评分 = 沿方向的边缘间距 + 2 × 垂直方向的间距（有重叠为 0）+ 0.3 × 中心的垂直偏移，取最小；
 * 垂直偏移超过前进量 2 倍且不重叠的候选先排除（上下方向在没有别的候选时才放宽）。
   * @returns {*} 候选的 id；没有就 null
   */
  function pickNext(from, cands, dir, skipId) {
    const horizontal = dir === 'left' || dir === 'right';
    const sign = dir === 'right' || dir === 'down' ? 1 : -1;
    const lo = (r) => (horizontal ? r.left : r.top);
    const hi = (r) => (horizontal ? r.right : r.bottom);
    const clo = (r) => (horizontal ? r.top : r.left);
    const chi = (r) => (horizontal ? r.bottom : r.right);
    const mid = (r) => (lo(r) + hi(r)) / 2;
    const cmid = (r) => (clo(r) + chi(r)) / 2;
    const search = (cone) => {
      let best = null;
      let bestScore = Infinity;
      for (const c of cands) {
        if (c.id === skipId || !c.rect) continue;
        const forward = (mid(c.rect) - mid(from)) * sign;
        if (forward <= 0.5) continue;
        const gap = sign > 0 ? lo(c.rect) - hi(from) : lo(from) - hi(c.rect);
        const cross = Math.max(0, clo(c.rect) - chi(from), clo(from) - chi(c.rect));
        const off = Math.abs(cmid(c.rect) - cmid(from));
        // 锥形限制：垂直方向上错得太远（> 前进量的 2 倍）又没有重叠的，不算「这个方向上的」，免得右边没有了却跳到另一行去
        if (cone && cross > 0 && off > forward * 2) continue;
        const score = Math.max(0, gap) + 2 * cross + 0.3 * off + forward * 0.001;
        if (score < bestScore) { bestScore = score; best = c.id; }
      }
      return best;
    };
    const hit = search(true);
    // 上下方向在锥内没有时放宽（长列表里要能一路按下去）；左右不放宽
    return hit != null || horizontal ? hit : search(false);
  }

  /** 在 n 项里从 cur 走 delta 步；wrap = 循环，否则停在两端。无变化返回 cur。 */
  function cycle(n, cur, delta, wrap) {
    if (!(n > 0)) return cur;
    const j = cur + delta;
    if (wrap) return ((j % n) + n) % n;
    return Math.min(n - 1, Math.max(0, j));
  }

  return { ACTIONS, BUTTON_COUNT, DEFAULTS, fromGamepad, fromNative, stickDir, dirOf, createPadInput, pickNext, cycle };
});
