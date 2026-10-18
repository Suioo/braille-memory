'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULTS, mergeConfig } = require('../src/core/config.js');
const { ROOT } = require('./helpers/fixtures.js');

test('data/config.json merges with no errors and equals the defaults', () => {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'config.json'), 'utf8'));
  const { config, errors } = mergeConfig(raw);
  assert.deepEqual(errors, []);
  assert.deepEqual(config, JSON.parse(JSON.stringify(DEFAULTS)));
});

test('mergeConfig overrides valid fields and rejects bad ones', () => {
  const { config, errors } = mergeConfig({ lessonSize: 6, score: { max: 'x' }, nope: 1, course: { stars: [1] } });
  assert.equal(config.lessonSize, 6);
  assert.equal(config.score.max, DEFAULTS.score.max);
  assert.equal(config.course.stars.length, 3);
  assert.ok(errors.includes('type:score.max'));
  assert.ok(errors.includes('unknown:nope'));
  assert.ok(errors.includes('type:course.stars'));
});

test('mergeConfig(null) returns defaults; non-object is an error', () => {
  assert.deepEqual(mergeConfig(null).errors, []);
  assert.deepEqual(mergeConfig([1]).errors, ['not-object']);
});
