'use strict';
// www 组装：字表必须逐字节复制；主进程 Node 代码不进 www。只写系统临时目录。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { buildWww, DATA_FILES } = require('../tools/build-www.js');
const { ROOT } = require('./helpers/fixtures.js');

test('buildWww copies CSV and config byte-identically and the app sources', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'bm-www-'));
  const r = buildWww(ROOT, out);
  for (const f of DATA_FILES) {
    const a = fs.readFileSync(path.join(ROOT, 'data', f));
    const b = fs.readFileSync(path.join(out, 'data', f));
    assert.ok(a.equals(b), f + ' differs');
  }
  assert.equal(r.data.length, DATA_FILES.length);
  for (const must of ['index.html', 'styles.css', 'app.js', 'platform/web.js', 'platform/web-store.js', 'core/csv.js']) {
    assert.ok(fs.existsSync(path.join(out, must)), must);
  }
  assert.equal(fs.existsSync(path.join(out, 'main')), false);
  // index.html 引用的每个脚本都在 www 里
  const html = fs.readFileSync(path.join(out, 'index.html'), 'utf8');
  for (const m of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(out, m[1])), m[1]);
});
