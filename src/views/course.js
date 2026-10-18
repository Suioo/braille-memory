/** 「闯关」标签页：课程图，按 CSV 类别分组，顺序解锁，星 = 三个盲文点。 */
(function (root) {
  'use strict';
  const { h, ICON } = root.BMDom;
  const W = root.BMW;
  const STR = root.STR;
  const Views = (root.BMViews = root.BMViews || {});

  Views.course = function (ctx) {
    const status = root.BMCourse.lessonStatus(ctx.plan, ctx.progress);
    const stars = status.reduce((sum, x) => sum + x.stars, 0);
    const passed = status.filter((x) => x.passed).length;
    const groups = new Map();
    for (const st of status) {
      if (!groups.has(st.lesson.category)) groups.set(st.lesson.category, []);
      groups.get(st.lesson.category).push(st);
    }
    const tile = (st) => {
      const L = st.lesson;
      const preview = L.ids.map((id) => ctx.rowsById.get(id).symbol).join(' ');
      return h('button', {
        class: 'lesson-tile sl' + (st.passed ? ' passed' : '') + (st.unlocked && !st.passed ? ' current' : ''),
        type: 'button', disabled: !st.unlocked, 'data-nav': 'lessons', 'data-lesson': L.index,
        'aria-label': STR.lessonName(L.category, L.number) + '，' + (st.unlocked ? STR.a11yStars(st.stars) : STR.a11yLocked),
        onclick: () => ctx.go('lesson', { index: L.index }),
      },
      h('span', { class: 'ln num', text: String(L.number) }),
      st.unlocked ? W.starsEl(st.stars) : h('span', { class: 'lock' }, ICON.lock()),
      h('span', { class: 'preview', text: preview }));
    };
    const meta = h('span', { class: 'tb-meta stars-meta', 'aria-label': STR.a11yStars(stars) },
      h('span', { class: 'star-dot', 'aria-hidden': 'true' }), h('span', { class: 'num', text: stars + '/' + status.length * 3 }));
    const el = h('div', { class: 'page course-page' },
      W.topBar(null, h('h1', { text: STR.tabCourse }), meta),
      h('div', { class: 'page-body' },
        W.progressBar(passed / Math.max(1, status.length), STR.passedLabel + ' ' + passed + '/' + status.length),
        [...groups].map(([cat, list]) => h('section', { class: 'group' },
          h('h2', { class: 'group-title', text: cat }),
          h('div', { class: 'lesson-grid' }, list.map(tile))))));
    return { el, tab: 'course' };
  };
})(typeof self !== 'undefined' ? self : this);
