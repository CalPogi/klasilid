import { expect, it } from 'vitest';
import { openDb, type LLearner } from '../src/lib/db';
import { fillAZ, resize, saveSeatPlan, seatPlanFor, unseated, type Layout } from '../src/lib/seats';

const L = (id: string, lastName: string, firstName = 'X'): LLearner => ({ id, lastName, firstName, sex: 'F' });
const learners = [L('c', 'Castro'), L('a', 'Abad'), L('b', 'Bautista'), L('d', 'Domingo'), L('e', 'Espino')];
const empty = (rows: number, cols: number): Layout => ({ rows, cols, seats: Array(rows * cols).fill(null) });

it('fillAZ seats learners alphabetically row by row and leaves extras unseated', () => {
  const l = fillAZ(empty(2, 2), learners);
  expect(l.seats).toEqual(['a', 'b', 'c', 'd']);
  expect(unseated(l, learners).map(x => x.id)).toEqual(['e']);
});

it('resize to fewer rows sends learners in removed seats back to unseated, others keep their seat', () => {
  const l = fillAZ(empty(3, 2), learners);              // a b / c d / e -
  const r = resize(l, 2, 2);
  expect(r.seats).toEqual(['a', 'b', 'c', 'd']);
  expect(unseated(r, learners).map(x => x.id)).toEqual(['e']);
  const narrower = resize(l, 3, 1);                     // keeps column 1 only
  expect(narrower.seats).toEqual(['a', 'c', 'e']);
  expect(unseated(narrower, learners).map(x => x.id).sort()).toEqual(['b', 'd']);
});

it('resize clamps to 1..10', () => {
  expect(resize(empty(2, 2), 0, 12)).toMatchObject({ rows: 1, cols: 10 });
});

it('seatPlanFor picks the latest plan by effectiveFrom then createdAt; past days keep the old plan', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await db.seatPlans.bulkPut([
    { id: 'p1', classId: 'c1', rows: 1, cols: 2, effectiveFrom: '2026-11-01', createdAt: '2026-11-01T00:00:00Z' },
    { id: 'p2', classId: 'c1', rows: 1, cols: 2, effectiveFrom: '2026-11-10', createdAt: '2026-11-10T00:00:00Z' },
    { id: 'p3', classId: 'c1', rows: 1, cols: 2, effectiveFrom: '2026-11-10', createdAt: '2026-11-10T05:00:00Z' },
  ]);
  await db.seats.bulkPut([
    { id: 's1', planId: 'p1', row: 0, col: 0, learnerId: 'a' },
    { id: 's3', planId: 'p3', row: 0, col: 1, learnerId: 'b' },
  ]);
  expect((await seatPlanFor(db, 'c1', '2026-11-09')).layout.seats).toEqual(['a', null]);
  const now = await seatPlanFor(db, 'c1', '2026-11-13');
  expect(now.plan?.id).toBe('p3');
  expect(now.layout.seats).toEqual([null, 'b']);
  expect((await seatPlanFor(db, 'other', '2026-11-13'))).toMatchObject({ plan: null, layout: { rows: 8, cols: 5 } });
});

it('saveSeatPlan writes plan + seats and queues seat_plans then seats', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  const plan = await saveSeatPlan(db, 'c1', { rows: 1, cols: 3, seats: ['a', null, 'b'] }, new Date('2026-11-13T01:00:00Z'));
  expect(plan).toMatchObject({ classId: 'c1', rows: 1, cols: 3, effectiveFrom: '2026-11-13', createdAt: '2026-11-13T01:00:00.000Z' });
  expect((await db.seats.where('planId').equals(plan.id).toArray()).map(s => [s.col, s.learnerId]).sort()).toEqual([[0, 'a'], [2, 'b']]);
  const ops = (await db.outbox.orderBy('seq').toArray()).map(i => (i.op.kind === 'insert' ? i.op.table : i.op.kind));
  expect(ops).toEqual(['seat_plans', 'seats', 'seats']);
});
