'use strict';
// 翻盲文引擎自检：rules.json 的每个 forms 必须与引擎输出完全一致；所有例词（说明里写「暂不支持」的除外）都不能返回「不支持」。
// 测试里的点位一律运行时从 CSV / rules.json 读取，不手写。
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/core/translate.js');
const Rules = require('../src/core/rules.js');
const { table, extra, rules, pmap, translator: tr, examples } = require('./helpers/fixtures.js');

const dig = (res) => res.cells.map((c) => (c.kind === 'space' ? '_' : c.dots.join('')));
const word = (pinyin, chars) => { const r = tr.word(pinyin, chars); assert.equal(r.ok, true, chars + ' ' + pinyin + ' ' + JSON.stringify(r)); return r; };
const row = (symbol) => table.find((r) => r.symbol === symbol);
const ruleOf = (id) => rules.byId.get(id);
const ex = (id, chars) => ruleOf(id).examples.find((e) => e[0] === chars);
const toneRows = Object.fromEntries(Object.entries(pmap.toneNames).map(([k, name]) => [k, row(name).dotsText]));
const toneCell = (syl) => syl.cells.find((c) => c.kind === 'tone');

test('translator is built from the data; categories are derived, not hand-written', () => {
  assert.equal(tr.ok, true);
  assert.deepEqual(Object.keys(tr.categories).sort(), ['final', 'initial', 'tone']);
  assert.equal(new Set(Object.values(tr.categories)).size, 3);
  assert.ok(row(pmap.toneNames['1']) && row(pmap.toneNames['1']).category === tr.categories.tone);
  assert.ok(tr.marker && tr.marker === ruleOf('10.2.8').apply.marker);
});

test('every rule type the engine needs must be present, otherwise it refuses to build', () => {
  for (const type of T.REQUIRED_TYPES) {
    const copy = Object.assign({}, rules, { byType: new Map([...rules.byType].filter(([k]) => k !== type)) });
    const r = T.createTranslator({ table, extra, rules: copy, map: pmap });
    assert.equal(r.ok, false, type);
    assert.deepEqual(r.errors, ['missing-rule-type:' + type]);
  }
});

test('categories that cannot be derived from the table are reported', () => {
  const noTone = table.filter((r) => !Object.values(pmap.toneNames).includes(r.symbol));
  const r = T.createTranslator({ table: noTone, extra, rules, map: pmap });
  assert.equal(r.ok, false);
  assert.ok(r.errors.includes('category:tone:0'));
});

test('SELF-CHECK forms: contraction forms equal the engine output exactly', () => {
  const contr = ruleOf('11.1');
  const forms = rules.forms.filter((f) => f.rule === contr.id);
  assert.ok(forms.length >= 6);
  for (const f of forms) {
    const r = word(f.pinyin, f.word);
    assert.deepEqual(r.cells.map((c) => c.dots), f.dots, f.word);
    assert.ok(r.cells.every((c) => c.kind === 'contraction' && c.rule === contr.id));
  }
});

test('SELF-CHECK forms: special forms (used when contraction is blocked, 11.2) equal the engine output exactly', () => {
  const sp = ruleOf('9.4');
  const block = ruleOf('11.2');
  const forms = rules.forms.filter((f) => f.rule === sp.id);
  assert.ok(forms.length >= 2);
  for (const f of forms) {
    const e = block.examples.find((x) => block.apply.chars.includes([...x[0]][0]) && x[1].normalize('NFC').startsWith(f.pinyin.normalize('NFC')));
    assert.ok(e, '11.2 has an example that blocks contraction for ' + f.word);
    const chars = f.word + [...e[0]].slice(1).join('');
    const r = word(e[1], chars);
    const first = r.syllables[0].cells;
    assert.deepEqual(first.map((c) => c.dots), f.dots, f.word);
    assert.ok(first.every((c) => c.kind === 'special' && c.rule === sp.id));
  }
});

