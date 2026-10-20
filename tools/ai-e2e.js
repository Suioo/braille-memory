'use strict';
/**
 * AI 校对端到端自检（不连真实服务）：本机起一个模拟的 OpenAI 兼容接口，再用 Electron 的 e2e 模式跑一遍
 * 「保存配置 → 查询模型 → 新建文本 → AI 校对（第一次请求返回 503，应自动重试）→ 写回」，检查经由主进程发出的请求和结果校验。
 * 用法（项目根）：node tools/ai-e2e.js
 */
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const electron = require('electron');
const lib = require('../src/vendor/pinyin-pro.js');

const seen = { models: 0, chat: 0, auth: null };
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    seen.auth = req.headers.authorization || null;
    if (req.url === '/v1/models') { seen.models++; res.end(JSON.stringify({ data: [{ id: 'mock-b' }, { id: 'mock-a' }, { id: 'text-embedding-x' }] })); return; }
    if (req.url === '/v1/chat/completions') {
      seen.chat++;
      if (seen.chat === 1) { res.statusCode = 503; res.end(JSON.stringify({ error: { message: 'busy' } })); return; } // 第一次故意失败：应自动重试
      const j = JSON.parse(body);
      const user = j.messages.find((m) => m.role === 'user').content;
      let runs = [];
      try { runs = JSON.parse(user).runs || []; } catch (_) { /* 测试连接 */ }
      // 模拟模型：每段整体连写（拼音取自拼音库）；第二段故意改一个字，应被校验拒绝，并被单独重问一次（重问时它是唯一一段，就答对了）
      const out = runs.map((r, i) => ({ id: r.id, w: [[i === 1 ? r.text.replace(/./u, '错') : r.text, lib.pinyin(r.text, { type: 'array', toneType: 'symbol', toneSandhi: false }).join(' ')]] }));
      let asked = {};
      try { asked = JSON.parse(user); } catch (_) { /* 测试连接 */ }
      const answer = asked.pinyin ? JSON.stringify({ text: '你的书包' }) : runs.length ? '<think>先想想 {不是结果}</think>```json\n' + JSON.stringify({ runs: out }) + '\n```' : 'OK';
      if (j.stream) {
        // 模拟推理模型的流式回复：先发几段思考，再分段发回答（SSE）
        seen.stream = (seen.stream || 0) + 1;
        res.setHeader('content-type', 'text/event-stream');
        const send = (o) => res.write('data: ' + JSON.stringify(o) + '\n\n');
        send({ choices: [{ delta: { reasoning_content: '思考中……' } }] });
        send({ choices: [{ delta: { reasoning_content: '继续思考' } }] });
        for (let i = 0; i < answer.length; i += 20) send({ choices: [{ delta: { content: answer.slice(i, i + 20) } }] });
        res.end('data: [DONE]\n\n');
        return;
      }
      res.end(JSON.stringify({ choices: [{ message: { content: answer } }] }));
      return;
    }
    res.statusCode = 404; res.end('{}');
  });
});
server.listen(18080, '127.0.0.1', () => {
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-ai-e2e-'));
  const child = spawn(electron, ['.', '--e2e=ai-mock', '--user-data=' + ud], { cwd: path.join(__dirname, '..') });
  let log = '';
  child.stdout.on('data', (d) => { log += d; });
  child.stderr.on('data', (d) => { log += d; });
  const kill = setTimeout(() => child.kill(), 60000);
  child.on('exit', () => { clearTimeout(kill); server.close(); report(log); });
});
function report(log) {
  const line = log.split(/\r?\n/).find((l) => l.includes('e2e ai '));
  console.log(line || log.slice(-2000));
  console.log('server saw: models=' + seen.models + ' chat=' + seen.chat + ' stream=' + seen.stream + ' auth=' + seen.auth);
  const ok = line && /ok=true/.test(line) && /changed=2/.test(line) && /rejected=0/.test(line) && /models=mock-a,mock-b/.test(line) && /hanzi=你的书包:true/.test(line) && seen.auth === 'Bearer sk-e2e' && seen.chat === 4 && seen.stream === 3;
  console.log(ok ? 'PASS' : 'FAIL');
  process.exit(ok ? 0 : 1);
}
