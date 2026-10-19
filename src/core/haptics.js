/**
 * 手柄震动的纯逻辑（不碰 DOM、不碰任何手柄 API；时间 / 定时器 / 手柄对象都由调用方注入，便于测试）：
 *  - 触感事件 → 震动参数：eventForKind（现有的触感种类 → 手柄事件）、buildPattern（事件 → 一串「马达步骤」，数值来自配置）；
 *  - createRunner：播放 / 限流 / 抢占（新的覆盖旧的，不排队），后台时 stop；
 *  - createPadTracker：从 navigator.getGamepads() 的快照里找出「最后一次有输入」的手柄；
 *  - padSupport：一个手柄对象能不能震、能不能震扳机。
 * 一个步骤 = { at 开始时刻(ms), duration(ms), strong 强马达 0..1, weak 弱马达 0..1, leftTrigger, rightTrigger 0..1 }。
 * 渲染进程：window.BMHapticsCore（手机震动适配是 BMHaptics）；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMHapticsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const clamp = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const mag = (v, d) => clamp(v, 0, 1, d);
  const ms = (v, d) => Math.round(clamp(v, 1, 2000, d));

  /** 现有触感种类 → 手柄事件。 */
  const EVENTS = ['tick', 'correct', 'wrong', 'streak', 'ramp'];

  /**
   * 现有的触感种类（ctx.haptic 的 kind）→ 手柄事件；不认识返回 null。
   *  tap / tick → tick（拖动经过一项 / 点位点亮）；correct → correct，连对（info.streak ≥ 2）→ streak；wrong → wrong；pass / record → ramp。
   * @param {string} kind
   * @param {{streak?:number}} [info]
   */
  function eventForKind(kind, info) {
    switch (kind) {
      case 'tap':
      case 'tick': return 'tick';
      case 'correct': return info && Number.isInteger(info.streak) && info.streak >= 2 ? 'streak' : 'correct';
      case 'wrong': return 'wrong';
      case 'pass':
      case 'record': return 'ramp';
      default: return null;
    }
  }

  /** 配置里手柄震动那一段，补默认值并限制范围（配置写错也不会出怪值）。 */
  function normalizeConfig(g) {
    g = g || {};
    const t = g.tick || {};
    const c = g.correct || {};
    const w = g.wrong || {};
    const r = g.ramp || {};
    const l = g.limits || {};
    return {
      tick: { durationMs: ms(t.durationMs, 20), weak: mag(t.weak, 0.35), strong: mag(t.strong, 0) },
      correct: { durationMs: ms(c.durationMs, 60), weak: mag(c.weak, 0.3), strong: mag(c.strong, 0.25), trigger: mag(c.trigger, 0.2) },
      wrong: { durationMs: ms(w.durationMs, 80), gapMs: ms(w.gapMs, 60), weak: mag(w.weak, 0.25), strong: mag(w.strong, 0.75) },
      ramp: { totalMs: ms(r.totalMs, 200), steps: Math.round(clamp(r.steps, 2, 10, 4)), from: mag(r.from, 0.2), to: mag(r.to, 0.9), strongShare: mag(r.strongShare, 0.8) },
      limits: { tickMinIntervalMs: ms(l.tickMinIntervalMs, 45), maxPatternMs: ms(l.maxPatternMs, 400) },
    };
  }

  /**
   * 事件 → 步骤序列。caps.trigger = 这个手柄能震扳机（只有 correct 会用到）。
   * 整个序列不超过 limits.maxPatternMs（超出的步骤截断）。
   * @returns {{at:number,duration:number,strong:number,weak:number,leftTrigger:number,rightTrigger:number}[]}
   */
  function buildPattern(event, gcfg, caps) {
    const c = normalizeConfig(gcfg);
    const step = (at, duration, strong, weak, trig) => ({ at, duration, strong, weak, leftTrigger: trig || 0, rightTrigger: trig || 0 });
    let steps = [];
    if (event === 'tick') {
      steps = [step(0, c.tick.durationMs, c.tick.strong, c.tick.weak)];
    } else if (event === 'correct') {
      steps = [step(0, c.correct.durationMs, c.correct.strong, c.correct.weak, caps && caps.trigger ? c.correct.trigger : 0)];
    } else if (event === 'wrong') {
      steps = [step(0, c.wrong.durationMs, c.wrong.strong, c.wrong.weak), step(c.wrong.durationMs + c.wrong.gapMs, c.wrong.durationMs, c.wrong.strong, c.wrong.weak)];
    } else if (event === 'streak' || event === 'ramp') {
      const n = c.ramp.steps;
      const each = Math.max(1, Math.round(c.ramp.totalMs / n));
      for (let i = 0; i < n; i++) {
        const s = c.ramp.from + ((c.ramp.to - c.ramp.from) * i) / (n - 1); // 由弱到强
        steps.push(step(i * each, each, s * c.ramp.strongShare, s));
      }
    } else return [];
    const cap = c.limits.maxPatternMs;
    return steps.filter((s) => s.at < cap).map((s) => (s.at + s.duration > cap ? Object.assign({}, s, { duration: cap - s.at }) : s));
  }

  /**
   * 播放器：把步骤按时间发给后端。
   *  - 新事件抢占旧事件（取消旧的未发出的步骤，直接发新的第一步，不排队，所以连续触发不会越拖越长）；
   *  - tick 限流：两次 tick 至少间隔 tickMinIntervalMs；有非 tick 序列正在播放时 tick 直接丢弃；
   *  - 后端抛异常 / 返回失败：静默忽略；
   *  - stop() 取消未发出的步骤并让后端停震（后台、失去焦点、手柄断开时调用）。
   * @param {{play:(step:object)=>*, stop:()=>*, now:()=>number, later:(fn:Function, ms:number)=>*, cancelLater:(h:*)=>void}} env
   */
  function createRunner(env) {
    let timers = [];
    let lastTickAt = -Infinity;
    let busyUntil = 0;
    const safe = (fn, arg) => { try { const r = fn(arg); if (r && typeof r.then === 'function') r.then(null, () => {}); } catch (_) { /* 静默 */ } };
    const clear = () => { for (const h of timers) env.cancelLater(h); timers = []; };
    return {
      /** @returns {boolean} 是否真的发出了（限流 / 丢弃返回 false） */
      trigger(event, gcfg, caps) {
        const pat = buildPattern(event, gcfg, caps);
        if (!pat.length) return false;
        const t = env.now();
        const lim = normalizeConfig(gcfg).limits;
        if (event === 'tick') {
          if (t < busyUntil) return false;
          if (t - lastTickAt < lim.tickMinIntervalMs) return false;
          lastTickAt = t;
        }
        clear();
        busyUntil = t + pat[pat.length - 1].at + pat[pat.length - 1].duration;
        pat.forEach((s, i) => {
          if (i === 0) safe(env.play, s);
          else timers.push(env.later(() => safe(env.play, s), s.at));
        });
        return true;
      },
      stop() { clear(); busyUntil = 0; safe(env.stop); },
    };
  }

  /** 一个手柄对象能不能震。 */
  function padSupport(pad) {
    const a = pad && pad.vibrationActuator;
    if (!a || typeof a.playEffect !== 'function') return { supported: false, dual: false, trigger: false };
    const effects = Array.isArray(a.effects) ? a.effects : Array.from(a.effects || []);
    const trigger = effects.includes('trigger-rumble');
    const dual = effects.includes('dual-rumble') || a.type === 'dual-rumble' || trigger; // 能震扳机的手柄同时能 dual-rumble
    return { supported: dual || trigger, dual, trigger };
  }

  /**
   * 找出「最后一次有输入」的手柄：每次传入 getGamepads() 的快照，按键 / 摇杆（超过死区）变化算一次输入。
   * 同时连接多个手柄时只有它会震；断开的从记录里清掉。
   * @param {{deadzone?:number}} [o]
   */
  function createPadTracker(o) {
    const dead = o && typeof o.deadzone === 'number' ? o.deadzone : 0.25;
    const state = new Map(); // key → { sig, lastActive, seq }
    let seq = 0;
    const signature = (p) => {
      const b = Array.from(p.buttons || [], (x) => (x && (x.pressed || x.value > 0.5) ? '1' : '0')).join('');
      const a = Array.from(p.axes || [], (v) => (Math.abs(v) > dead ? Math.round(v * 2) : 0)).join(',');
      return b + '|' + a;
    };
    return {
      /**
       * @param {object[]} pads navigator.getGamepads() 的结果（可含 null）
       * @param {number} now
       * @returns {{pads:{key:string, index:number, id:string, caps:object, lastActive:number, pad:object}[], active:object|null}}
       */
      update(pads, now) {
        const seen = new Set();
        const list = [];
        for (const p of Array.from(pads || [])) {
          if (!p || p.connected === false) continue;
          const key = p.index + ':' + p.id;
          seen.add(key);
          const sig = signature(p);
          let st = state.get(key);
          if (!st) { st = { sig, lastActive: now, seq: ++seq }; state.set(key, st); } // 第一次出现 = 刚按过键
          else if (st.sig !== sig) { st.sig = sig; st.lastActive = now; st.seq = ++seq; }
          list.push({ key, index: p.index, id: p.id, caps: padSupport(p), lastActive: st.lastActive, seq: st.seq, pad: p });
        }
        for (const k of Array.from(state.keys())) if (!seen.has(k)) state.delete(k);
        const usable = list.filter((x) => x.caps.supported);
        usable.sort((a, b) => b.lastActive - a.lastActive || b.seq - a.seq || b.index - a.index);
        return { pads: list, active: usable[0] || null };
      },
    };
  }

  /**
   * 设置里「手柄震动」开关要不要显示：只有当前有能震的手柄才显示（没连接、还没按过键、手柄不支持震动都不显示）。
   * @param {{active:object|null}} snapshot createPadTracker().update 的结果
   */
  const switchVisible = (snapshot) => !!(snapshot && snapshot.active);

  return { EVENTS, eventForKind, normalizeConfig, buildPattern, createRunner, padSupport, createPadTracker, switchVisible };
});
