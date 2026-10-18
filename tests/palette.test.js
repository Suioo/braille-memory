'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Pal = require('../src/core/palette.js');

test('hex ↔ rgb round trip and Lab of white/black', () => {
  assert.equal(Pal.rgbToHex(Pal.hexToRgb('#2f6f8f')), '#2F6F8F');
  assert.ok(Math.abs(Pal.rgbToLab([255, 255, 255])[0] - 100) < 0.01);
  assert.ok(Math.abs(Pal.rgbToLab([0, 0, 0])[0]) < 0.01);
});

test('toneColor hits the requested L* (tone) within 1', () => {
  const { h } = Pal.lch(Pal.SEEDS.teal);
  for (const tone of [10, 20, 30, 40, 50, 60, 80, 90, 95, 98]) {
    const L = Pal.rgbToLab(Pal.hexToRgb(Pal.toneColor(h, 40, tone)))[0];
    assert.ok(Math.abs(L - tone) < 1, tone + ' → ' + L);
  }
});

test('contrast: black/white = 21, same colour = 1', () => {
  assert.ok(Math.abs(Pal.contrast('#000000', '#FFFFFF') - 21) < 1e-9);
  assert.equal(Pal.contrast('#2F6F8F', '#2F6F8F'), 1);
});

test('surfaces are tinted, never pure black/white', () => {
  for (const seed of Object.values(Pal.SEEDS)) {
    assert.notEqual(Pal.scheme(seed, false).surface, '#FFFFFF');
    assert.notEqual(Pal.scheme(seed, true).surface, '#000000');
    assert.notEqual(Pal.scheme(seed, false).onSurface, '#000000');
    assert.notEqual(Pal.scheme(seed, true).onSurface, '#FFFFFF');
  }
});

test('every seed × mode meets the required contrast pairs', () => {
  for (const [name, seed] of Object.entries(Pal.SEEDS)) {
    for (const dark of [false, true]) {
      const sc = Pal.scheme(seed, dark);
      for (const [fg, bg, min] of Pal.CONTRAST_PAIRS) {
        const c = Pal.contrast(sc[fg], sc[bg]);
        assert.ok(c >= min, `${name} ${dark ? 'dark' : 'light'} ${fg}/${bg} = ${c.toFixed(2)} < ${min}`);
      }
    }
  }
});

test('cssVar maps role names to kebab-case custom properties', () => {
  assert.equal(Pal.cssVar('surfaceContainerHigh'), '--surface-container-high');
  assert.equal(Pal.cssVar('onPrimary'), '--on-primary');
});

test('progress seed names match palette seeds', () => {
  const P = require('../src/core/progress.js');
  assert.deepEqual(P.SEED_NAMES, Object.keys(Pal.SEEDS));
  assert.equal(P.SEED_NAMES[0], Pal.DEFAULT_SEED);
});
