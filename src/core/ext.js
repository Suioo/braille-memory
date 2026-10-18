/**
 * 扩展符号（data/braille_extra.csv）的分组与出题选项（纯函数，随机源可注入）。
 *
 * 避免歧义的规则：
 *  1. 选项只从目标所在的同一类别取；绝不与主表或别的类别混用（扩展表里很多单方符号与主表点位重复）。
 *  2. 同一道题的选项点位两两不同。
 *  3. 同类别内点位完全相同的符号（如成对的前 / 后符号）互为「歧义组」：
 *     「看点位选符号」里它们既不作目标也不作干扰项；「看符号选点位」不受影响。
 *     歧义组由数据算出，不是手写名单。
 * 渲染进程：window.BMExt；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./pick.js'));
  else root.BMExt = factory(root.BMPick);
})(typeof self !== 'undefined' ? self : this, function (Pick) {
  'use strict';

  /**
   * @param {{id:number, category:string, cellsText:string}[]} rows
   * @returns {{rows:object[], cats:{name:string,count:number}[], byId:Map, ambiguous:Set<number>, groups:{category:string, cellsText:string, ids:number[]}[]}}
   */
  function build(rows) {
    const cats = new Map();
    const groupMap = new Map();
    for (const r of rows) {
      cats.set(r.category, (cats.get(r.category) || 0) + 1);
      const k = r.category + '\u0000' + r.cellsText;
      if (!groupMap.has(k)) groupMap.set(k, { category: r.category, cellsText: r.cellsText, ids: [] });
      groupMap.get(k).ids.push(r.id);
    }
    const groups = [...groupMap.values()].filter((g) => g.ids.length > 1);
    return {
      rows,
      cats: [...cats].map(([name, count]) => ({ name, count })),
      byId: new Map(rows.map((r) => [r.id, r])),
      ambiguous: new Set(groups.flatMap((g) => g.ids)),
      groups,
    };
  }

  /** 该符号能否作「看点位选符号」的目标（不在歧义组里）。 */
  const canChooseSymbol = (ext, row) => !ext.ambiguous.has(row.id);

  /**
   * 「看符号选点位」的选项（每个选项是一个符号，题面展示其各方点位）：目标 + 同类别干扰项，点位两两不同。
   * @returns {object[]|null} 目标位置随机；凑不出 2 个选项返回 null
   */
  function chooseCells(ext, target, rng, n) {
    const used = new Set([target.cellsText]);
    const chosen = [];
    for (const row of Pick.shuffle(ext.rows.filter((r) => r.category === target.category), rng)) {
      if (chosen.length >= n - 1) break;
      if (used.has(row.cellsText)) continue;
      used.add(row.cellsText);
      chosen.push(row);
    }
    if (!chosen.length) return null;
    chosen.splice(Math.floor(rng() * (chosen.length + 1)), 0, target);
    return chosen;
  }

  /**
   * 「看点位选符号」的选项：目标 + 同类别干扰项，点位两两不同，且不含歧义组里的符号。
   * @returns {object[]|null} 目标属于歧义组或凑不出 2 个选项返回 null
   */
  function chooseSymbol(ext, target, rng, n) {
    if (!canChooseSymbol(ext, target)) return null;
    const used = new Set([target.cellsText]);
    const chosen = [];
    for (const row of Pick.shuffle(ext.rows.filter((r) => r.category === target.category && canChooseSymbol(ext, r)), rng)) {
      if (chosen.length >= n - 1) break;
      if (used.has(row.cellsText)) continue;
      used.add(row.cellsText);
      chosen.push(row);
    }
    if (!chosen.length) return null;
    chosen.splice(Math.floor(rng() * (chosen.length + 1)), 0, target);
    return chosen;
  }

  return { build, canChooseSymbol, chooseCells, chooseSymbol };
});
