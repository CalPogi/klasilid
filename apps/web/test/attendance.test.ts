import { hm } from '@klasilid/core';
import { beforeEach, expect, it } from 'vitest';
import { classDay, needsAttention, todayManila } from '../src/lib/attendance';
import { openDb, type KlasilidDb, type LTapWindow } from '../src/lib/db';

const DATE = '2026-11-13'; // a Friday
const at = (hms: string, date = DATE) => {
  const [h, m, s = 0] = hms.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, s) - 8 * 3600_000).toISOString();
};
const NOW = new Date(at('20:00'));
const win = (id: string, session: 'am' | 'pm', kind: 'in' | 'out', o: string, l: string | null, c: string, from = '2026-06-01'): LTapWindow =>
  ({ id, classId: 'c1', session, kind, opens: hm(o), lateAfter: l ? hm(l) : null, closes: hm(c), effectiveFrom: from });

let db: KlasilidDb;
const tap = (id: string, uid: string, hms: string, clockSuspect = false) =>
  db.taps.put({ id, deviceId: 'd1', cardUid: uid, at: at(hms), clockSuspect });

beforeEach(async () => {
  db = openDb('t-' + crypto.randomUUID());
  await db.classes.put({ id: 'c1', schoolYearId: 'sy', subject: 'Advisory', grade: 6, section: 'Diamond', isAdvisory: true, ignoreRepeatMinutes: 3 });
  await db.learners.bulkPut([
    { id: 'a', firstName: 'Ana', lastName: 'Abad', sex: 'F' },
    { id: 'b', firstName: 'Ben', lastName: 'Bautista', sex: 'M' },
    { id: 'c', firstName: 'Carla', lastName: 'Castro', sex: 'F' },
  ]);
  await db.enrollments.bulkPut([
    { id: 'e1', classId: 'c1', learnerId: 'a', joinedOn: '2026-06-01' },
    { id: 'e2', classId: 'c1', learnerId: 'b', joinedOn: '2026-06-01' },
    { id: 'e3', classId: 'c1', learnerId: 'c', joinedOn: '2026-06-01' },
  ]);
  await db.cards.bulkPut([{ uid: 'AAAAAAAA', learnerId: 'a', active: true }, { uid: 'BBBBBBBB', learnerId: 'b', active: true },
    { uid: 'CCCCCCCC', learnerId: 'c', active: true }]);
  await db.tapWindows.bulkPut([win('w1', 'am', 'in', '06:30', '07:15', '08:00'), win('w2', 'am', 'out', '11:30', null, '12:15'),
    win('w3', 'pm', 'in', '12:30', '13:00', '13:30'), win('w4', 'pm', 'out', '16:00', null, '17:00')]);
});

it('maps taps to learners through active cards and counts the morning', async () => {
  await tap('t1', 'AAAAAAAA', '07:00');
  await tap('t2', 'BBBBBBBB', '07:20');
  const d = await classDay(db, 'c1', DATE, NOW);
  expect(d.rows.map(r => [r.learner.firstName, r.am.status])).toEqual([['Ana', 'on_time'], ['Ben', 'late'], ['Carla', 'absent']]);
  expect(d.counts).toEqual({ in: 2, late: 1, absent: 1, notYet: 0, total: 3 });
});

it('a tap from an unassigned card is listed in unknownTaps, not on anyone', async () => {
  await tap('t9', 'DEADBEEF', '07:05');
  await db.cards.put({ uid: 'OLDCARD1', learnerId: 'a', active: false });
  await tap('t8', 'OLDCARD1', '07:06');
  const d = await classDay(db, 'c1', DATE, NOW);
  expect(d.unknownTaps.map(t => t.id).sort()).toEqual(['t8', 't9']);
  expect(d.rows.every(r => r.am.inTapId === undefined)).toBe(true);
});

it('a learner who left before the date is not listed; one who joined after is not listed', async () => {
  await db.enrollments.update('e1', { leftOn: '2026-11-10' });
  await db.enrollments.update('e2', { joinedOn: '2026-11-20' });
  const d = await classDay(db, 'c1', DATE, NOW);
  expect(d.rows.map(r => r.learner.id)).toEqual(['c']);
});

it('todayManila uses Manila, not the device zone', () => {
  expect(todayManila(new Date('2026-11-12T23:30:00Z'))).toBe('2026-11-13');
  expect(todayManila(new Date('2026-11-12T15:59:59Z'))).toBe('2026-11-12');
});

