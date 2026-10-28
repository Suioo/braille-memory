'use strict';
// 自定义文本标注：拼音 / 分词只来自注入的提供者；盲文只由引擎计算。测试文本全部由 rules.json 的例词拼成。
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/core/annotate.js');
const { translator: tr, pmap, dict, dictProvider, examples } = require('./helpers/fixtures.js');

const words = [...dict.keys()];
const w2 = words.filter((w) => Array.from(w).length >= 2).slice(0, 12);
const tok = (raw) => { const r = A.tokenize(raw, { map: pmap, provider: dictProvider }); assert.equal(r.ok, true, raw + JSON.stringify(r)); return r.tokens; };
const pk = (name) => Object.keys(pmap.punctuation).find((k) => k !== 'note' && pmap.punctuation[k] === name);

test('splitSentences: ends at sentence-final punctuation (closers stay), at newlines, caps very long sentences', () => {
  assert.deepEqual(A.splitSentences('甲乙。丙丁！\n戊己，庚辛'), ['甲乙。', '丙丁！', '戊己，庚辛']);
  assert.deepEqual(A.splitSentences('他说：“好。”然后走了。'), ['他说：“好。”', '然后走了。']);
  assert.deepEqual(A.splitSentences('甲？！乙。'), ['甲？！', '乙。']);
  assert.deepEqual(A.splitSentences('  \n\n '), []);
  assert.deepEqual(A.splitSentences(null), []);
  assert.deepEqual(A.splitSentences('甲乙\r\n丙丁\r丁'), ['甲乙', '丙丁', '丁']);
  const long = '甲'.repeat(50) + '，' + '乙'.repeat(60);
  const parts = A.splitSentences(long);
  assert.ok(parts.length >= 2 && parts.every((p) => Array.from(p).length <= A.MAX_SENTENCE));
  assert.equal(parts.join(''), long, 'nothing is lost');
  assert.ok(parts[0].endsWith('，'), 'cut at the clause punctuation');
  const hard = A.splitSentences('甲'.repeat(200));
  assert.equal(hard.join(''), '甲'.repeat(200));
  assert.ok(hard.every((p) => Array.from(p).length <= A.MAX_SENTENCE));
});

test('tokenize: words from the provider, punctuation (incl. two-char ones), numbers, unsupported runs; whitespace is only a separator', () => {
  const dots = pk('省略号'); const dash = pk('破折号'); const comma = pk('逗号、着重号');
  assert.ok(dots && dots.length === 2 && dash && comma);
  const [a, b] = w2;
  const t = tok(a + comma + b + '12' + dots + 'abc ' + dash + '⚠');
  // 逗号后按标点的书写规定自动补一个空方（见 tests/punct-spacing.test.js）；省略号、破折号未列入，不补
  assert.deepEqual(t.map((x) => x.k), ['w', 'u', 'b', 'w', 'n', 'u', 'x', 'u', 'x']);
  assert.equal(t[0].c, a);
  assert.equal(t[0].p, dict.get(a));
  assert.equal(t[0].a, 'auto');
  assert.equal(t[1].c, comma);
  assert.equal(t[4].c, '12');
  assert.equal(t[5].c, dots, 'two-char punctuation is one token');
  assert.equal(t[6].c, 'abc');
  assert.equal(t[8].c, '⚠');
  assert.equal(tok(a + ' ' + b).map((x) => x.k).join(''), 'ww', 'a space makes no blank by itself');
});

test('tokenize: the provider must return exactly the text it was given; its errors are reported, not swallowed', () => {
  const bad = { segment: (run) => [{ chars: run.slice(1), pinyin: 'a' }] };
  assert.deepEqual(A.tokenize(w2[0], { map: pmap, provider: bad }), { ok: false, reason: 'provider', detail: 'mismatch' });
  assert.equal(A.tokenize(w2[0], { map: pmap, provider: { segment: () => [{ chars: w2[0], pinyin: '' }] } }).reason, 'provider');
  // 库对某个字给不出拼音：只有那个字被单独标出（x，原因 no-pinyin），其余照常；不拖垮整句
  const boom = A.tokenize([...dict.keys()].find((k) => Array.from(k).length === 1) + '鑫', { map: pmap, provider: dictProvider });
  assert.equal(boom.ok, true);
  assert.deepEqual(boom.tokens.slice(-1), [{ k: 'x', c: '鑫' }]);
  assert.ok(boom.tokens.some((t) => t.k === 'w'));
  const c = A.check(boom.tokens, tr);
  assert.equal(c.ok, false);
  assert.deepEqual(c.issues.map((x) => [x.kind, x.reason, x.detail]), [['unsupported', 'no-pinyin', '鑫']]);
});

test('check: a sentence made of example words translates, and equals the engine on the same words', () => {
  const [a, b] = w2;
  const tokens = tok(a + b);
  const st = A.check(tokens, tr);
  assert.equal(st.ok, true);
  const direct = tr.translate([{ type: 'text', pinyin: dict.get(a) + ' ' + dict.get(b), chars: a + b }]);
  assert.deepEqual(st.result.cells, direct.cells, 'words are separated by one blank cell, exactly like a space in the pinyin');
  assert.equal(st.result.cells.filter((c) => c.kind === 'space').length, 1);
});

