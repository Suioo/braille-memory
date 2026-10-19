/**
 * DualSense 震动（平台层，仅 Electron / 支持 WebHID 的浏览器）：Chromium 的 Gamepad API 没有 DualSense 的震动，
 * 这里用 WebHID 直接给手柄发输出报告（格式见 core/dualsense.js）。按键 / 摇杆仍然走 Gamepad API，不受这里影响。
 *  - 主进程只放行索尼 DualSense（含 Edge）的 WebHID 权限（main.js），不弹设备选择框：navigator.hid.getDevices() 直接拿到已授权的设备。
 *  - 发送失败、设备断开、权限被拒、描述符里没有认识的输出报告：一律静默退回「没有震动」（ready 变 false，设置里的开关随之隐藏）。
 *  - 一个报告在途时新来的只留最后一个；震动的时长由这里的定时器收尾（输出报告没有「持续多久」，要发一次全 0 的报告关掉）。
 * window.BMDualSense
 */
(function (root) {
  'use strict';
  const Core = root.BMDualSenseCore;
  const OFF = { left: 0, right: 0 };

  const state = { ready: false, transport: null, name: '' };
  const listeners = new Set();
  const notify = () => { for (const cb of Array.from(listeners)) { try { cb(state); } catch (_) { /* 静默 */ } } };

  let dev = null;        // 当前使用的 HIDDevice
  let plan = null;       // { transport, reportId, size }
  let v2 = null;         // 震动方式
  let seq = 0;           // 蓝牙序号 0–15
  let offTimer = null;
  let started = false;
  const attaching = new Set();

  const writer = Core ? Core.createLatestWriter(async (motors) => {
    if (!dev || !plan || !dev.opened) return;
    const rep = plan.transport === 'bt'
      ? Core.buildBtReport(motors, { v2, seq: seq++ & 0x0f })
      : Core.buildUsbReport(motors, { v2, size: plan.size });
    try { await dev.sendReport(rep.reportId, rep.data); } catch (e) { drop(dev); throw e; } // 发送失败：退回「无震动」
  }) : null;

  function setReady(next) {
    const changed = next.ready !== state.ready || next.transport !== state.transport;
    state.ready = next.ready; state.transport = next.transport; state.name = next.name || '';
    if (changed) notify();
  }
  function drop(d) {
    if (d && d !== dev) return;
    dev = null; plan = null;
    if (offTimer) { root.clearTimeout(offTimer); offTimer = null; }
    setReady({ ready: false, transport: null, name: '' });
  }

  /** 打开设备、读固件版本（决定震动方式）、蓝牙下先读一次 0x05 号 feature 报告（手柄据此切到完整报告模式，内核同样这么做）。 */
  async function attach(d) {
    if (!Core.isAllowedHid(d) || dev === d || attaching.has(d)) return;
    attaching.add(d);
    try {
      if (!d.opened) await d.open();
      const p = Core.planFor(d.collections);
      if (!p) { try { await d.close(); } catch (_) { /* 忽略 */ } return; }
      let ver = null;
      try { ver = Core.parseUpdateVersion(await d.receiveFeatureReport(Core.FEATURE_FIRMWARE)); } catch (_) { /* 读不到：两种方式都置 */ }
      if (p.transport === 'bt') { try { await d.receiveFeatureReport(Core.FEATURE_CALIBRATION); } catch (_) { /* 忽略 */ } }
      dev = d; plan = p; seq = 0;
      v2 = Core.useVibrationV2(d.productId, ver);
      setReady({ ready: true, transport: p.transport, name: d.productName || '' });
    } catch (_) {
      drop(d);
    } finally { attaching.delete(d); }
  }

  async function scan() {
    try {
      const list = await root.navigator.hid.getDevices();
      for (const d of list) if (Core.isAllowedHid(d)) { await attach(d); if (dev) break; }
    } catch (_) { /* 没有权限 / 不支持 */ }
  }

  function init() {
    if (started || !Core) return;
    started = true;
    const hid = root.navigator && root.navigator.hid;
    if (!hid || typeof hid.getDevices !== 'function') return;
    try {
      hid.addEventListener('connect', (e) => { if (e && e.device && Core.isAllowedHid(e.device)) attach(e.device); });
      hid.addEventListener('disconnect', (e) => { if (e && e.device) drop(e.device); });
    } catch (_) { /* 忽略 */ }
    scan();
  }

  /** 播放一个触感步骤：设置强弱马达，duration 毫秒后关掉（期间来了新步骤会取消这次的关闭，由新步骤自己收尾）。 */
  function play(step) {
    if (!state.ready || !writer) return;
    if (offTimer) { root.clearTimeout(offTimer); offTimer = null; }
    writer.set(Core.motorBytes(step));
    const ms = Math.max(1, Math.min(5000, step && step.duration ? step.duration : 0));
    offTimer = root.setTimeout(() => { offTimer = null; if (writer) writer.set(OFF); }, ms);
  }
  function stop() {
    if (offTimer) { root.clearTimeout(offTimer); offTimer = null; }
    if (state.ready && writer) writer.set(OFF);
  }

  root.BMDualSense = {
    init, play, stop, state,
    get ready() { return state.ready; },
    onChange(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  };
})(typeof self !== 'undefined' ? self : this);