it('no windows in effect → needsSetup and nobody absent', async () => {
  await db.tapWindows.clear();
  await tap('t1', 'AAAAAAAA', '07:00');
  const d = await classDay(db, 'c1', DATE, NOW);
  expect(d.needsSetup).toBe(true);
  expect(d.rows.every(r => r.am.status === 'pending' && r.pm.status === 'pending')).toBe(true);
  expect(d.counts.absent).toBe(0);
  expect(d.rows.every(r => r.review.length === 0)).toBe(true);
});

it('a date before the first window takes effect also needs setup', async () => {
  await db.tapWindows.toCollection().modify({ effectiveFrom: '2026-11-20' });
  expect((await classDay(db, 'c1', DATE, NOW)).needsSetup).toBe(true);
});

it('a calendar holiday and a Saturday are no_school', async () => {
  await db.calendarDays.put({ id: 'h1', schoolYearId: 'sy', date: DATE, type: 'holiday', name: 'Test holiday' });
  const hol = await classDay(db, 'c1', DATE, NOW);
  expect(hol.dayType).toBe('holiday');
  expect(hol.rows[0].am.status).toBe('no_school');
  const sat = await classDay(db, 'c1', '2026-11-14', new Date(at('20:00', '2026-11-14')));
  expect(sat.dayType).toBe('holiday');
  expect(sat.counts.absent).toBe(0);
});

it('an event day counts as a school day', async () => {
  await db.calendarDays.put({ id: 'e', schoolYearId: 'sy', date: DATE, type: 'event', name: 'Intrams' });
  expect((await classDay(db, 'c1', DATE, NOW)).dayType).toBe('school');
});

it('needsAttention orders review items, then after-closing, then absences', async () => {
  await tap('t1', 'AAAAAAAA', '08:20');            // Ana: after closing
  await tap('t2', 'BBBBBBBB', '07:00');
  await tap('t3', 'BBBBBBBB', '10:00');            // Ben: stray tap → review
  const d = await classDay(db, 'c1', DATE, NOW);   // Carla: absent
  expect(needsAttention(d).map(r => r.learner.firstName)).toEqual(['Ben', 'Ana', 'Carla']);
});

it('clock-suspect taps of enrolled learners are listed in suspectTaps', async () => {
  await tap('t1', 'AAAAAAAA', '07:00', true);
  await tap('t2', 'DEADBEEF', '07:01', true);
  const d = await classDay(db, 'c1', DATE, NOW);
  expect(d.suspectTaps.map(t => t.id)).toEqual(['t1']);
});

it('uses the class ignoreRepeatMinutes', async () => {
  await db.classes.update('c1', { ignoreRepeatMinutes: 10 });
  await tap('t1', 'AAAAAAAA', '07:00');
  await tap('t2', 'AAAAAAAA', '07:07');
  await tap('t3', 'AAAAAAAA', '07:08'); // with 3 min this would be a second in-window tap; either way no review
  await db.classes.update('c1', { ignoreRepeatMinutes: 10 });
  const d = await classDay(db, 'c1', DATE, NOW);
  expect(d.rows[0].am).toMatchObject({ status: 'on_time', inTapId: 't1' });
  // 08:20 stray after a 07:00 tap would be review; a 07:09 tap within 10 minutes must be dropped entirely
  await tap('t4', 'BBBBBBBB', '08:01');
  await tap('t5', 'BBBBBBBB', '08:09');
  const d2 = await classDay(db, 'c1', DATE, NOW);
  expect(d2.rows[1].review).toEqual([]);
  expect(d2.rows[1].am.flags).toContain('after_closing');
});

it('dayLetter turns a day\'s two halves into one grid letter', async () => {
  const { dayLetter } = await import('../src/lib/attendance');
  const h = (status: string) => ({ status, flags: [] }) as never;
  expect(dayLetter(h('on_time'), h('on_time'))).toBe('P');
  expect(dayLetter(h('late'), h('on_time'))).toBe('L');
  expect(dayLetter(h('absent'), h('absent'))).toBe('A');
  expect(dayLetter(h('on_time'), h('absent'))).toBe('H');      // half day present
  expect(dayLetter(h('absent'), h('late'))).toBe('H');
  expect(dayLetter(h('excused'), h('excused'))).toBe('E');
  expect(dayLetter(h('excused'), h('absent'))).toBe('E');
  expect(dayLetter(h('on_time'), h('no_school'))).toBe('P');    // half day schedule: morning only
  expect(dayLetter(h('pending'), h('pending'))).toBe('N');
  expect(dayLetter(h('on_time'), h('pending'))).toBe('P');
});
