'use strict';
// AI 校对（纯逻辑）：配置清洗、三种接口的请求 / 响应格式、模型列表、结果校验（不发网络请求）。
const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('../src/core/ai.js');
const { translator, rules } = require('./helpers/fixtures.js');

const cfg = (o) => AI.normalizeConfig(Object.assign({ preset: 'deepseek', key: 'sk-test', model: 'deepseek-chat' }, o));

test('config: unknown preset falls back, keys lose whitespace, remote http is refused, LAN http allowed', () => {
  assert.equal(AI.normalizeConfig({ preset: 'nope' }).preset, 'deepseek');
  assert.equal(cfg({ key: ' sk-a b ' }).key, 'sk-ab');
  assert.equal(AI.normalizeBase('http://api.example.com/v1'), null);
  assert.equal(AI.normalizeBase('https://user:pw@api.example.com/v1'), null);
  assert.equal(AI.normalizeBase('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(AI.normalizeBase('http://192.168.1.5:11434/v1'), 'http://192.168.1.5:11434/v1');
  assert.equal(AI.normalizeBase('http://localhost:1234/v1'), 'http://localhost:1234/v1');
  assert.equal(AI.ready(cfg({})), true);
  assert.equal(AI.ready(cfg({ key: '' })), false);
  assert.equal(AI.ready({ preset: 'ollama', model: 'qwen2.5' }), true); // 本机服务不要 Key
  assert.equal(AI.ready(cfg({ model: '' })), false);
});

test('requests: each API kind gets its own URL, auth header and body shape', () => {
  const o = AI.chatRequest(cfg({}), 'SYS', 'USER');
  assert.equal(o.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.equal(o.headers.authorization, 'Bearer sk-test');
  assert.deepEqual(JSON.parse(o.body).messages.map((m) => m.role), ['system', 'user']);
  const a = AI.chatRequest(cfg({ preset: 'anthropic', model: 'claude-x' }), 'SYS', 'USER');
  assert.equal(a.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(a.headers['x-api-key'], 'sk-test');
  assert.equal(JSON.parse(a.body).system, 'SYS');
  const g = AI.chatRequest(cfg({ preset: 'gemini', model: 'gemini-2.5-flash' }), 'SYS', 'USER');
  assert.equal(g.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
  assert.equal(g.headers['x-goog-api-key'], 'sk-test');
  assert.ok(!g.url.includes('sk-test')); // Key 不放进地址
  assert.equal(AI.modelsRequest(cfg({})).url, 'https://api.deepseek.com/v1/models');
  assert.equal(AI.modelsRequest(cfg({ preset: 'ollama', key: '' })).headers.authorization, undefined);
});

test('model lists from all three formats; non-chat models filtered out', () => {
  assert.deepEqual(AI.parseModels('openai', JSON.stringify({ data: [{ id: 'gpt-b' }, { id: 'text-embedding-3' }, { id: 'gpt-a' }, { id: 'gpt-a' }] })), ['gpt-a', 'gpt-b']);
  assert.deepEqual(AI.parseModels('anthropic', JSON.stringify({ data: [{ id: 'claude-1', type: 'model' }] })), ['claude-1']);
  assert.deepEqual(AI.parseModels('gemini', JSON.stringify({ models: [
    { name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }] })), ['gemini-x']);
  assert.equal(AI.parseModels('openai', 'not json'), null);
});

test('chat responses from all three formats', () => {
  assert.equal(AI.parseChat('openai', JSON.stringify({ choices: [{ message: { content: 'A' } }] })), 'A');
  assert.equal(AI.parseChat('anthropic', JSON.stringify({ content: [{ type: 'text', text: 'B' }] })), 'B');
  assert.equal(AI.parseChat('gemini', JSON.stringify({ candidates: [{ content: { parts: [{ text: 'C' }] } }] })), 'C');
  assert.equal(AI.errorMessage(JSON.stringify({ error: { message: 'bad key' } })), 'bad key');
  assert.deepEqual(AI.extractJson('```json\n{"runs":[]}\n```'), { runs: [] });
});

test('system prompt carries chapter 12 text and examples from rules.json', () => {
  const s = AI.systemPrompt(rules);
  assert.ok(s.includes('12.2.5'));
  assert.ok(s.includes('孩子们'));
});

test('runs skip hand-edited segments; validation requires exact characters and parseable pinyin', () => {
  const toks = [{ k: 'w', c: '老师', p: 'lǎoshī', a: 'auto' }, { k: 'w', c: '们', p: 'men', a: 'auto' }, { k: 'u', c: '，' }, { k: 'w', c: '你好', p: 'nǐhǎo', a: 'edited' }];
  const runs = AI.runsOf('s1', toks);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].text, '老师们');
  const ok = AI.validateRun(runs[0], [['老师们', 'lǎo shī men']], translator.parse);
  assert.deepEqual(ok, [{ k: 'w', c: '老师们', p: 'lǎoshīmen', a: 'ai' }]);
  assert.equal(AI.validateRun(runs[0], [['老师', 'lǎo shī']], translator.parse), null); // 少字
  assert.equal(AI.validateRun(runs[0], [['老帅们', 'lǎo shuài men']], translator.parse), null); // 改字
  assert.equal(AI.validateRun(runs[0], [['老师们', 'lǎo shī']], translator.parse), null); // 音节数不对
  assert.equal(AI.validateRun(runs[0], [['老师们', 'lǎo shī mxn']], translator.parse), null); // 拼音不合法
  const ta = AI.validateRun({ text: '天安门' }, [['天安门', 'tiān ān mén']], translator.parse);
  assert.equal(ta[0].p, "tiān'ānmén"); // a 开头的音节前加隔音符号，引擎能无歧义地解析
  const applied = AI.applyRuns(toks, [{ start: runs[0].start, end: runs[0].end, tokens: ok }]);
  assert.equal(applied.changed, 1);
  assert.deepEqual(applied.tokens.map((t) => t.c), ['老师们', '，', '你好']);
  assert.equal(AI.applyRuns(toks, [{ start: 3, end: 4, tokens: [toks[3]] }]).changed, 0);
});

test('batches stay under the size limits', () => {
  const runs = Array.from({ length: 100 }, (_, i) => ({ id: 'r' + i, text: '汉字汉字汉字汉字汉字汉字汉字汉字汉字汉字' }));
  const b = AI.batches(runs);
  assert.ok(b.length > 1);
  for (const x of b) { assert.ok(x.length <= AI.LIMITS.batchRuns); assert.ok(x.reduce((n, r) => n + r.text.length, 0) <= AI.LIMITS.batchChars); }
  assert.equal(b.flat().length, 100);
});

test('stream parser: SSE from all three formats, split anywhere; reasoning counted separately; <think> stripped', () => {
  const sse = (objs) => objs.map((o) => 'data: ' + JSON.stringify(o) + '\n\n').join('') + 'data: [DONE]\n\n';
  const feedAll = (kind, text) => { const p = AI.createStreamParser(kind); for (let i = 0; i < text.length; i += 7) p.feed(text.slice(i, i + 7)); p.end(); return p; };
  const o = feedAll('openai', sse([{ choices: [{ delta: { reasoning_content: '想' } }] }, { choices: [{ delta: { content: '{"runs"' } }] }, { choices: [{ delta: { content: ':[]}' } }] }]));
  assert.equal(o.content(), '{"runs":[]}');
  assert.equal(o.reasoning(), 1);
  const a = feedAll('anthropic', sse([{ type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'ab' } }, { type: 'content_block_delta', delta: { type: 'text_delta', text: 'X' } }]));
  assert.equal(a.content(), 'X');
  assert.equal(a.reasoning(), 2);
  const g = feedAll('gemini', sse([{ candidates: [{ content: { parts: [{ text: 'Y' }] } }] }]));
  assert.equal(g.content(), 'Y');
  assert.deepEqual(AI.extractJson('<think>{"a":1}</think>{"runs":[1]}'), { runs: [1] });
  assert.equal(JSON.parse(AI.chatRequest(cfg({}), 's', 'u', { stream: true }).body).stream, true);
  assert.ok(AI.chatRequest(cfg({ preset: 'gemini', model: 'g' }), 's', 'u', { stream: true }).url.endsWith(':streamGenerateContent?alt=sse'));
  assert.equal(AI.isReasoningModel('deepseek-r1'), true);
  assert.equal(AI.isReasoningModel('DeepSeek-R1-Distill-Qwen'), true);
  assert.equal(AI.isReasoningModel('deepseek-chat'), false);
});

test('checkRun reports why a result was rejected; tone-number pinyin and v are accepted', () => {
  const run = { text: '绿色' };
  assert.equal(AI.checkRun(run, undefined, translator.parse).reason, 'missing');
  assert.equal(AI.checkRun(run, 'x', translator.parse).reason, 'format');
  assert.equal(AI.checkRun(run, [['绿', 'lǜ']], translator.parse).reason, 'chars');
  assert.equal(AI.checkRun(run, [['绿色', 'lǜ']], translator.parse).reason, 'syllables');
  assert.equal(AI.checkRun(run, [['绿色', 'lǜ qqq']], translator.parse).reason, 'pinyin');
  const ok = AI.checkRun(run, [['绿色', 'lv4 se4']], translator.parse);
  assert.equal(ok.ok, true);
  assert.equal(ok.tokens[0].p, 'lǜsè');
  assert.equal(AI.normalizeSyllable('shou3'), 'shǒu');
  assert.equal(AI.normalizeSyllable('le5'), 'le');
  assert.ok(AI.userPrompt([{ id: 'r0', text: '你', auto: '你' }], 'N').includes('"note":"N"'));
});
