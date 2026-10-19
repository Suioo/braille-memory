'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const DS = require('../src/core/dualsense.js');
const Haptics = require('../src/core/haptics.js');

const hex = (u8) => Buffer.from(u8).toString('hex');

// 下面的期望值由独立的 Python（zlib.crc32 + 按 hid-playstation.c 的结构体手工排布）算出，不是用被测代码生成的。
const BT_VECTORS = [
  { left: 0, right: 0, v2: null, seq: 0, hex: '001003000000000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000027e44d' },
  { left: 255, right: 128, v2: true, seq: 1, hex: '1010020080ff00000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000b9e88437' },
  { left: 64, right: 191, v2: false, seq: 15, hex: 'f0100300bf4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000d3397360' },
  { left: 0, right: 89, v2: null, seq: 2, hex: '20100300590000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000e952ccb7' },
];
const USB_COMMON = [
  { left: 0, right: 0, v2: null, hex: '0300000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000' },
  { left: 255, right: 128, v2: true, hex: '020080ff00000000000000000000000000000000000000000000000000000000000000000000040000000000000000' },
  { left: 64, right: 191, v2: false, hex: '0300bf4000000000000000000000000000000000000000000000000000000000000000000000000000000000000000' },
];

test('CRC-32 matches the standard check value', () => {
  assert.equal(DS.crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(DS.crc32(new Uint8Array(0)), 0);
});

test('Bluetooth output report 0x31: layout, seq_tag, tag and CRC32 (seed 0xA2 + first 74 bytes)', () => {
  for (const v of BT_VECTORS) {
    const r = DS.buildBtReport({ left: v.left, right: v.right }, { v2: v.v2, seq: v.seq });
    assert.equal(r.reportId, 0x31);
    assert.equal(r.data.length, 77);
    assert.equal(hex(r.data), v.hex);
  }
  const r = DS.buildBtReport({ left: 1, right: 2 }, { v2: null, seq: 0x1f }); // 序号只取低 4 位
  assert.equal(r.data[0], 0xf0);
  assert.equal(r.data[1], 0x10);
  // CRC 在最后 4 字节、小端
  const crc = DS.crcWithSeed(0xa2, Uint8Array.from([0x31, ...r.data.subarray(0, 73)]));
  assert.equal((r.data[73] | (r.data[74] << 8) | (r.data[75] << 16) | (r.data[76] << 24)) >>> 0, crc);
});

test('USB output report 0x02: common block at the start, padded to the descriptor size', () => {
  for (const v of USB_COMMON) {
    const r = DS.buildUsbReport({ left: v.left, right: v.right }, { v2: v.v2 });
    assert.equal(r.reportId, 0x02);
    assert.equal(r.data.length, 63);
    assert.equal(hex(r.data.subarray(0, 47)), v.hex);
    assert.ok(r.data.subarray(47).every((b) => b === 0));
  }
  assert.equal(DS.buildUsbReport({ left: 0, right: 0 }, { size: 20 }).data.length, 47); // 不会小于 common 段
  assert.equal(DS.buildUsbReport({ left: 0, right: 0 }, { size: 64 }).data.length, 64);
});

test('vibration flags follow the kernel: haptics select always; v1 = flag0 bit0, v2 = flag2 bit2, unknown = both', () => {
  const f = (v2) => { const c = DS.buildCommon({ left: 1, right: 1 }, v2); return { f0: c[0], f1: c[1], f2: c[38] }; };
  assert.deepEqual(f(true), { f0: 0x02, f1: 0, f2: 0x04 });
  assert.deepEqual(f(false), { f0: 0x03, f1: 0, f2: 0 });
  assert.deepEqual(f(null), { f0: 0x03, f1: 0, f2: 0x04 });
  // 灯光 / 音频 / 扳机一律不动：除马达和这些标志外全是 0
  const c = DS.buildCommon({ left: 200, right: 100 }, null);
  c[0] = 0; c[38] = 0; c[2] = 0; c[3] = 0;
  assert.ok(c.every((b) => b === 0));
});

test('motor intensity: strong → left (big) motor, weak → right (small) motor, linear 0..255 with clamping', () => {
  assert.deepEqual(DS.motorBytes({ strong: 1, weak: 0 }), { left: 255, right: 0 });
  assert.deepEqual(DS.motorBytes({ strong: 0, weak: 1 }), { left: 0, right: 255 });
  assert.deepEqual(DS.motorBytes({ strong: 0.75, weak: 0.25 }), { left: 191, right: 64 });
  assert.deepEqual(DS.motorBytes({ strong: 0.35, weak: 0.3 }), { left: 89, right: 77 });
  assert.deepEqual(DS.motorBytes({ strong: 5, weak: -1 }), { left: 255, right: 0 });
  assert.deepEqual(DS.motorBytes({ strong: NaN }), { left: 0, right: 0 });
  assert.deepEqual(DS.motorBytes(null), { left: 0, right: 0 });
});

test('firmware "update version": byte 44 of feature report 0x20 (43 when the report id is not included); v2 from 2.21', () => {
  const withId = new Uint8Array(64); withId[44] = 0x15; withId[45] = 0x02;
  const noId = new Uint8Array(63); noId[43] = 0x24; noId[44] = 0x02;
  assert.equal(DS.parseUpdateVersion(withId), 0x0215);
  assert.equal(DS.parseUpdateVersion(new DataView(noId.buffer)), 0x0224);
  assert.equal(DS.parseUpdateVersion(new Uint8Array(10)), null);
  assert.equal(DS.parseUpdateVersion(null), null);
  assert.equal(DS.VERSION_VIBRATION_V2, 0x0215);
  assert.equal(DS.useVibrationV2(DS.PRODUCT_DUALSENSE, 0x0214), false);
  assert.equal(DS.useVibrationV2(DS.PRODUCT_DUALSENSE, 0x0215), true);
  assert.equal(DS.useVibrationV2(DS.PRODUCT_DUALSENSE, null), null);
  assert.equal(DS.useVibrationV2(DS.PRODUCT_DUALSENSE_EDGE, 0), true); // Edge 一直是新方式
});

test('device whitelist: only Sony DualSense / Edge; everything else is refused', () => {
  assert.equal(DS.isAllowedHid({ vendorId: 0x054c, productId: 0x0ce6 }), true);
  assert.equal(DS.isAllowedHid({ vendorId: 0x054c, productId: 0x0df2 }), true);
  assert.equal(DS.isAllowedHid({ vendorId: 0x054c, productId: 0x05c4 }), false); // DualShock 4
  assert.equal(DS.isAllowedHid({ vendorId: 0x045e, productId: 0x0ce6 }), false); // 别家的同号
  assert.equal(DS.isAllowedHid({ vendorId: 0x057e, productId: 0x2009 }), false); // Switch Pro
  assert.equal(DS.isAllowedHid({}), false);
  assert.equal(DS.isAllowedHid(null), false);
  assert.equal(DS.isDualSensePadId('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)'), true);
  assert.equal(DS.isDualSensePadId('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)'), false);
  assert.equal(DS.isDualSensePadId('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)'), false);
  assert.equal(DS.isDualSensePadId('054c-0ce6-DualSense Wireless Controller'), true);
});

test('transport is chosen from the HID descriptor: output report 0x31 = Bluetooth, 0x02 = USB, neither = unsupported', () => {
  const rep = (id, bits) => ({ reportId: id, items: [{ reportSize: 8, reportCount: bits / 8 }] });
  assert.deepEqual(DS.planFor([{ outputReports: [rep(0x31, 77 * 8)] }]), { transport: 'bt', reportId: 0x31, size: 77 });
  assert.deepEqual(DS.planFor([{ outputReports: [rep(0x02, 63 * 8)] }]), { transport: 'usb', reportId: 0x02, size: 63 });
  assert.equal(DS.planFor([{ outputReports: [rep(0x02, 63 * 8)] }, { outputReports: [rep(0x31, 77 * 8)] }]).transport, 'bt');
  assert.equal(DS.planFor([{ outputReports: [rep(0x05, 80)] }]), null);
  assert.equal(DS.planFor([]), null);
  assert.equal(DS.planFor(null), null);
  assert.equal(DS.planFor([{ outputReports: [{ reportId: 2 }] }]).size, 63); // 描述符没给大小：用默认 63
});

test('latest-only writer: one send in flight, newer values replace waiting ones, errors are swallowed', async () => {
  const sent = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  let first = true;
  const w = DS.createLatestWriter(async (v) => { sent.push(v); if (first) { first = false; await gate; } if (v === 'boom') throw new Error('x'); });
  const p1 = w.set('a');
  w.set('b'); w.set('c'); w.set('boom'); w.set('d');
  assert.equal(w.busy, true);
  release();
  await p1; await new Promise((r) => setImmediate(r));
  assert.deepEqual(sent, ['a', 'd']);
  await w.set('e');
  assert.deepEqual(sent, ['a', 'd', 'e']);
  await w.set('boom'); // 抛错不影响之后
  await w.set('f');
  assert.equal(sent[sent.length - 1], 'f');
});

test('haptics tracker: a DualSense without vibrationActuator counts as vibratable only when the HID channel is ready', () => {
  const mk = (id, extra) => Object.assign({ index: 0, id, connected: true, buttons: [{ pressed: false, value: 0 }], axes: [0, 0] }, extra);
  const dsId = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
  let ready = false;
  const tracker = Haptics.createPadTracker({ extra: (p) => (ready && DS.isDualSensePadId(p.id) ? { supported: true, dual: true, trigger: false, hid: true } : null) });
  assert.equal(tracker.update([mk(dsId)], 0).active, null);
  ready = true;
  const snap = tracker.update([mk(dsId)], 10);
  assert.equal(snap.active.caps.hid, true);
  assert.equal(Haptics.switchVisible(snap), true);
  // 有 vibrationActuator 的手柄不走 extra；DS4 不受影响
  const ds4 = mk('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)', { index: 1, vibrationActuator: { type: 'dual-rumble', playEffect() {}, effects: ['dual-rumble'] } });
  assert.equal(Haptics.createPadTracker({ extra: () => null }).update([ds4], 0).active.caps.hid, undefined);
  // extra 抛错：静默当作不能震
  assert.equal(Haptics.createPadTracker({ extra: () => { throw new Error('x'); } }).update([mk(dsId)], 0).active, null);
});
