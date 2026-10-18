'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/core/texts.js');
const Pick = require('../src/core/pick.js');
const { translator: tr, pmap, dict, dictProvider } = require('./helpers/fixtures.js');

const words = [...dict.keys()].filter((w) => Array.from(w).length >= 2);
const comma = Object.keys(pmap.punctuation).find((k) => pmap.punctuation[k] === '逗号、着重号');
const stop = Object.keys(pmap.punctuation).find((k) => pmap.punctuation[k] === '句号');
const mk = (store, raw, extra) => T.createText(store, Object.assign({ raw, rng: Pick.makeRng(3), map: pmap, provider: dictProvider, now: '2026-01-01T00:00:00.000Z' }, extra));
const sample = () => words[0] + words[1] + stop + words[2] + comma + words[3] + stop;

test('createText: sentences, tokens, ids, title, timestamps; the store is not modified', () => {
  const store = T.emptyStore();
  const r = mk(store, sample(), { title: '  我的第一篇  ' });
  assert.equal(r.ok, true);
  assert.equal(store.texts.length, 0);
  const t = r.text;
  assert.match(t.id, /^t_[0-9a-z]{5}$/);
  assert.equal(t.title, '我的第一篇');
  assert.equal(t.source, 'paste');
  assert.equal(t.created, '2026-01-01T00:00:00.000Z');
  assert.equal(t.sentences.length, 2);
  assert.deepEqual(t.sentences.map((s) => s.id), ['s1', 's2']);
  assert.ok(t.sentences.every((s) => s.raw && s.tokens.length));
  assert.equal(mk(store, sample()).text.title, Array.from(sample()).slice(0, 12).join(''), 'default title = first 12 chars');
  assert.equal(mk(store, sample(), { source: 'bogus' }).text.source, 'paste');
  assert.equal(mk(store, sample(), { source: 'ai' }).text.source, 'ai');
});

test('createText refusals: empty, too long, too many, provider failure, store size', () => {
  const s0 = T.emptyStore();
  assert.equal(mk(s0, '  \n ').reason, 'empty');
  assert.equal(mk(s0, null).reason, 'empty');
  assert.equal(mk(s0, '甲'.repeat(T.LIMITS.textChars + 1)).reason, 'too-long');
  assert.equal(mk(s0, '鑫').reason, 'provider');
  assert.equal(mk(s0, '鑫').ok, false);
  let full = T.emptyStore();
  for (let i = 0; i < T.LIMITS.texts; i++) full = T.addText(full, Object.assign({}, mk(full, sample()).text, { id: 't_' + String(i).padStart(5, '0') }));
  assert.equal(mk(full, sample()).reason, 'too-many');
  const big = { version: 1, texts: [{ id: 't_aaaaa', title: 'x', source: 'paste', created: '', updated: '', sentences: [{ id: 's1', raw: 'x'.repeat(T.LIMITS.storeChars), tokens: [{ k: 'b' }] }] }] };
  assert.equal(mk(big, sample()).reason, 'store-size');
});

test('BOM is ignored; ids are unique among existing texts', () => {
  let store = T.emptyStore();
  const ids = new Set();
  for (let i = 0; i < 20; i++) {
    const r = mk(store, '﻿' + sample(), { rng: Pick.makeRng(1) });
    assert.equal(r.ok, true);
    assert.equal(ids.has(r.text.id), false);
    ids.add(r.text.id);
    store = T.addText(store, r.text);
  }
});

test('add / remove / updateSentence work on copies', () => {
  const store = T.addText(T.emptyStore(), mk(T.emptyStore(), sample()).text);
  const t = store.texts[0];
  const edited = T.updateSentence(store, t.id, 's1', t.sentences[0].tokens.concat([{ k: 'b' }]), 'NOW');
  assert.equal(edited.texts[0].sentences[0].tokens.length, t.sentences[0].tokens.length + 1);
  assert.equal(edited.texts[0].updated, 'NOW');
  assert.equal(store.texts[0].sentences[0].tokens.length, t.sentences[0].tokens.length, 'original untouched');
  assert.equal(T.updateSentence(store, t.id, 's99', [], 'x'), null);
  assert.equal(T.updateSentence(store, 't_nope1', 's1', [], 'x'), null);
  assert.equal(T.updateSentence(store, t.id, 's1', [{ k: 'w', c: 'x', p: 'y' }], 'x'), null, 'invalid token refused');
  assert.equal(T.removeText(store, t.id).texts.length, 0);
  assert.equal(T.removeText(store, 'other').texts.length, 1);
});

