/**
 * DualSense（PS5 手柄）震动：WebHID 输出报告的纯逻辑（不碰 DOM / 设备），Chromium 的 Gamepad API 不支持 DualSense 震动，Windows 上改为直接发输出报告。
 * 协议以 Linux 内核 drivers/hid/hid-playstation.c 为准（见 docs/gamepad-haptics.md 的资料来源）：
 *   USB：报告 0x02，共 63 字节（含报告号）= 报告号 + 47 字节 common + 15 字节保留。
 *   蓝牙：报告 0x31，共 78 字节 = 报告号 + seq_tag + tag(0x10) + 47 字节 common + 24 字节保留 + 4 字节 CRC32（小端）；
 *         CRC32 = zlib 的 CRC-32，输入为「种子字节 0xA2 + 报告前 74 字节（含报告号）」。seq_tag 高 4 位是每发一次加 1 的序号（0–15 循环），低 4 位为 0。
 *   common：[0] valid_flag0 [1] valid_flag1 [2] motor_right（弱 / 高频）[3] motor_left（强 / 低频）… [38] valid_flag2 …（共 47 字节）。
 *   震动：valid_flag0 |= 0x02（选经典震动）；固件「更新版本」≥ 2.21（0x0215）用新方式（valid_flag2 |= 0x04），否则旧方式（valid_flag0 |= 0x01）；
 *         DualSense Edge 一直是新方式；读不到固件版本时两个标志都置（内核两种方式设备都支持，不认的位被忽略）。
 *   固件「更新版本」在 feature 报告 0x20 的第 44 字节（内核的 buf 含报告号）。
 * WebHID 的 sendReport(reportId, data) 里 data 不含报告号，所以下面返回的 data = 内核报告去掉第一个字节。
 * 渲染进程：window.BMDualSenseCore；Node：require()（测试用，主进程也用 isAllowedHid）。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMDualSenseCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const VENDOR_SONY = 0x054c;
  const PRODUCT_DUALSENSE = 0x0ce6;
  const PRODUCT_DUALSENSE_EDGE = 0x0df2;
  const REPORT_USB = 0x02;
  const REPORT_BT = 0x31;
  const COMMON_SIZE = 47;
  const BT_TAG = 0x10;
  const CRC_SEED_OUTPUT = 0xa2;
  const FEATURE_FIRMWARE = 0x20;
  const FEATURE_CALIBRATION = 0x05;
  /** DS_FEATURE_VERSION(2, 21) = (major << 8) | minor */
  const VERSION_VIBRATION_V2 = (2 << 8) | 21;

  /** 主进程 / 渲染进程共用的白名单：只有索尼的 DualSense（含 Edge）。 */
  const isAllowedHid = (d) => !!d && d.vendorId === VENDOR_SONY && (d.productId === PRODUCT_DUALSENSE || d.productId === PRODUCT_DUALSENSE_EDGE);

  /** Gamepad API 的 id 字符串（Chromium 形如「… (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)」）是不是 DualSense。 */
  function isDualSensePadId(id) {
    const s = String(id || '').toLowerCase();
    const m = /vendor:\s*([0-9a-f]{4})\s+product:\s*([0-9a-f]{4})/.exec(s);
    if (m) return isAllowedHid({ vendorId: parseInt(m[1], 16), productId: parseInt(m[2], 16) });
    return /dualsense/.test(s);
  }

  // ---------- CRC-32（zlib / IEEE 802.3，多项式 0xEDB88320） ----------
  const TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  /** 蓝牙输出报告的校验：种子字节 + 报告前 N 字节（含报告号）。 */
  function crcWithSeed(seed, bytes) {
    const buf = new Uint8Array(bytes.length + 1);
    buf[0] = seed;
    buf.set(bytes, 1);
    return crc32(buf);
  }

  // ---------- 强度换算 ----------
  const clamp01 = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
  /** 触感步骤的强弱（0..1）→ 马达字节：强 = motor_left（大马达），弱 = motor_right（小马达），线性换算到 0..255。 */
  function motorBytes(step) {
    return { left: Math.round(clamp01(step && step.strong) * 255), right: Math.round(clamp01(step && step.weak) * 255) };
  }

  /** 固件「更新版本」：feature 报告 0x20 的返回值。内核的 buf 含报告号（第 44 字节）；WebHID 返回的数据不含报告号（第 43 字节），按长度区分。读不到返回 null。 */
  function parseUpdateVersion(data) {
    try {
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      const idx = u8.length >= 64 ? 44 : u8.length >= 63 ? 43 : -1;
      if (idx < 0) return null;
      return u8[idx] | (u8[idx + 1] << 8);
    } catch (_) { return null; }
  }
  /** 用哪种震动标志：true = 新方式、false = 旧方式、null = 不确定（两种都置）。 */
  function useVibrationV2(productId, updateVersion) {
    if (productId === PRODUCT_DUALSENSE_EDGE) return true;
    if (typeof updateVersion !== 'number') return null;
    return updateVersion >= VERSION_VIBRATION_V2;
  }

  // ---------- 报告 ----------
  /** 47 字节 common 段，只带震动（其余灯光 / 音频 / 扳机一律不动：对应的 valid 位不置）。 */
  function buildCommon(motors, v2) {
    const c = new Uint8Array(COMMON_SIZE);
    c[0] = 0x02; // HAPTICS_SELECT：选经典震动
    if (v2 !== true) c[0] |= 0x01; // COMPATIBLE_VIBRATION（旧方式；不确定时也置）
    if (v2 !== false) c[38] |= 0x04; // COMPATIBLE_VIBRATION2（新方式；不确定时也置）
    c[2] = motors.right & 0xff;
    c[3] = motors.left & 0xff;
    return c;
  }

  /** USB 输出报告（报告 0x02）。size = 描述符里该报告的数据字节数（默认 63），不足的补 0。 */
  function buildUsbReport(motors, opts) {
    const o = opts || {};
    const size = Math.max(COMMON_SIZE, o.size || 63);
    const data = new Uint8Array(size);
    data.set(buildCommon(motors, o.v2), 0);
    return { reportId: REPORT_USB, data };
  }

  /** 蓝牙输出报告（报告 0x31，数据 77 字节）：seq_tag、tag、common、保留、CRC32（小端）。 */
  function buildBtReport(motors, opts) {
    const o = opts || {};
    const data = new Uint8Array(77);
    data[0] = ((o.seq & 0x0f) << 4) | 0x0;
    data[1] = BT_TAG;
    data.set(buildCommon(motors, o.v2), 2);
    const full = new Uint8Array(74); // 报告号 + 数据前 73 字节
    full[0] = REPORT_BT;
    full.set(data.subarray(0, 73), 1);
    const crc = crcWithSeed(CRC_SEED_OUTPUT, full);
    data[73] = crc & 0xff; data[74] = (crc >>> 8) & 0xff; data[75] = (crc >>> 16) & 0xff; data[76] = (crc >>> 24) & 0xff;
    return { reportId: REPORT_BT, data };
  }

  /**
   * 看 WebHID 设备的集合描述符，决定走哪条路：有输出报告 0x31 = 蓝牙；有 0x02 = USB；都没有 = 不支持（返回 null，静默退回无震动）。
   * 报告大小取描述符里 reportSize × reportCount 的总和（字节）。
   * @param {{outputReports?: {reportId:number, items?: {reportSize:number, reportCount:number}[]}[]}[]} collections
   */
  function planFor(collections) {
    const reports = [];
    for (const c of collections || []) for (const r of (c && c.outputReports) || []) reports.push(r);
    const find = (id) => reports.find((r) => r.reportId === id);
    const sizeOf = (r) => {
      const bits = (r.items || []).reduce((a, it) => a + (it.reportSize || 0) * (it.reportCount || 0), 0);
      return bits > 0 ? Math.ceil(bits / 8) : 0;
    };
    const bt = find(REPORT_BT);
    if (bt) return { transport: 'bt', reportId: REPORT_BT, size: 77 };
    const usb = find(REPORT_USB);
    if (usb) return { transport: 'usb', reportId: REPORT_USB, size: Math.max(COMMON_SIZE, sizeOf(usb) || 63) };
    return null;
  }

  /** 只保留最新要发的内容：同一时间最多一个发送在途，发送期间来的新值只留最后一个（不排队）。send 抛错 / 拒绝都吞掉。 */
  function createLatestWriter(send) {
    let busy = false;
    let has = false;
    let next = null;
    async function pump() {
      if (busy) return;
      busy = true;
      try {
        while (has) {
          const v = next; has = false; next = null;
          try { await send(v); } catch (_) { /* 静默 */ }
        }
      } finally { busy = false; }
    }
    return { set(v) { next = v; has = true; return pump(); }, get busy() { return busy; } };
  }

  return {
    VENDOR_SONY, PRODUCT_DUALSENSE, PRODUCT_DUALSENSE_EDGE, REPORT_USB, REPORT_BT, COMMON_SIZE, FEATURE_FIRMWARE, FEATURE_CALIBRATION, VERSION_VIBRATION_V2,
    isAllowedHid, isDualSensePadId, crc32, crcWithSeed, motorBytes, parseUpdateVersion, useVibrationV2,
    buildCommon, buildUsbReport, buildBtReport, planFor, createLatestWriter,
  };
});