test('check: punctuation and numbers go through the engine; blanks are the comma rule\'s one plus the explicit ones', () => {
  const [a] = w2; const comma = pk('逗号、着重号');
  const st = A.check(tok(a + comma + '46'), tr);
  assert.equal(st.ok, true);
  const direct = tr.translate([{ type: 'text', pinyin: dict.get(a), chars: a }, { type: 'punct', char: comma }, { type: 'blank' }, { type: 'number', text: '46' }]);
  assert.deepEqual(st.result.cells, direct.cells);
  assert.equal(st.result.cells.filter((c) => c.kind === 'space').length, 1);
  const withBlank = tok(a + comma + '46'); withBlank.splice(3, 0, { k: 'b' });
  const st2 = A.check(withBlank, tr);
  assert.equal(st2.result.cells.filter((c) => c.kind === 'space').length, 2);
});

test('check: every problem is reported per token (kind + reason); nothing is skipped silently', () => {
  const [a, b] = w2; const comma = pk('逗号、着重号');
  const t = tok(a + 'abc' + comma + b + '!');
  t.push({ k: 'x', c: '①' });
  t.push({ k: 'u', c: ',' });
  t[t.length - 2].c = '①';
  const bad = tok(b); bad[0].p = 'zxcv';
  const st = A.check(t.concat(bad), tr);
  assert.equal(st.ok, false);
  const kinds = st.issues.map((x) => x.kind + ':' + x.reason);
  assert.ok(kinds.includes('unsupported:latin'));
  assert.ok(kinds.some((k) => k.startsWith('unsupported:') && k !== 'unsupported:latin'));
  assert.ok(kinds.includes('punct:no-punct'), 'half-width comma is not in the map');
  assert.ok(kinds.some((k) => k.startsWith('pinyin:')));
  assert.ok(st.issues.every((x) => Number.isInteger(x.i) && x.i >= 0));
  assert.deepEqual([...new Set(st.issues.map((x) => x.i))].sort((x, y) => x - y), st.issues.map((x) => x.i).sort((x, y) => x - y), 'one issue per token');
});

test('check: pinyin problems — empty, spaces, wrong syllable count, bad letters', () => {
  const [a] = w2; const base = () => tok(a);
  const reasons = (mut) => { const t = base(); mut(t[0]); return A.check(t, tr).issues.map((x) => x.reason); };
  assert.deepEqual(reasons((x) => { x.p = ''; }), ['empty']);
  assert.deepEqual(reasons((x) => { x.p = 'a b'; }), ['space']);
  assert.ok(reasons((x) => { x.p = dict.get(a) + dict.get(a); }).some((r) => ['chars-mismatch', 'ambiguous', 'bad-syllable'].includes(r)));
  assert.deepEqual(reasons((x) => { x.p = 'xyz1'; }), ['bad-char']);
  assert.deepEqual(reasons((x) => { x.c = 'ab'; }), ['bad-chars']);
});

test('check: the user can explicitly skip an unsupported spot; it stays visible and is listed as skipped', () => {
  const [a] = w2;
  const t = tok(a + 'abc');
  assert.equal(A.check(t, tr).ok, false);
  t[1].skip = true;
  const st = A.check(t, tr);
  assert.equal(st.ok, true);
  assert.deepEqual(st.skipped, [1]);
  assert.equal(st.tokens.length, 1, 'the skipped text is not part of the answer');
  assert.equal(A.pinyinLine(t).includes('abc'), true, 'but it is still shown');
  assert.equal(A.check([{ k: 'x', c: 'abc', skip: true }], tr).ok, false, 'a sentence with nothing left to practise is not ready');
});

test('check: contraction goes by the characters (的 么 你 他 她 它 come from the engine rules)', () => {
  const contr = tr.rules.byType.get('contraction')[0];
  const f = tr.rules.forms.find((x) => x.rule === contr.id);
  const t = [{ k: 'w', c: f.word, p: f.pinyin, a: 'auto' }];
  const st = A.check(t, tr);
  assert.equal(st.ok, true);
  assert.deepEqual(st.result.cells.map((c) => c.dots), f.dots);
});

test('every example from rules.json, fed through the ideal provider, ends up as a sentence the engine accepts or refuses explicitly', () => {
  let ok = 0; let total = 0;
  for (const e of examples) {
    if (!dict.has(e.chars) || dict.get(e.chars) !== e.pinyin) continue; // 只取词典里的写法（带空格 / 标记的另测）
    total++;
    const t = A.tokenize(e.chars, { map: pmap, provider: dictProvider });
    assert.equal(t.ok, true);
    const st = A.check(t.tokens, tr);
    assert.ok(st.ok || st.issues.length > 0);
    if (st.ok) ok++;
  }
  assert.ok(total > 80);
  assert.ok(ok / total > 0.95, ok + '/' + total);
});

test('hash: stable, short, content-sensitive', () => {
  assert.equal(A.hash('abc'), A.hash('abc'));
  assert.notEqual(A.hash('abc'), A.hash('abd'));
  assert.match(A.hash('盲文记忆'), /^[0-9a-f]{8}$/);
});

test('pinyinLine: words spaced, punctuation attached, blanks and skipped text visible', () => {
  const [a, b] = w2; const comma = pk('逗号、着重号');
  const t = tok(a + b + comma);
  assert.equal(A.pinyinLine(t), dict.get(a) + ' ' + dict.get(b) + comma);
  const s = A.pinyinLine([{ k: 'w', c: a, p: 'x' }, { k: 'b' }, { k: 'x', c: 'ab', skip: true }]);
  assert.ok(s.includes('␣') && s.includes('〔ab〕'));
});
