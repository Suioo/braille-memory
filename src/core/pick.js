/**
 * 随机与抽题（纯函数，随机源可注入以便测试确定）。
 * 渲染进程：window.BMPick；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPick = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 可复现的伪随机数（mulberry32）。
   * @param {number} seed
   * @returns {() => number} [0,1)
   */
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Fisher–Yates，返回新数组。 */
  function shuffle(arr, rng) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * 按权重抽一个；avoidId 在有其它候选时不会被抽到（避免紧挨着重复）。
   * @template T
   * @param {T[]} items
   * @param {(x:T)=>number} weight 非负权重
   * @param {() => number} rng
   * @param {*} [avoidId] 与 item.id 比较
   * @returns {T|null}
   */
  function pickWeighted(items, weight, rng, avoidId) {
    let pool = items;
    if (avoidId !== undefined && items.length > 1) pool = items.filter((x) => x.id !== avoidId);
    if (pool.length === 0) return null;
    const ws = pool.map((x) => Math.max(0, weight(x)));
    const total = ws.reduce((s, w) => s + w, 0);
    if (total <= 0) return pool[Math.floor(rng() * pool.length)];
    let r = rng() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= ws[i];
      if (r < 0) return pool[i];
    }
    return pool[pool.length - 1];
  }

  /**
   * 「看点位选符号」的选项：目标 + 干扰项，所有选项点位互不相同。
   * 先从 pool（当前范围）取干扰项，不够再从 fallback（全表）补。
   * @param {{id:number, dotsText:string}} target
   * @param {object[]} pool
   * @param {object[]} fallback
   * @param {() => number} rng
   * @param {number} n 选项数
   * @returns {object[]} 长度 ≤ n，目标位置随机
   */
  function makeOptions(target, pool, fallback, rng, n) {
    const used = new Set([target.dotsText]);
    const chosen = [];
    for (const source of [pool, fallback]) {
      for (const row of shuffle(source, rng)) {
        if (chosen.length >= n - 1) break;
        if (used.has(row.dotsText)) continue;
        used.add(row.dotsText);
        chosen.push(row);
      }
    }
    const at = Math.floor(rng() * (chosen.length + 1));
    chosen.splice(at, 0, target);
    return chosen;
  }

  /**
   * 打乱且尽量不让相同 id 相邻（测验每符号出现多次时用）。
   * @param {object[]} items 带 id
   * @param {() => number} rng
   */
  function shuffleNoAdjacent(items, rng) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const a = shuffle(items, rng);
      if (a.every((x, i) => i === 0 || a[i - 1].id !== x.id)) return a;
    }
    // 贪心兜底：每次取剩余最多且与上一个不同的
    const left = new Map();
    for (const x of items) {
      if (!left.has(x.id)) left.set(x.id, []);
      left.get(x.id).push(x);
    }
    const out = [];
    while (out.length < items.length) {
      const prev = out.length ? out[out.length - 1].id : undefined;
      const cands = [...left.entries()].filter(([id, xs]) => xs.length && id !== prev)
        .sort((p, q) => q[1].length - p[1].length);
      const pickFrom = cands.length ? cands[0] : [...left.entries()].find(([, xs]) => xs.length);
      out.push(pickFrom[1].pop());
    }
    return out;
  }

  return { makeRng, shuffle, pickWeighted, makeOptions, shuffleNoAdjacent };
});