test('SELF-CHECK examples: none returns "unsupported" (examples marked 暂不支持 are skipped)', () => {
  assert.ok(examples.length >= 140);
  const skipped = rules.rules.flatMap((r) => r.examples || []).filter((e) => (e[2] || '').includes(Rules.UNSUPPORTED_MARK));
  assert.ok(skipped.length >= 1);
  for (const e of examples) {
    const r = tr.word(e.pinyin, e.chars);
    assert.equal(r.ok, true, e.rule + ' ' + e.chars + ' ' + e.pinyin + ' ' + JSON.stringify(r));
    assert.ok(r.cells.length >= 1);
    assert.ok(r.cells.every((c) => c.kind === 'space' ? c.dots.length === 0 : c.dots.length >= 1 && c.dots.every((d) => d >= 1 && d <= 6)));
  }
});

test('the skipped (暂不支持) examples really are refused, with a reason', () => {
  for (const r of rules.rules) for (const e of r.examples || []) {
    if (!(e[2] || '').includes(Rules.UNSUPPORTED_MARK)) continue;
    const res = tr.word(e[1], e[0]);
    assert.equal(res.ok, false, e[0]);
    assert.ok(res.reason);
  }
});

test('cell order follows syllableOrder; initial / final / tone cells come from the table', () => {
  const order = ruleOf('9.1').apply.order;
  const r = word('hùníngháng', '沪宁杭');
  for (const s of r.syllables) {
    const kinds = s.cells.map((c) => c.kind);
    assert.deepEqual(kinds, order.filter((k) => kinds.includes(k)));
  }
  const first = r.syllables[0];
  assert.equal(first.cells[0].dots.join(''), row('h、x').dotsText);
  assert.equal(first.cells[1].dots.join(''), row('u').dotsText);
  assert.equal(toneCell(first).dots.join(''), toneRows['4']);
});

test('SELF-CHECK tone: every example syllable follows the omit / keep rules (independent re-derivation from rules.json)', () => {
  const omit = rules.byType.get('omitTone');
  const syl = rules.byType.get('syllableTone');
  const dis = rules.byType.get('disableRules')[0];
  let checked = 0;
  for (const e of examples) {
    const r = tr.word(e.pinyin, e.chars);
    const parsed = tr.parse(e.pinyin, { chars: e.chars });
    const flat = parsed.words.flatMap((w) => w.syllables.map((s, k) => ({ s, next: w.syllables[k + 1] || null })));
    flat.forEach(({ s, next }, i) => {
      const t = r.syllables[i];
      if (t.cells.some((c) => c.kind === 'contraction' || c.kind === 'special')) return;
      const has = !!toneCell(t);
      let want;
      const raw = s.raw.normalize('NFC');
      const apical = ruleOf('9.2').apply.syllables.includes(s.plain);
      const hit = syl.find((x) => x.apply.omit.includes(raw) || x.apply.keep.includes(raw));
      if (s.tone === 0) want = false;
      else if (s.keepTone) want = true;
      else if (hit) want = !hit.apply.omit.includes(raw);
      else {
        const off = new Set(apical && next && next.zero ? dis.apply.disable : []);
        const key = s.initial == null ? '∅' : s.initial;
        const o = omit.find((x) => !off.has(x.id) && x.apply.tone === s.tone && x.apply.initials.includes(key));
        want = !(o && !(o.apply.keepSyllables || []).includes(raw));
      }
      assert.equal(has, want, e.chars + ' ' + e.pinyin + ' #' + i + ' ' + raw);
      if (has) assert.equal(toneCell(t).dots.join(''), toneRows[String(s.tone)]);
      checked++;
    });
  }
  assert.ok(checked > 250);
});

/** 全部例词的音节及其引擎追踪：{raw, tone, initial, zero, keepTone, trace, apicalBeforeZero}。 */
function exampleSyllables() {
  const apical = ruleOf('9.2').apply.syllables;
  const out = [];
  for (const e of examples) {
    const r = tr.word(e.pinyin, e.chars);
    const parsed = tr.parse(e.pinyin, { chars: e.chars });
    let i = 0;
    for (const w of parsed.words) {
      w.syllables.forEach((s, k) => {
        out.push(Object.assign({}, s, { trace: r.syllables[i++], ex: e, apicalBeforeZero: apical.includes(s.plain) && !!w.syllables[k + 1] && w.syllables[k + 1].zero }));
      });
    }
  }
  return out;
}

