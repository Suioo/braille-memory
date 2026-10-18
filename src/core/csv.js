/**
 * 字表解析（纯函数，不碰 DOM，不读文件）。
 * 主进程用 require() 载入；渲染进程用 <script> 载入后挂在 window.BMCsv。
 * 点位只来自 data/braille_table.csv，本文件不含任何具体符号的点位。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMCsv = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 表头必须包含的列。 */
  const REQUIRED_COLUMNS = ['id', 'symbol', 'dots', 'source', 'category'];

  /**
   * 把 CSV 文本拆成二维字符串数组（支持双引号、"" 转义、CRLF、BOM）。
   * @param {string} text
   * @returns {string[][]}
   */
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false;
        } else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
  }

  /**
   * 解析并校验字表。
   * @param {string} text CSV 全文
   * @returns {{rows: {id:number, symbol:string, dots:number[], dotsText:string, source:string, category:string}[],
   *            errors: string[], warnings: string[]}}
   */
  function parseTable(text) {
    const errors = [];
    const warnings = [];
    const out = [];
    const grid = parseCsv(String(text || ''));
    if (grid.length === 0) return { rows: out, errors: ['empty'], warnings };
    const header = grid[0].map((s) => s.trim());
    const col = {};
    for (const name of REQUIRED_COLUMNS) {
      col[name] = header.indexOf(name);
      if (col[name] < 0) errors.push('missing-column:' + name);
    }
    if (errors.length) return { rows: out, errors, warnings };

    const seenIds = new Set();
    const seenDots = new Map();
    for (let r = 1; r < grid.length; r++) {
      const cells = grid[r];
      const line = r + 1;
      const get = (k) => (cells[col[k]] === undefined ? '' : cells[col[k]].trim());
      const id = Number(get('id'));
      const symbol = get('symbol');
      const dotsText = get('dots');
      const category = get('category');
      if (!Number.isInteger(id) || id <= 0) { errors.push('bad-id@' + line); continue; }
      if (seenIds.has(id)) { errors.push('dup-id@' + line); continue; }
      if (!symbol) { errors.push('empty-symbol@' + line); continue; }
      if (!category) { errors.push('empty-category@' + line); continue; }
      if (!/^[1-6]{1,6}$/.test(dotsText) || new Set(dotsText).size !== dotsText.length) {
        errors.push('bad-dots@' + line); continue;
      }
      seenIds.add(id);
      const dots = dotsText.split('').map(Number).sort((a, b) => a - b);
      const key = dots.join('');
      if (seenDots.has(key)) warnings.push('dup-dots@' + line + '=' + seenDots.get(key));
      else seenDots.set(key, line);
      out.push({ id, symbol, dots, dotsText: key, source: get('source'), category });
    }
    return { rows: out, errors, warnings };
  }

  /**
   * 按首次出现顺序列出类别及数量（类别名完全来自 CSV）。
   * @param {{category:string}[]} rows
   * @returns {{name:string, count:number}[]}
   */
  function categoriesOf(rows) {
    const map = new Map();
    for (const r of rows) map.set(r.category, (map.get(r.category) || 0) + 1);
    return [...map].map(([name, count]) => ({ name, count }));
  }

  // ---------- 扩展符号表（data/braille_extra.csv）：每个符号可由多方组成 ----------
  const EXTRA_REQUIRED_COLUMNS = ['id', 'symbol', 'cells', 'source', 'category'];

  /**
   * 解析一个符号的各方点位："5 23" → [[5],[2,3]]。每方 1–6 个不重复的点位编号；其余返回 null。
   * @param {string} text 空格分隔各方
   * @returns {{cells:number[][], cellsText:string, sorted:boolean}|null} cellsText 为各方升序后以空格连接的规范形式
   */
  function parseCells(text) {
    const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return null;
    const cells = [];
    let sorted = true;
    for (const p of parts) {
      if (!/^[1-6]{1,6}$/.test(p) || new Set(p).size !== p.length) return null;
      const dots = p.split('').map(Number);
      const asc = dots.slice().sort((a, b) => a - b);
      if (asc.join('') !== p) sorted = false;
      cells.push(asc);
    }
    return { cells, cellsText: cells.map((c) => c.join('')).join(' '), sorted };
  }

  /**
   * 解析扩展符号表（纯函数）。note 列可选。
   * @param {string} text CSV 全文
   * @returns {{rows: {id:number, symbol:string, cells:number[][], cellsText:string, source:string, category:string, note:string}[],
   *            errors: string[], warnings: string[]}}
   */
  function parseExtra(text) {
    const errors = [];
    const warnings = [];
    const out = [];
    const grid = parseCsv(String(text || ''));
    if (grid.length === 0) return { rows: out, errors: ['empty'], warnings };
    const header = grid[0].map((s) => s.trim());
    const col = {};
    for (const name of EXTRA_REQUIRED_COLUMNS) {
      col[name] = header.indexOf(name);
      if (col[name] < 0) errors.push('missing-column:' + name);
    }
    col.note = header.indexOf('note');
    if (errors.length) return { rows: out, errors, warnings };
    const seenIds = new Set();
    for (let r = 1; r < grid.length; r++) {
      const line = r + 1;
      const get = (k) => (col[k] < 0 || grid[r][col[k]] === undefined ? '' : grid[r][col[k]].trim());
      const id = Number(get('id'));
      const symbol = get('symbol');
      const category = get('category');
      if (!Number.isInteger(id) || id <= 0) { errors.push('bad-id@' + line); continue; }
      if (seenIds.has(id)) { errors.push('dup-id@' + line); continue; }
      if (!symbol) { errors.push('empty-symbol@' + line); continue; }
      if (!category) { errors.push('empty-category@' + line); continue; }
      const parsed = parseCells(get('cells'));
      if (!parsed) { errors.push('bad-cells@' + line); continue; }
      if (!parsed.sorted) warnings.push('unsorted-cells@' + line);
      seenIds.add(id);
      out.push({ id, symbol, cells: parsed.cells, cellsText: parsed.cellsText, source: get('source'), category, note: get('note') });
    }
    return { rows: out, errors, warnings };
  }

  /**
   * 载入扩展表并与主表交叉校验（id 不得相撞）。text 为 null = 文件不存在（该功能整体隐藏，不算错误）。
   * @param {string|null} text
   * @param {{id:number}[]} mainRows
   * @returns {{ok:boolean, missing?:boolean, rows:object[], errors:string[], warnings?:string[]}}
   */
  function loadExtra(text, mainRows) {
    if (text == null) return { ok: false, missing: true, rows: [], errors: [] };
    const res = parseExtra(text);
    const errors = res.errors.slice();
    const mainIds = new Set((mainRows || []).map((r) => r.id));
    for (const r of res.rows) if (mainIds.has(r.id)) errors.push('id-clash:' + r.id);
    if (!errors.length && !res.rows.length) errors.push('empty');
    if (errors.length) return { ok: false, rows: [], errors, warnings: res.warnings };
    return { ok: true, rows: res.rows, errors: [], warnings: res.warnings };
  }

  return { REQUIRED_COLUMNS, EXTRA_REQUIRED_COLUMNS, parseCsv, parseTable, categoriesOf, parseCells, parseExtra, loadExtra };
});
