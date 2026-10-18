'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const U = require('../src/core/uistate.js');

class FakeStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

test('defaults: only the commonly used group is open', () => {
  const s = U.normalize(null);
  assert.equal(s.version, 1);
  assert.deepEqual(Object.keys(s.groups), U.GROUPS);
  const open = Object.entries(s.groups).filter(([, v]) => v).map(([k]) => k);
  assert.deepEqual(open, Object.keys(U.DEFAULT_OPEN));
  assert.deepEqual(open, ['practice']);
});

test('normalize drops unknown groups and non-boolean values', () => {
  const s = U.normalize({ groups: { look: true, practice: 'yes', data: 1, bogus: true, about: false } });
  assert.equal(s.groups.look, true);
  assert.equal(s.groups.practice, true, 'invalid value → default (open)');
  assert.equal(s.groups.data, false);
  assert.equal(s.groups.about, false);
  assert.equal('bogus' in s.groups, false);
  for (const bad of [undefined, 5, 'x', [], { groups: 3 }, { groups: [] }]) assert.deepEqual(U.normalize(bad), U.normalize(null));
});

test('store: round trip, per-group, persists across instances', () => {
  const st = new FakeStorage();
  const a = U.createStore(st);
  assert.equal(a.isOpen('practice'), true);
  assert.equal(a.isOpen('look'), false);
  assert.equal(a.set('look', true), true);
  assert.equal(a.set('practice', false), true);
  const b = U.createStore(st);
  assert.equal(b.isOpen('look'), true);
  assert.equal(b.isOpen('practice'), false);
  assert.equal(b.isOpen('data'), false);
  assert.equal(JSON.parse(st.getItem(U.KEY)).version, 1);
});

test('store: unknown group is refused; broken / missing / throwing storage falls back to defaults', () => {
  const st = new FakeStorage();
  assert.equal(U.createStore(st).set('nope', true), false);
  st.setItem(U.KEY, '{oops');
  assert.deepEqual(U.createStore(st).load(), U.normalize(null));
  assert.deepEqual(U.createStore(null).load(), U.normalize(null));
  assert.equal(U.createStore(null).set('look', true), false);
  const boom = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  const s = U.createStore(boom);
  assert.equal(s.isOpen('practice'), true);
  assert.equal(s.set('look', true), false);
});

test('uses its own key, not the progress key (never exported)', () => {
  assert.equal(U.KEY, 'braille-memory.ui');
  assert.notEqual(U.KEY, 'braille-memory.progress');
});
