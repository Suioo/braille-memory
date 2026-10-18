/** 一轮结果（全屏）：正确率、题数、用时、均时、本轮答错的符号。 */
(function (root) {
  'use strict';
  const { h, ICON, fmtSec } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  const MODE_LABEL = () => ({ practice: STR.practice, review: STR.review, wrong: STR.mistakes });

  Views.result = function (ctx, params) {
    const sm = params.summary;
    const leave = () => ctx.go('practice', {}, { dir: 'back' });
    const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'v num', text: v }), h('span', { class: 'k', text: k }));
    const isTexts = params.module === 'texts' && !!ctx.textData;
    const isRules = params.module === 'rules' && !!ctx.ruleData;
    const isExt = params.module === 'ext' && !!ctx.ext;
    const wrongRows = isRules || isTexts ? [] : sm.wrongIds.map((id) => (isExt ? ctx.ext.byId.get(id) : ctx.rowsById.get(id))).filter(Boolean);
    const wrongItems = isRules ? (sm.wrongKeys || []).map((k) => ctx.ruleData.byKey.get(k)).filter(Boolean)
      : isTexts ? (sm.wrongKeys || []).map((k) => ctx.textData.byKey.get(k)).filter(Boolean) : [];
    const ruleChip = (it) => W.assistChip(isTexts ? Array.from(it.chars).slice(0, 10).join('') + (Array.from(it.chars).length > 10 ? '…' : '') : it.family ? (it.family === 'tone' ? it.raw : it.char) + ' · ' + it.word.chars : it.chars);
    const canAgain = sm.mode !== 'wrong' || (isTexts
      ? root.BMProgress.textWeakItems(ctx.progress, ctx.textRoundData(params.textId || 'all').words).length > 0
      : isRules
      ? root.BMProgress.ruleWeakItems(ctx.progress, root.BMRuleRound.availableTypes(ctx.ruleData).flatMap((t) => root.BMRuleRound.poolOf(ctx.ruleData, t))).length > 0
      : isExt
        ? root.BMProgress.extWeakRows(ctx.progress, C.extScopeRows(ctx)).length > 0
        : root.BMProgress.weakRows(ctx.progress, ctx.scopeRows()).length > 0);

    // 文本 + 计时：每方用时、每分钟方数（合计所有涉及的文本）、新纪录与各篇成绩（折叠）
    const runs = isTexts && params.runs && params.runs.length ? params.runs : null;
    let tm = null;
    if (runs) {
      const agg = runs.reduce((a, x) => ({ n: a.n + x.run.n, ok: a.ok + x.run.ok, cells: a.cells + x.run.cells, ms: a.ms + x.run.ms }), { n: 0, ok: 0, cells: 0, ms: 0 });
      tm = root.BMTextStats.metrics(agg);
    }
    const nm = (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
    const el = h('div', { class: 'page result-page' },
      W.topBar(C.backBtn(leave), h('h1', { text: MODE_LABEL()[sm.mode] }), null),
      h('div', { class: 'page-body' },
        h('section', { class: 'summary-card' },
          sm.total ? W.verdictEl(sm.correct === sm.total) : null,
          h('div', { class: 'big-num num', text: STR.pct(sm.acc) }),
          h('div', { class: 'stats' },
            stat(STR.count, String(sm.total)),
            stat(STR.time, STR.sec(fmtSec(sm.totalSec))),
            tm ? stat(STR.textPerCell, STR.sec(nm(tm.secPerCell))) : stat(STR.avg, STR.sec(fmtSec(sm.avgSec))),
            tm ? stat(STR.textCpm, nm(tm.cpm)) : null,
            params.bestStreak != null && !tm ? stat(STR.bestStreak, String(params.bestStreak)) : null)),
        runs ? h('section', { class: 'text-runs' }, ...runs.map((x) => {
          const t = ctx.texts.texts.find((y) => y.id === x.textId);
          if (!t) return null;
          return h('div', { class: 'text-run' },
            h('div', { class: 'tr-head' }, h('span', { class: 'tr-title', text: t.title }),
              x.newBest ? h('span', { class: 'sent-flag ok', text: STR.textNewBest }) : x.newBestAcc ? h('span', { class: 'sent-flag ok', text: STR.textNewBestAcc }) : null),
            root.BMTextViews.statsEl(ctx, x.textId));
        })) : null,
        wrongRows.length || wrongItems.length ? h('section', { class: 'weak-card' },
          h('span', { class: 'lg-wrap', 'aria-hidden': 'true' }, W.legendGlyph('extra')),
          h('div', { class: 'chip-row wrap', role: 'list', 'aria-label': STR.a11yIncorrect }, wrongItems.map(ruleChip), wrongRows.map((r) => (isExt ? W.extSymbolChip(r, ctx.settings.mirror) : W.symbolChip(r, ctx.settings.mirror))))) : null,
        h('div', { class: 'footer two' },
          W.btn(STR.back, leave, { variant: 'outlined', autofocus: !canAgain }),
          canAgain ? W.btn(STR.again, () => ctx.go(isRules || isTexts ? 'ruleround' : isExt ? 'extround' : 'round', isTexts ? { mode: sm.mode, scope: 'text', textId: params.textId } : { mode: sm.mode }), { variant: 'filled', icon: ICON.review(), autofocus: true }) : null)));
    ctx.fx.countUp(el.querySelector('.big-num'));
    ctx.say(STR.pct(sm.acc));

    function onKey(e) {
      if (e.key === 'Escape') { leave(); return true; }
      return false;
    }
    return { el, onKey };
  };
})(typeof self !== 'undefined' ? self : this);
