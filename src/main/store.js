'use strict';
/**
 * 主进程存档：JSON 文件，原子写入（先写 .tmp 再改名），
 * 读到损坏文件先改名备份为 .corrupt（已存在则加时间戳）。
 * 目录由调用方注入（app.getPath('userData') 或测试临时目录）。
 */
const fs = require('node:fs');
const path = require('node:path');

class Store {
  /**
   * @param {string} dir 存档目录
   * @param {string} [name] 文件名
   */
  constructor(dir, name) {
    this.dir = dir;
    this.file = path.join(dir, name || 'progress.json');
  }

  /**
   * 读取存档。
   * @returns {{status:'ok'|'empty'|'corrupt', data:object|null, backup?:string}}
   */
  load() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return { status: 'empty', data: null };
      throw e;
    }
    try {
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('not object');
      return { status: 'ok', data };
    } catch (_) {
      const backup = this.backupCorrupt();
      return { status: 'corrupt', data: null, backup };
    }
  }

  /** 把损坏文件改名为 .corrupt（不覆盖已有备份）。 */
  backupCorrupt() {
    let target = this.file + '.corrupt';
    if (fs.existsSync(target)) target = this.file + '.' + Date.now() + '.corrupt';
    fs.renameSync(this.file, target);
    return target;
  }

  /**
   * 原子写入。
   * @param {object} data
   */
  save(data) {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 1), 'utf8');
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store };
