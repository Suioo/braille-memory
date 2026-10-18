'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Stopwatch } = require('../src/core/timer.js');

test('Stopwatch excludes paused time', () => {
  let t = 1000;
  const sw = new Stopwatch(() => t);
  sw.start(); t += 300; sw.pause(); t += 5000; sw.start(); t += 200;
  assert.equal(sw.elapsed(), 500);
  assert.equal(sw.stop(), 500);
  t += 1000;
  assert.equal(sw.elapsed(), 500);
  sw.reset();
  assert.equal(sw.elapsed(), 0);
  assert.equal(sw.running, false);
});