test('listed syllable exceptions (keepSyllables / syllableTone lists) behave as the rules say, checked on the example words', () => {
  const all = exampleSyllables().filter((x) => !x.trace.cells.some((c) => c.kind === 'contraction' || c.kind === 'special') && !x.keepTone);
  const sylRules = rules.byType.get('syllableTone');
  const listed = new Set(sylRules.flatMap((r) => r.apply.omit.concat(r.apply.keep)));
  let kept = 0; let omitted = 0;
  for (const r of rules.byType.get('omitTone')) {
    const { tone, initials, keepSyllables = [] } = r.apply;
    for (const k of keepSyllables) {
      const hits = all.filter((x) => x.raw.normalize('NFC') === k.normalize('NFC'));
      assert.ok(hits.length > 0, r.id + ' ' + k);
      for (const h of hits) { assert.ok(toneCell(h.trace), r.id + ' keep ' + k); kept++; }
    }
    // 同声母、同声调、不在例外里、不在逐音节规则里、没有被 10.2.7 关掉 → 省写
    const plain = all.filter((x) => x.tone === tone && initials.includes(x.initial == null ? '∅' : x.initial) && !keepSyllables.map((k) => k.normalize('NFC')).includes(x.raw.normalize('NFC'))
      && !listed.has(x.raw.normalize('NFC')) && !x.apicalBeforeZero);
    assert.ok(plain.length > 0, r.id);
    for (const h of plain) { assert.equal(!!toneCell(h.trace), false, r.id + ' ' + h.raw + ' in ' + h.ex.chars); omitted++; }
  }
  for (const r of sylRules) {
    const found = (list) => all.filter((x) => list.map((k) => k.normalize('NFC')).includes(x.raw.normalize('NFC')));
    for (const h of found(r.apply.omit)) { assert.equal(!!toneCell(h.trace), false, r.id + ' omit ' + h.raw); omitted++; }
    for (const h of found(r.apply.keep)) { assert.equal(!!toneCell(h.trace), true, r.id + ' keep ' + h.raw); kept++; }
    assert.ok(found(r.apply.omit).length + found(r.apply.keep).length >= 3, r.id);
  }
  assert.ok(kept >= 8 && omitted >= 30);
});

test('10.2.7: an apical syllable followed by a zero-initial syllable in the same word keeps its tone', () => {
  const a = word("cí'ài", '慈爱').syllables;
  assert.equal(!!toneCell(a[0]), true);
  assert.ok(a[0].notes.some((n) => n.rule === '10.2.7' && n.what === 'disabled'));
  assert.equal(!!toneCell(word('cí', '词').syllables[0]), false); // 单独的「词」仍按 10.2.2 省写
  const b = word('shìyè', '事业').syllables;
  assert.equal(!!toneCell(b[0]), true);
  assert.equal(!!toneCell(word('zhòngshì', '重视').syllables[1]), false); // 后面没有韵母自成音节 → 照常省写
  // 不同词里不算「同一词内连写」
  const sep = tr.translate([{ type: 'text', pinyin: 'cí ài', chars: '慈爱' }]);
  assert.equal(sep.ok, true);
  assert.equal(!!toneCell(sep.syllables[0]), false);
});

test('10.2.8: a syllable followed by the marker keeps its tone; the engine never decides this by itself', () => {
  const m = tr.marker;
  assert.equal(!!toneCell(word('wèn', '问').syllables[0]), false);
  const kept = word('wèn' + m, '问').syllables[0];
  assert.equal(!!toneCell(kept), true);
  assert.equal(toneCell(kept).rule, '10.2.8');
  const d = word('dì' + m + 'dào' + m, '地道').syllables;
  assert.deepEqual(d.map((s) => !!toneCell(s)), [true, true]);
  assert.equal(!!toneCell(word('zài' + m, '再').syllables[0]), true);
});

