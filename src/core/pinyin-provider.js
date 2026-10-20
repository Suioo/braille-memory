/**
 * 拼音库适配（纯逻辑）：把 pinyin-pro 的 pinyin 与系统分词器包成 annotate.js 需要的 provider。
 * 只产出「分词 + 带调拼音」，从不产出点位。注意 pinyin-pro 的 segment 并不是分词（它几乎一字一段），所以分词用 Intl.Segmenter + 已知词表；拼音用整段一次取出（多音字按上下文判断），
 * 并关闭变调（toneSandhi:false）以得到本调——盲文要求写本调，轻声不标调。
 * 渲染进程：window.BMPinyinProvider；Node：require()。
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BMPinyinProvider = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 盲文相关的常用词（只用于分词，不含任何点位）：通用分词器常把它们拆开。 */
  const DOMAIN_WORDS = ['盲文', '盲人', '盲校', '盲杖', '盲道'];
  const MAX_WORD = 10;

  /** 系统自带的词级分词器（Intl.Segmenter，Chromium / Electron / Android WebView 都有）；没有则返回 null。 */
  function defaultSegmenter() {
    try {
      if (typeof Intl === 'undefined' || typeof Intl.Segmenter !== 'function') return null;
      const seg = new Intl.Segmenter('zh', { granularity: 'word' });
      return (run) => Array.from(seg.segment(run), (x) => x.segment);
    } catch (_) { return null; }
  }

  /**
   * 切词：先用分词器（通用词典）切成片段，再用已知词表（规则例词 + 盲文常用词）把相邻片段合并成更长的词（最长优先，只在片段边界合并）。
   * 分词器缺失或结果与原文不符时退回一字一词（用户可在详情里合并）。
   */
  function splitWords(run, segmenter, words) {
    let pieces;
    try { pieces = segmenter ? segmenter(run) : null; } catch (_) { pieces = null; }
    if (!Array.isArray(pieces) || pieces.join('') !== run || pieces.some((x) => !x)) pieces = Array.from(run);
    const out = [];
    for (let i = 0; i < pieces.length;) {
      let best = i;
      let acc = '';
      for (let j = i; j < pieces.length && Array.from(acc + pieces[j]).length <= MAX_WORD; j++) {
        acc += pieces[j];
        if (j > i && words.has(acc)) best = j;
      }
      out.push(pieces.slice(i, best + 1).join(''));
      i = best + 1;
    }
    return out;
  }

  // ---------- 分词校订（GF 0019—2018 第 12 章）：通用分词器给的是「词典词」，这里按盲文分词连写的规定修正 ----------
  /** 12.2.5 列举的单音节前附成分（「可」常作连词 / 副词，不自动前附）。 */
  const PREFIX = new Set(['副', '总', '非', '反', '超', '老', '阿', '无', '半']);
  /** 12.2.5 列举的单音节后附成分。 */
  const SUFFIX = new Set(['子', '儿', '头', '性', '者', '员', '家', '手', '化', '们']);
  /** 单音节方位词：与单音节名词连写（12.2.6「山上」）。 */
  const LOCATIVE = new Set(['上', '下', '里', '外', '中', '前', '后', '内', '旁']);
  /** 数词与量词：数量结构连写（12.2.6「八九天」「十七八岁」）。 */
  const NUMERAL = new Set(Array.from('零一二两三四五六七八九十百千万几'));
  const MEASURE = new Set(Array.from('个本只条张位次件把支匹辆块元斤层双对种些名首封棵朵座间片杯碗岁天年遍趟句页'));
  /** 动态助词：与前面的词连写（12.1.3 减少零散的单音节词）。 */
  const ASPECT = new Set(['了', '着', '过']);
  /** 分词器常把方位词和后面的动词粘成一个假词（桌子 / 上有 / 书）：遇到「方位词 + 这些字」就拆开。 */
  const LOC_VERB = new Set(['有', '是', '没', '放', '摆', '挂', '写', '坐', '站', '躺']);
  /** 以「得」结尾、「得」读 dé 的词；其余双音节「X得」里的「得」是结构助词，读轻声 de。 */
  const DE_KEEP = new Set(['获得', '取得', '赢得', '难得', '心得', '所得', '应得', '博得', '求得', '习得', '自得', '夺得', '换得', '购得', '不得', '只得', '懂得']);
  /** 单音节修饰语「大、小」+ 单音节名词连写（12.2.6「大红花」；12.1.3 减少零散的单音节词）。 */
  const SIZE = new Set(['大', '小']);
  /** 「今、明、昨、前、后、每」+「天、年、晚」连写（12.2.6「每年」）。 */
  const TIME_HEAD = new Set(Array.from('今明昨前后每'));
  const TIME_TAIL = new Set(Array.from('天年晚'));
  /** 不和前后单字合并的虚词。 */
  const PARTICLE = new Set(Array.from('的地得了着过吗呢吧啊呀么和与'));
  const CJK1 = /^[\u3400-\u9fff]$/u;

  /** 常见单音节动词：重叠（看看、想想）时后一个读轻声（标准 12.2.4 例词写作 kànkan），盲文不标调；名词重叠（人人、年年）不受影响。 */
  const VERB_AA = new Set(Array.from('看想说试听走问找等读写坐聊玩学练谈尝摸闻歇转逛洗擦拍算查动跑跳唱笑'));
  const TONE_MARKS = /[̀-̌]/g;
  const toNeutral = (syl) => syl.normalize('NFD').replace(TONE_MARKS, '').normalize('NFC');

  /** 拼音连写时，a、o、e 开头的音节前加隔音符号 '（《汉语拼音方案》），如 xī'ān、tiān'ānmén，避免切分歧义。 */
  const joinSyllables = (syl) => syl.map((s, i) => (i > 0 && /^[aoeāáǎàōóǒòēéěè]/.test(s) ? "'" + s : s)).join('');

  const isRedup = (cs) => (cs.length === 2 && cs[0] === cs[1]) || (cs.length === 4 && cs[0] === cs[1] && cs[2] === cs[3]);

  /**
   * 校订词块（纯函数，可单测）。每块 {c: 汉字数组, p: 与之对齐的带调音节数组}；只调整词界和结构助词的读音，不改字序。
   * @param {{c:string[], p:string[]}[]} list
   * @returns {{c:string[], p:string[]}[]}
   */
  function refine(list) {
    let w = list.map((x) => ({ c: x.c.slice(), p: x.p.slice() }));
    const cat = (a, b) => ({ c: a.c.concat(b.c), p: a.p.concat(b.p) });
    const allIn = (cs, set) => cs.length > 0 && cs.every((ch) => set.has(ch));
    // 1) 拆开分词器粘错的「数 + 量 + 名」「动 + 助 + 宾」：一本书 → 一本 / 书，三 / 个人 → 三 / 个 / 人，吃了饭 → 吃了 / 饭
    const split = [];
    for (let i = 0; i < w.length; i++) {
      const x = w[i];
      const prevNum = i > 0 && allIn(w[i - 1].c, NUMERAL);
      if (x.c.length === 3 && NUMERAL.has(x.c[0]) && MEASURE.has(x.c[1])) { split.push({ c: x.c.slice(0, 2), p: x.p.slice(0, 2) }, { c: x.c.slice(2), p: x.p.slice(2) }); continue; }
      if (prevNum && x.c.length === 2 && MEASURE.has(x.c[0])) { split.push({ c: x.c.slice(0, 1), p: x.p.slice(0, 1) }, { c: x.c.slice(1), p: x.p.slice(1) }); continue; }
      if (x.c.length === 2 && LOCATIVE.has(x.c[0]) && LOC_VERB.has(x.c[1]) && i > 0) { split.push({ c: x.c.slice(0, 1), p: x.p.slice(0, 1) }, { c: x.c.slice(1), p: x.p.slice(1) }); continue; }
      // 「说 / 的话 / …」：单字动词后的「的话」多半是「的 + 话」（真正的假设连词「…的话」前面通常是多字短语）
      if (x.c.join('') === '的话' && i > 0 && w[i - 1].c.length === 1) { split.push({ c: ['的'], p: ['de'] }, { c: x.c.slice(1), p: x.p.slice(1) }); continue; }
      if (x.c.length === 3 && ASPECT.has(x.c[1])) { split.push({ c: x.c.slice(0, 2), p: x.p.slice(0, 2) }, { c: x.c.slice(2), p: x.p.slice(2) }); continue; }
      split.push(x);
    }
    w = split;
    // 2) AABB 重叠被拆成 A / AB / B（高 / 高兴 / 兴）：合回一块（12.2.4 单音节重叠并列结构连写）
    for (let i = 0; i + 2 < w.length; i++) {
      const c = w[i].c.concat(w[i + 1].c, w[i + 2].c);
      if (c.length === 4 && w[i].c.length === 1 && w[i + 2].c.length === 1 && isRedup(c)) {
        w.splice(i, 3, cat(cat(w[i], w[i + 1]), w[i + 2]));
      }
    }
    // 3) 逐块合并
    const out = [];
    for (let i = 0; i < w.length; i++) {
      const x = w[i];
      const prev = out[out.length - 1];
      const one = x.c.length === 1 && CJK1.test(x.c[0]);
      if (prev && one) {
        const ch = x.c[0];
        // 12.2.5 后附：多音节词 + 后附成分（老师们、积极性、现代化）；「们」也接单音节（我们、你们由分词器给出）
        if (SUFFIX.has(ch) && (prev.c.length >= 2 || ch === '们') && !ASPECT.has(prev.c[prev.c.length - 1])) { out[out.length - 1] = cat(prev, x); continue; }
        // 12.2.6 名词 + 单音节方位词（山上、屋里、桌子上），合起来不超过三个音节
        if (LOCATIVE.has(ch) && prev.c.length <= 2 && prev.c.every((q) => CJK1.test(q)) && !allIn(prev.c, NUMERAL) && !ASPECT.has(prev.c[prev.c.length - 1])) { out[out.length - 1] = cat(prev, x); continue; }
        // 12.2.6 数 + 量（三个、一本）
        if (MEASURE.has(ch) && allIn(prev.c, NUMERAL)) { out[out.length - 1] = cat(prev, x); continue; }
      }
      // 12.2.6 相连的数词连写（八九、一二三四五）
      if (prev && allIn(prev.c, NUMERAL) && allIn(x.c, NUMERAL)) { out[out.length - 1] = cat(prev, x); continue; }
      if (prev && one) {
        const ch = x.c[0];
        // 12.2.6 / 12.1.3：大 / 小 + 单音节名词，今 / 明 / 每 … + 天 / 年
        const p1 = prev.c.length === 1 ? prev.c[0] : '';
        if (p1 && ((SIZE.has(p1) && !PARTICLE.has(ch) && !NUMERAL.has(ch) && !ASPECT.has(ch)) || (TIME_HEAD.has(p1) && TIME_TAIL.has(ch)))) { out[out.length - 1] = cat(prev, x); continue; }
        // 动态助词并入前面的词（走着、看过、来了）
        if (ASPECT.has(ch) && CJK1.test(prev.c[prev.c.length - 1])) { out[out.length - 1] = cat(prev, x); continue; }
      }
      // 12.2.5 前附：前附成分 + 多音节词（非正式、超声波、副校长）
      if (prev && prev.c.length === 1 && PREFIX.has(prev.c[0]) && x.c.length >= 2 && !prev.joined) { out[out.length - 1] = cat(prev, x); continue; }
      out.push(x);
    }
    // 4) 结构助词读轻声：的（单独成块或词尾，「目的」「的确」等例外由词典读音保留）、地（重叠词后 / 多音节词后单独的「地」）、得（V得）
    out.forEach((x, k) => {
      const n = x.c.length;
      const last = x.c[n - 1];
      if (last === '的' && (n === 1 || (n === 2 && x.c[0] !== '目' && x.c[0] !== '标'))) x.p[n - 1] = 'de';
      if (last === '地' && ((n >= 3 && isRedup(x.c.slice(0, n - 1))) || (n === 1 && k > 0 && out[k - 1].c.length >= 2))) x.p[n - 1] = 'de';
      if (last === '得' && n === 2 && !DE_KEEP.has(x.c.join(''))) x.p[n - 1] = 'de';
      if (n >= 2 && x.c[0] === x.c[1] && VERB_AA.has(x.c[0]) && (n === 2 || ASPECT.has(x.c[2]))) x.p[1] = toNeutral(x.p[1]);
    });
    return out;
  }

  /**
   * @param {{pinyin:Function}} lib pinyin-pro 的导出（只用它取带调拼音，多音字按整段上下文判断）
   * @param {{segmenter?:((run:string)=>string[])|null, words?:Iterable<string>}} [o] segmenter 省略 = 用 Intl.Segmenter；words = 额外的已知词（如规则例词）
   * @returns {{segment:(run:string)=>{chars:string, pinyin:string}[]}}
   */
  function createProvider(lib, o) {
    if (!lib || typeof lib.pinyin !== 'function') throw new Error('no pinyin lib');
    o = o || {};
    const segmenter = o.segmenter === undefined ? defaultSegmenter() : o.segmenter;
    const words = new Set(DOMAIN_WORDS);
    for (const w of o.words || []) if (typeof w === 'string' && Array.from(w).length >= 2) words.add(w);
    /** 规则例词（已知词）本身不拆；只有其余的块参与校订（逐段校订，已知词作为边界）。 */
    const refineKnown = (list) => {
      const res = [];
      let run = [];
      const flush = () => { if (run.length) { for (const x of refine(run)) res.push(x); run = []; } };
      for (const x of list) {
        if (x.c.length >= 2 && words.has(x.c.join('')) && !DOMAIN_WORDS.includes(x.c.join(''))) { flush(); res.push(x); } else run.push(x);
      }
      flush();
      return res;
    };
    return {
      segment(run) {
        const chars = Array.from(String(run));
        if (!chars.length) return [];
        const syl = lib.pinyin(run, { type: 'array', toneType: 'symbol', toneSandhi: false, v: false });
        if (!Array.isArray(syl) || syl.length !== chars.length) throw new Error('lib mismatch');
        const list = [];
        let at = 0;
        for (const w of splitWords(run, segmenter, words)) {
          const c = Array.from(w);
          list.push({ c, p: syl.slice(at, at + c.length).map((x) => String(x).normalize('NFC').toLowerCase()) });
          at += c.length;
        }
        // 已知词表里的词（规则例词）照原样保留，不再校订
        const out = [];
        for (const x of (o.refine === false ? list : refineKnown(list))) {
          const py = joinSyllables(x.p);
          if (!/^[\p{L}\p{M}']+$/u.test(py)) throw new Error('unexpected pinyin');
          out.push({ chars: x.c.join(''), pinyin: py });
        }
        return out;
      },
    };
  }

  /**
   * 例词 → 按它自己的分写拆成的词块（拼音里的空格 = 词间空方，如「中华 人民 共和国」），用作已知词表。
   * 拼音解析交给调用方（translator.parse）；解析失败 / 汉字数与音节数对不上的例词跳过。
   * @param {{chars:string, pinyin:string}[]} entries
   * @param {(pinyin:string, o:{chars:string})=>{ok:boolean, words?:{syllables:object[]}[]}} parse
   * @returns {string[][]} 每个例词一个词块数组（含单字块；调用方按需过滤）
   */
  function exampleChunks(entries, parse) {
    const out = [];
    for (const e of entries) {
      const chars = Array.from(e.chars || '');
      let r;
      try { r = parse(e.pinyin, { chars: e.chars }); } catch (_) { r = null; }
      if (!r || !r.ok || !Array.isArray(r.words) || r.words.reduce((n, w) => n + w.syllables.length, 0) !== chars.length) continue;
      let at = 0;
      out.push(r.words.map((w) => { const c = chars.slice(at, at + w.syllables.length).join(''); at += w.syllables.length; return c; }));
    }
    return out;
  }

  return { createProvider, exampleChunks, refine, joinSyllables };
});
