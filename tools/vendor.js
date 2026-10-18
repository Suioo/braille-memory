#!/usr/bin/env node
'use strict';
/**
 * 把第三方库的 UMD 文件从 node_modules 复制到 src/vendor/，并在 src/vendor/VENDOR.json 记录版本、许可与 sha256。
 * 用法：node tools/vendor.js          复制并更新记录
 *       node tools/vendor.js --check  只校验 src/vendor/ 里的文件与记录一致（不一致退出码 1）
 * 现仅 pinyin-pro（拼音与分词，只给拼音，从不给点位）。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'src', 'vendor');
const LIBS = [{ name: 'pinyin-pro', file: 'dist/index.js', as: 'pinyin-pro.js', license: 'LICENSE' }];
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function main() {
  const check = process.argv.includes('--check');
  const recFile = path.join(OUT, 'VENDOR.json');
  if (check) {
    const rec = JSON.parse(fs.readFileSync(recFile, 'utf8'));
    let bad = 0;
    for (const e of rec.libs) {
      const got = sha256(fs.readFileSync(path.join(OUT, e.as)));
      if (got !== e.sha256) { console.error('MISMATCH ' + e.as); bad++; } else console.log('ok ' + e.as + ' ' + e.version + ' ' + got);
    }
    process.exit(bad ? 1 : 0);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const libs = [];
  for (const l of LIBS) {
    const dir = path.join(ROOT, 'node_modules', l.name);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const buf = fs.readFileSync(path.join(dir, l.file));
    fs.writeFileSync(path.join(OUT, l.as), buf);
    fs.copyFileSync(path.join(dir, l.license), path.join(OUT, l.as.replace(/\.js$/, '.LICENSE')));
    libs.push({ name: l.name, version: pkg.version, license: pkg.license, as: l.as, from: l.name + '/' + l.file, bytes: buf.length, sha256: sha256(buf) });
    console.log('vendored ' + l.name + '@' + pkg.version + ' sha256=' + sha256(buf));
  }
  fs.writeFileSync(recFile, JSON.stringify({ libs }, null, 2) + '\n');
}
main();