test('9.2: apical syllables drop the final i; the initial stays (and a written tone follows it)', () => {
  for (const s of ruleOf('9.2').apply.syllables) {
    const r = tr.word(s.normalize('NFD').replace(/[̀-ͯ]/g, ''), '字');
    if (!r.ok) continue; // 无调写法不一定能解析，只检查能解析的
    assert.equal(r.syllables[0].cells.filter((c) => c.kind === 'final').length, 0, s);
  }
  for (const e of ruleOf('9.2').examples) {
    const t = word(e[1], e[0]).syllables[0];
    assert.equal(t.cells.filter((c) => c.kind === 'final').length, 0, e[0]);
    assert.equal(t.cells[0].kind, 'initial');
    assert.ok(t.notes.some((n) => n.rule === '9.2'));
  }
});

test('9.3: zero-initial spellings use the full final; the y / w are not written', () => {
  for (const e of ruleOf('9.3').examples) {
    const t = word(e[1], e[0]).syllables[0];
    assert.equal(t.cells.filter((c) => c.kind === 'initial').length, 0, e[0]);
    assert.equal(t.cells.filter((c) => c.kind === 'final').length, 1, e[0]);
  }
  assert.equal(word('yí', '仪').syllables[0].cells[0].dots.join(''), row('i').dotsText);
  assert.equal(word('wǎn', '碗').syllables[0].cells[0].dots.join(''), row('uan').dotsText);
  assert.equal(word('yuè', '悦').syllables[0].cells[0].dots.join(''), row('üe').dotsText);
});

test('11.1 / 11.2: contraction goes by character; blocked before a zero-initial syllable; 她 is never blocked', () => {
  const contr = ruleOf('11.1');
  const forms = new Map(rules.forms.filter((f) => f.rule === contr.id).map((f) => [f.word, f]));
  const nide = word('nǐde', '你的');
  assert.deepEqual(nide.syllables.map((s) => s.cells.map((c) => c.kind)), [['contraction'], ['contraction']]);
  assert.deepEqual(nide.cells.map((c) => c.dots), [forms.get('你').dots[0], forms.get('的').dots[0]]);
  const tayong = word('tāyòng', '他用').syllables[0];
  assert.ok(tayong.cells.every((c) => c.kind === 'special'));
  assert.ok(tayong.notes.some((n) => n.rule === '11.2'));
  const zenmeyang = word('zěnmeyàng', '怎么样').syllables;
  assert.deepEqual(zenmeyang[1].cells.map((c) => c.kind), ['initial', 'final']); // 么 不简写，按拼写：m + e（轻声无调）
  assert.equal(zenmeyang[1].cells[0].dots.join(''), row('m').dotsText);
  assert.equal(zenmeyang[1].cells[1].dots.join(''), row('o、e').dotsText);
  assert.deepEqual(word('zěnme', '怎么').syllables[1].cells.map((c) => c.kind), ['contraction']);
  const taYong = tr.translate([{ type: 'text', pinyin: 'tāyòng', chars: '她用' }]);
  assert.ok(taYong.syllables[0].cells.every((c) => c.kind === 'contraction'));
  // 汉字不同音同：「得」不简写；汉字对但读音不是简写形式的读音也不简写
  const de = word('chīdexiāo', '吃得消').syllables[1];
  assert.deepEqual(de.cells.map((c) => c.kind), ['initial', 'final']);
  const mu = word('mùdì', '目的').syllables[1];
  assert.ok(mu.cells.every((c) => c.kind !== 'contraction'));
});

test('a contraction candidate without characters is refused (cannot tell 他 / 她 / 它 or 的 / 得)', () => {
  for (const f of rules.forms) {
    const r = tr.translate([{ type: 'text', pinyin: f.pinyin }]);
    assert.equal(r.ok, false, f.word);
    assert.equal(r.reason, 'need-chars');
  }
  assert.equal(tr.translate([{ type: 'text', pinyin: 'hěnhǎo' }]).ok, false); // 没有汉字时切分有歧义
});

test('word breaks: a space in the pinyin is one blank cell between words; syllables inside a word are joined', () => {
  const r = word('jīngzàng gāosù', '京藏高速');
  const d = dig(r);
  assert.equal(d.filter((x) => x === '_').length, 1);
  assert.equal(r.cells.findIndex((c) => c.kind === 'space'), r.syllables[0].cells.length + r.syllables[1].cells.length);
  assert.equal(word('hěnhǎo', '很好').cells.some((c) => c.kind === 'space'), false);
  const long = word('zhōnghuá rénmín gònghéguó', '中华人民共和国');
  assert.equal(long.cells.filter((c) => c.kind === 'space').length, 2);
});

