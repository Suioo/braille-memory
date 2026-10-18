'use strict';
/**
 * 批量截图：每个页面 × 浅色/深色 × 720x960/480x640，另加一个非默认配色（720x960）。
 * 用法（项目根）：node tools/shots.js [输出目录，默认 docs/shots]
 * 截图运行使用临时数据目录，不读写真实存档。
 */
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const electron = require('electron'); // 在 Node 中返回 electron 可执行文件路径

const root = path.join(__dirname, '..');
const out = path.resolve(process.argv[2] || path.join(root, 'docs', 'shots'));
const runs = [
  ['--sizes=720x960,480x640', '--themes=light,dark'],
  ['--sizes=720x960', '--themes=light,dark', '--seed=terracotta'],
];
let failed = false;
for (const extra of runs) {
  const r = spawnSync(electron, ['.', '--shot-all=' + out, ...extra], { cwd: root, stdio: 'inherit', timeout: 600000 });
  if (r.status !== 0) { failed = true; console.error('run failed: ' + extra.join(' ')); }
}
process.exit(failed ? 1 : 0);
