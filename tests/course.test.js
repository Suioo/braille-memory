'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planLessons, lessonStatus, starsFor, LessonSession } = require('../src/core/course.js');
const P = require('../src/core/progress.js');
const { makeRng } = require('../src/core/pick.js');
const { table, cats, cfg, rowsById, plan, wrongDots } = require('./helpers/fixtures.js');

const C = cfg();

test('planLessons: each category L=ceil(c/5) lessons, sizes differ by at most 1, CSV order kept', () => {
  for (const c of cats) {
    const ls = plan.filter((l) => l.category === c.name);
    assert.equal(ls.length, Math.ceil(c.count / 5));
    const sizes = ls.map((l) => l.ids.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
    assert.ok(Math.max(...sizes) <= 5);
    assert.deepEqual(ls.flatMap((l) => l.ids), table.filter((r) => r.category === c.name).map((r) => r.id));
    assert.deepEqual(ls.map((l) => l.number), ls.map((_, i) => i + 1));
  }
  assert.deepEqual(plan.map((l) => l.index), plan.map((_, i) => i));
  assert.equal(new Set(plan.map((l) => l.key)).size, plan.length);
});

test('planLessons splits evenly with remainder to the first lessons', () => {
  const seven = table.slice(0, 7).map((r) => ({ ...r, category: 'K' }));
  assert.deepEqual(planLessons(seven, 5).map((l) => l.ids.length), [4, 3]);
  const twelve = table.slice(0, 12).map((r) => ({ ...r, category: 'K' }));
  assert.deepEqual(planLessons(twelve, 5).map((l) => l.ids.length), [4, 4, 4]);
});

test('lessonStatus: sequential unlock, replay allowed, stars from progress', () => {
  const p = P.createProgress(C);
  let st = lessonStatus(plan, p);
  assert.equal(st[0].unlocked, true);
  assert.equal(st[1].unlocked, false);
  P.recordLessonResult(p, plan[0], { stars: 1, acc: 0.8, avgSec: 12 });
  st = lessonStatus(plan, p);
  assert.equal(st[0].unlocked, true);
  assert.equal(st[1].unlocked, true);
  assert.equal(st[2].unlocked, false);
  P.recordLessonResult(p, plan[0], { stars: 0, acc: 0.1, avgSec: 30 });
  assert.equal(lessonStatus(plan, p)[1].unlocked, true); // 星只升不降
});

test('starsFor thresholds (default config)', () => {
  const T = C.course.stars;
  assert.equal(starsFor(0.79, 5, T, true), 0);
  assert.equal(starsFor(0.8, 12, T, true), 1);
  assert.equal(starsFor(0.8, 12.1, T, true), 0);
  assert.equal(starsFor(0.9, 9, T, true), 2);
  assert.equal(starsFor(0.95, 6, T, true), 2);
  assert.equal(starsFor(1, 6, T, true), 3);
  assert.equal(starsFor(1, 6.01, T, true), 2);
  assert.equal(starsFor(1, 50, T, false), 3);
  assert.equal(starsFor(0.9, null, T, false), 2);
  assert.equal(starsFor(1, null, T, true), 0);
});

const skipLearn = (s) => { for (let i = 0; i < s.rows.length; i++) s.learnMove(1); };

test('LessonSession: learn → practice → test → done, all clean answers', () => {
  const L = plan[0];
  const s = new LessonSession(L, rowsById, C, makeRng(4));
  assert.equal(s.phase, 'learn');
  assert.equal(s.learnRow.id, L.ids[0]);
  s.learnMove(-1);
  assert.equal(s.learnIndex, 0);
  skipLearn(s);
  assert.equal(s.phase, 'practice');
  let answered = 0;
  while (s.phase === 'practice') { s.answerPractice(s.practiceRow.dots); answered++; }
  assert.equal(answered, L.ids.length * C.course.cleanCorrect);
  assert.equal(s.phase, 'test');
  assert.equal(s.testItems.length, L.ids.length * C.course.testRepeats);
  for (const id of L.ids) assert.equal(s.testItems.filter((r) => r.id === id).length, 2);
  while (s.phase === 'test') s.answerTest(s.testRow.dots, 3000);
  const r = s.result(true);
  assert.deepEqual([r.total, r.correct, r.acc, r.avgSec, r.stars], [L.ids.length * 2, L.ids.length * 2, 1, 3, 3]);
});

test('LessonSession practice: wrong resets clean count and requeues after 2 others', () => {
  const L = plan.find((l) => l.ids.length >= 4);
  const s = new LessonSession(L, rowsById, C, makeRng(1));
  skipLearn(s);
  const first = s.practiceRow;
  s.answerPractice(first.dots);
  assert.equal(s.cleanCount(first.id), 1);
  while (s.practiceRow.id !== first.id) s.answerPractice(s.practiceRow.dots);
  const res = s.answerPractice(wrongDots(first));
  assert.equal(res.correct, false);
  assert.equal(res.showCard, true);
  assert.equal(s.cleanCount(first.id), 0);
  assert.equal(s.queue[Math.min(2, s.queue.length - 1)].id, first.id);
  assert.notEqual(s.queue[0].id, first.id);
});

test('LessonSession practice: hinted correct answer is not clean', () => {
  const s = new LessonSession(plan[0], rowsById, C, makeRng(1));
  skipLearn(s);
  const row = s.practiceRow;
  s.useHint();
  s.answerPractice(row.dots);
  assert.equal(s.cleanCount(row.id), 0);
  assert.equal(s.hinted, false);
});

test('LessonSession test result: mistakes counted, timing off ignores time', () => {
  const L = plan[0];
  const s = new LessonSession(L, rowsById, C, makeRng(8));
  skipLearn(s);
  while (s.phase === 'practice') s.answerPractice(s.practiceRow.dots);
  let k = 0;
  while (s.phase === 'test') { const row = s.testRow; s.answerTest(k++ === 0 ? wrongDots(row) : row.dots, 20000); }
  const total = L.ids.length * 2;
  const r = s.result(true);
  assert.equal(r.correct, total - 1);
  assert.equal(r.wrongIds.length, 1);
  assert.equal(r.stars, 0); // 均时 20 s 超过过关线
  const off = s.result(false);
  assert.equal(off.avgSec, null);
  assert.equal(off.stars, starsFor((total - 1) / total, null, C.course.stars, false));
});
