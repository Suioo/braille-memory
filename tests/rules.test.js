'use strict';
// 规则数据的载入与校验：真实 data/rules.json 必须通过；结构错误必须被明确指出。
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/core/rules.js');
const { rulesText, rules } = require('./helpers/fixtures.js');

const base = () => JSON.parse(rulesText);
const parse = (o) => R.parseRules(JSON.stringify(o));
const rule = (o, id) => o.rules.find((r) => r.id === id);
const apply = (o, id) => rule(o, id).apply;

test('data/rules.json passes validation, every rule type used is known', () => {
  assert.deepEqual(rules.errors, []);
  assert.deepEqual(rules.warnings, []);
  assert.equal(rules.ok, true);
  assert.ok(rules.rules.length > 0);
  for (const t of rules.byType.keys()) assert.ok(R.TYPES.includes(t), t);
  assert.equal(new Set(rules.rules.map((r) => r.id)).size, rules.rules.length);
});

test('forms: every dots entry is a valid cell, parsed to sorted digits', () => {
  assert.ok(rules.forms.length > 0);
  for (const f of rules.forms) {
    assert.ok(f.dots.length >= 1);
    for (const d of f.dots) assert.ok(d.length >= 1 && d.every((x) => x >= 1 && x <= 6) && d.every((x, i) => !i || x > d[i - 1]));
    assert.equal(rules.byId.get(f.rule).forms.some((x) => x.word === f.word), true);
  }
});

test('loadRules: missing file is not an error; bad JSON is', () => {
  assert.deepEqual(R.loadRules(null), { ok: false, missing: true, errors: [], warnings: [] });
  assert.equal(R.loadRules('{oops').ok, false);
  assert.deepEqual(R.loadRules('{oops').errors, ['json']);
  assert.deepEqual(R.loadRules('[]').errors, ['not-object']);
  const good = R.loadRules(rulesText);
  assert.equal(good.ok, true);
  assert.equal(good.rules.byId.size, rules.byId.size);
});

test('dotsOf', () => {
  assert.deepEqual(R.dotsOf('2345'), [2, 3, 4, 5]);
  assert.deepEqual(R.dotsOf('21'), [1, 2]);
  for (const bad of ['', '0', '7', '11', 'a', '1 2', null, 5]) assert.equal(R.dotsOf(bad), null, String(bad));
});

test('structure errors are reported with rule ids', () => {
  const cases = [
    [(o) => { o.version = 'x'; }, 'version'],
    [(o) => { o.rules = []; }, 'rules'],
    [(o) => { o.rules.push(Object.assign({}, o.rules[0])); }, 'dup-id:' + base().rules[0].id],
    [(o) => { delete rule(o, '9.2').text; }, 'text:9.2'],
    [(o) => { delete rule(o, '9.2').cat; }, 'cat:9.2'],
    [(o) => { rule(o, '9.4').forms[0].dots = ['9']; }, 'bad-form:9.4#他'],
    [(o) => { rule(o, '9.4').forms[0].dots = []; }, 'bad-form:9.4#他'],
    [(o) => { rule(o, '9.1').examples.push(['只有一项']); }, 'bad-example:9.1#3'],
    [(o) => { rule(o, '9.1').apply = { type: 'nope' }; }, 'unknown-apply:9.1:nope'],
    [(o) => { rule(o, '9.1').apply = 'x'; }, 'bad-apply:9.1'],
    [(o) => { delete apply(o, '9.2').syllables; }, 'apply-apical:9.2:syllables'],
    [(o) => { apply(o, '10.2.1').tone = 5; }, 'apply-omitTone:10.2.1:tone'],
    [(o) => { apply(o, '10.2.1').initials = []; }, 'apply-omitTone:10.2.1:initials'],
    [(o) => { apply(o, '10.2.4').overriddenBy = ['no.such']; }, 'apply-omitTone:10.2.4:overriddenBy'],
    [(o) => { apply(o, '10.2.7').disable = ['no.such']; }, 'apply-disableRules:10.2.7:disable'],
    [(o) => { apply(o, '10.2.7').when.this = 'other'; }, 'apply-disableRules:10.2.7:when'],
    [(o) => { apply(o, '10.2.8').marker = '!!'; }, 'apply-manualKeepTone:10.2.8:marker'],
    [(o) => { apply(o, '10.2.5').omit = []; apply(o, '10.2.5').keep = []; }, 'apply-syllableTone:10.2.5:empty'],
    [(o) => { apply(o, '11.2').chars = []; }, 'apply-blockContraction:11.2:chars'],
    [(o) => { apply(o, '9.4').chars = ['无']; }, 'apply-specialForm:9.4:chars-without-forms'],
    [(o) => { delete rule(o, '11.1').forms; }, 'apply-contraction:11.1:forms'],
    [(o) => { apply(o, '10.1.1').neutralTone = 'x'; }, 'apply-toneEverySyllable:10.1.1:neutralTone'],
  ];
  for (const [mut, want] of cases) {
    const o = base(); mut(o);
    const r = parse(o);
    assert.equal(r.ok, false, want);
    assert.ok(r.errors.includes(want), want + ' ∉ ' + r.errors.join(','));
  }
});

test('a rule without apply is allowed but warned about (engine ignores it)', () => {
  const o = base(); delete rule(o, '12.1').apply;
  const r = parse(o);
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, ['no-apply:12.1']);
  assert.equal(r.byType.has('info'), false);
});
