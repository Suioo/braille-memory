/** 课结果（全屏）：星（三个大圆点）、正确率、均时；下一课 / 重做 / 返回。 */
(function (root) {
  'use strict';
  const { h, ICON, fmtSec } = root.BMDom;
  const W = root.BMW;
  const C = root.BMCommon;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  Views.lessonResult = function (ctx, params) {
    const lesson = ctx.plan[params.index];
    const r = params.result;
    const status = root.BMCourse.lessonStatus(ctx.plan, ctx.progress);
    const next = status[lesson.index + 1];
    // 本次过关即解锁下一课（结果已由单课页写入进度）
    const canNext = r.stars >= 1 && !!next;
    const toCourse = () => ctx.go('course', { focus: C.sel('data-lesson', lesson.index) }, { dir: 'back' });
    const stat = (k, v) => h('div', { class: 'stat' }, h('span', { class: 'v num', text: v }), h('span', { class: 'k', text: k }));
    const wrongRows = r.wrongIds.map((id) => ctx.rowsById.get(id)).filter(Boolean);

    const invite = C.inviteCard(ctx);
    const el = h('div', { class: 'page lesson-result-page' },
      W.topBar(C.backBtn(toCourse), h('h1', { text: STR.lessonName(lesson.category, lesson.number) }), null),
      h('div', { class: 'page-body' },
        h('section', { class: 'summary-card' + (r.stars ? ' passed' : '') },
          W.starsEl(r.stars, true),
          h('div', { class: 'big-num num', text: STR.pct(r.acc) }),
          h('div', { class: 'stats' },
            stat(STR.count, String(r.total)),
            r.avgSec != null ? stat(STR.avg, STR.sec(fmtSec(r.avgSec))) : null)),
        wrongRows.length ? h('section', { class: 'weak-card' },
          h('span', { class: 'lg-wrap', 'aria-hidden': 'true' }, W.legendGlyph('extra')),
          h('div', { class: 'chip-row wrap', role: 'list', 'aria-label': STR.a11yIncorrect }, wrongRows.map((x) => W.symbolChip(x, ctx.settings.mirror)))) : null,
        invite,
        h('div', { class: 'footer two' },
          W.btn(STR.back, toCourse, { variant: 'outlined' }),
          W.btn(STR.redo, () => ctx.go('lesson', { index: lesson.index }), { variant: canNext ? 'tonal' : 'filled', icon: ICON.review(), autofocus: !canNext }),
          canNext ? W.btn(STR.nextLesson, () => ctx.go('lesson', { index: next.lesson.index }), { variant: 'filled', icon: ICON.next(), autofocus: true }) : null)));
    ctx.fx.popStars(el.querySelector('.stars'));
    ctx.fx.countUp(el.querySelector('.big-num'));
    if (r.stars >= 1) ctx.haptic('pass');
    ctx.say(STR.a11yStars(r.stars) + '，' + STR.pct(r.acc));

    function onKey(e) {
      if (e.key === 'Escape') { toCourse(); return true; }
      return false;
    }
    return { el, onKey };
  };
})(typeof self !== 'undefined' ? self : this);