test('hyphen and apostrophe never produce a cell', () => {
  assert.deepEqual(dig(word('bā-jiǔ', '八九')), dig(word('bājiǔ', '八九')));
  assert.deepEqual(dig(word("cí'ài", '慈爱')), dig(word('cíài', '慈爱')));
});

test('numbers: one number sign for the whole number, then each digit without its own sign (page 14 examples in the data)', () => {
  const note = pmap.numbers.note;
  const found = [...note.matchAll(/(\d+) = ((?:\(\d+\))+)/g)];
  assert.ok(found.length >= 2);
  for (const m of found) {
    const want = [...m[2].matchAll(/\((\d+)\)/g)].map((x) => x[1]);
    const r = tr.translate([{ type: 'number', text: m[1] }]);
    assert.equal(r.ok, true, m[1]);
    assert.deepEqual(r.cells.map((c) => c.dots.join('')), want, m[1]);
    assert.equal(r.cells.filter((c) => c.kind === 'numberSign').length, 1);
  }
  for (const bad of ['', '1a', '①', '1.5', '-3']) assert.equal(tr.translate([{ type: 'number', text: bad }]).ok, false, bad);
});

test('punctuation: every entry in the map gives exactly the table cells of the symbol it names', () => {
  const all = table.map((r) => ({ symbol: r.symbol, cells: [r.dots] })).concat(extra.map((r) => ({ symbol: r.symbol, cells: r.cells })));
  let n = 0;
  for (const [chr, name] of Object.entries(pmap.punctuation)) {
    if (chr === 'note') continue;
    const r = tr.translate([{ type: 'punct', char: chr }]);
    assert.equal(r.ok, true, chr);
    assert.deepEqual(r.cells.map((c) => c.dots), all.find((x) => x.symbol === name).cells, chr);
    n++;
  }
  assert.ok(n >= 20);
  for (const bad of ['x', 'note', '', '。。']) assert.equal(tr.translate([{ type: 'punct', char: bad }]).ok, false, bad);
});

test('explicit blank tokens and mixed token lists keep their order', () => {
  const r = tr.translate([{ type: 'text', pinyin: 'hěn', chars: '很' }, { type: 'blank' }, { type: 'punct', char: Object.keys(pmap.punctuation)[0] }, { type: 'number', text: '7' }]);
  assert.equal(r.ok, true);
  const kinds = r.cells.map((c) => c.kind);
  assert.deepEqual(kinds.filter((k) => k === 'space'), ['space']);
  assert.ok(kinds.indexOf('space') < kinds.indexOf('punct') && kinds.indexOf('punct') < kinds.indexOf('numberSign'));
});

test('refusals carry a reason and the index of the offending token; nothing is guessed', () => {
  const r = tr.translate([{ type: 'text', pinyin: 'hěn', chars: '很' }, { type: 'text', pinyin: 'tǔ·xīngqì', chars: '土腥气' }]);
  assert.equal(r.ok, false);
  assert.equal(r.token, 1);
  assert.equal(r.reason, 'bad-char');
  assert.equal(tr.translate([{ type: 'wat' }]).reason, 'bad-token');
  assert.equal(tr.word('hěn', '很好').ok, false); // 音节数与字数不符
  assert.equal(tr.word('zxcv', '字').ok, false);
});

test('provenance: every cell says where it came from (table role or rule id)', () => {
  const r = word('shìyè', '事业');
  for (const c of r.cells) assert.ok(['initial', 'final', 'tone', 'space'].includes(c.kind));
  const tone = r.cells.find((c) => c.kind === 'tone');
  assert.ok(tone.rule && ruleOf(tone.rule));
  const c = word('nǐde', '你的').cells[0];
  assert.equal(c.rule, '11.1');
  assert.ok(r.cells.every((x) => Number.isInteger(x.syllable)));
});
