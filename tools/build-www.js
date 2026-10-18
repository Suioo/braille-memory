'use strict';
/**
 * 组装 Capacitor 的 webDir（www/）：
 *   src/**（不含 src/main/，那是 Electron 主进程用的 Node 代码）→ www/
 *   data/braille_table.csv、data/config.json → www/data/（逐字节复制，从不修改字表）
 * 用法：node tools/build-www.js [输出目录，默认 www]
 * 只覆盖写入，不删除旧文件（删除需用户确认）。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const DATA_FILES = ['braille_table.csv', 'config.json'];
const EXCLUDE_DIRS = new Set(['main']);

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function copyTree(src, dst, rel, out) {
  fs.mkdirSync(dst, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const r = rel ? rel + '/' + ent.name : ent.name;
    if (ent.isDirectory()) {
      if (!rel && EXCLUDE_DIRS.has(ent.name)) continue;
      copyTree(path.join(src, ent.name), path.join(dst, ent.name), r, out);
    } else if (ent.isFile()) {
      fs.copyFileSync(path.join(src, ent.name), path.join(dst, ent.name));
      out.push(r);
    }
  }
}

/**
 * @param {string} [root] 项目根
 * @param {string} [outDir] 输出目录
 * @returns {{files: string[], data: {file:string, sha256:string}[]}}
 */
function buildWww(root, outDir) {
  root = root || ROOT;
  outDir = outDir || path.join(root, 'www');
  const files = [];
  copyTree(path.join(root, 'src'), outDir, '', files);
  const dataDir = path.join(outDir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const data = [];
  for (const f of DATA_FILES) {
    const from = path.join(root, 'data', f);
    const to = path.join(dataDir, f);
    fs.copyFileSync(from, to);
    const a = sha256(from);
    if (a !== sha256(to)) throw new Error('copy mismatch: ' + f);
    data.push({ file: 'data/' + f, sha256: a });
    files.push('data/' + f);
  }
  // 版本号唯一来源：package.json → www/version.json（页面经 window.bm.boot() 读取）
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  fs.writeFileSync(path.join(outDir, 'version.json'), JSON.stringify({ version: pkg.version }) + '\n');
  files.push('version.json');
  // 可选的本机私有联系方式：private/contact.json 存在才复制（仓库不含该文件）
  const contact = path.join(root, 'private', 'contact.json');
  if (fs.existsSync(contact)) { fs.copyFileSync(contact, path.join(outDir, 'contact.json')); files.push('contact.json'); }
  return { files, data };
}

module.exports = { buildWww, DATA_FILES };

if (require.main === module) {
  const out = path.resolve(process.argv[2] || path.join(ROOT, 'www'));
  const r = buildWww(ROOT, out);
  console.log('www: ' + r.files.length + ' files -> ' + out);
  for (const d of r.data) console.log('  ' + d.file + ' sha256=' + d.sha256);
}
