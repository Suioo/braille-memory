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
    const wrongRows = sm.wrongIds.map((id) => ctx.rowsById.get(id)).filter(Boolean);
    const canAgain = sm.mode !== 'wrong' || root.BMProgress.weakRows(ctx.progress, ctx.scopeRows()).length > 0;

    const el = h('div', { class: 'page result-page' },
      W.topBar(C.backBtn(leave), h('h1', { text: MODE_LABEL()[sm.mode] }), null),
      h('div', { class: 'page-body' },
        h('section', { class: 'summary-card' },
          sm.total ? W.verdictEl(sm.correct === sm.total) : null,
          h('div', { class: 'big-num num', text: STR.pct(sm.acc) }),
          h('div', { class: 'stats' },
            stat(STR.count, String(sm.total)),
            stat(STR.time, STR.sec(fmtSec(sm.totalSec))),
            stat(STR.avg, STR.sec(fmtSec(sm.avgSec))),
            params.bestStreak != null ? stat(STR.bestStreak, String(params.bestStreak)) : null)),
        wrongRows.length ? h('section', { class: 'weak-card' },
          h('span', { class: 'lg-wrap', 'aria-hidden': 'true' }, W.legendGlyph('extra')),
          h('div', { class: 'chip-row wrap', role: 'list', 'aria-label': STR.a11yIncorrect }, wrongRows.map((r) => W.symbolChip(r, ctx.settings.mirror)))) : null,
        h('div', { class: 'footer two' },
          W.btn(STR.back, leave, { variant: 'outlined', autofocus: !canAgain }),
          canAgain ? W.btn(STR.again, () => ctx.go('round', { mode: sm.mode }), { variant: 'filled', icon: ICON.review(), autofocus: true }) : null)));
    ctx.fx.countUp(el.querySelector('.big-num'));
    ctx.say(STR.pct(sm.acc));

    function onKey(e) {
      if (e.key === 'Escape') { leave(); return true; }
      return false;
    }
    return { el, onKey };
  };
})(typeof self !== 'undefined' ? self : this);