test('decodeUtf8: strict UTF-8, BOM stripped, size limit, binary and empty refused', () => {
  const enc = (s) => new TextEncoder().encode(s);
  assert.deepEqual(T.decodeUtf8(enc('盲文')), { ok: true, text: '盲文' });
  assert.deepEqual(T.decodeUtf8(new Uint8Array([0xef, 0xbb, 0xbf, ...enc('盲文')])), { ok: true, text: '盲文' });
  assert.deepEqual(T.decodeUtf8(enc('盲文').buffer.slice(0)), { ok: true, text: '盲文' });
  assert.equal(T.decodeUtf8(new Uint8Array([0xb2, 0xe2, 0xca, 0xd4])).reason, 'utf8'); // GBK 字节不是合法 UTF-8
  assert.equal(T.decodeUtf8(new Uint8Array([0xff, 0xfe])).reason, 'utf8');
  assert.equal(T.decodeUtf8(new Uint8Array(T.LIMITS.fileBytes + 1).fill(0x61)).reason, 'size');
  assert.equal(T.decodeUtf8(new Uint8Array(T.LIMITS.fileBytes).fill(0x61)).ok, true);
  assert.equal(T.decodeUtf8(enc('a\u0000b')).reason, 'binary');
  assert.equal(T.decodeUtf8(enc('  \n ')).reason, 'empty');
  assert.equal(T.decodeUtf8(new Uint8Array(0)).reason, 'empty');
});

test('normalizeStore: keeps valid data, drops broken pieces and counts them, refuses over-limit stores', () => {
  const store = T.addText(T.emptyStore(), mk(T.emptyStore(), sample()).text);
  const ok = T.normalizeStore(JSON.parse(JSON.stringify(store)));
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.store, store);
  assert.equal(ok.dropped, 0);
  assert.deepEqual(T.normalizeStore(null), { ok: true, store: T.emptyStore(), dropped: 0 });
  for (const bad of [5, 'x', [], {}, { texts: 3 }]) assert.deepEqual(T.normalizeStore(bad), { ok: false, reason: 'format' });
  const raw = JSON.parse(JSON.stringify(store));
  raw.texts[0].sentences.push({ id: 'bad id', raw: 'x', tokens: [] });
  raw.texts[0].sentences.push({ id: 's9', raw: 'x', tokens: [{ k: 'zzz' }] });
  raw.texts.push({ id: 'nope', sentences: [] });
  raw.texts.push(5);
  const r = T.normalizeStore(raw);
  assert.equal(r.ok, true);
  assert.equal(r.dropped, 4);
  assert.equal(r.store.texts.length, 1);
  assert.equal(r.store.texts[0].sentences.length, store.texts[0].sentences.length);
  const many = { texts: Array.from({ length: T.LIMITS.texts + 1 }, (_, i) => ({ id: 't_' + String(i).padStart(5, '0'), sentences: [] })) };
  assert.deepEqual(T.normalizeStore(many), { ok: false, reason: 'limit' });
  // 重复 id 丢弃；无效字段规范化
  const dup = JSON.parse(JSON.stringify(store)); dup.texts.push(JSON.parse(JSON.stringify(store.texts[0])));
  assert.equal(T.normalizeStore(dup).store.texts.length, 1);
  const weird = JSON.parse(JSON.stringify(store)); weird.texts[0].source = 'zzz'; weird.texts[0].title = '\u0000\u0001ab'; weird.texts[0].sentences[0].tokens[0].a = 'zzz';
  const w = T.normalizeStore(weird).store.texts[0];
  assert.equal(w.source, 'paste'); assert.equal(w.title, 'ab'); assert.equal(w.sentences[0].tokens[0].a, 'auto');
});

test('buildItems: ready sentences become translate items with stable keys / signatures; broken ones stay out with their issues', () => {
  let store = T.emptyStore();
  store = T.addText(store, mk(store, sample() + 'abc' + stop).text);
  const d = T.buildItems(store, tr);
  const t = store.texts[0];
  assert.equal(d.texts[0].total, 3);
  assert.equal(d.texts[0].ready, 2);
  assert.equal(d.items.length, 2);
  for (const it of d.items) {
    assert.equal(it.key, 't:' + t.id + '#' + it.sentenceId);
    assert.equal(it.id, it.key);
    assert.deepEqual(it.cells, it.result.cells.map((c) => c.dots));
    assert.match(it.sig, /^[0-9a-f]{8}$/);
    assert.equal(d.byKey.get(it.key), it);
    assert.ok(it.chars && it.pinyin);
  }
  assert.deepEqual(d.entries, d.items.map((x) => ({ key: x.key, sig: x.sig })));
  const bad = d.status.get('t:' + t.id + '#s3');
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.some((x) => x.kind === 'unsupported'));
  assert.equal(d.status.get('t:' + t.id + '#s1').ok, true);
  // 改动 token → 签名变；同样的内容 → 签名不变
  const again = T.buildItems(store, tr);
  assert.deepEqual(again.entries, d.entries);
  const edited = T.updateSentence(store, t.id, 's1', t.sentences[0].tokens.concat([{ k: 'b' }]), 'x');
  assert.notEqual(T.buildItems(edited, tr).byKey.get('t:' + t.id + '#s1').sig, d.byKey.get('t:' + t.id + '#s1').sig);
});

test('buildItems ignores nothing silently: a sentence with an unresolved unsupported token is never an item', () => {
  let store = T.emptyStore();
  store = T.addText(store, mk(store, words[0] + 'abc' + stop).text);
  assert.equal(T.buildItems(store, tr).items.length, 0);
  const t = store.texts[0];
  const toks = t.sentences[0].tokens.map((x) => (x.k === 'x' ? Object.assign({}, x, { skip: true }) : x));
  const fixed = T.updateSentence(store, t.id, 's1', toks, 'x');
  assert.equal(T.buildItems(fixed, tr).items.length, 1);
});
