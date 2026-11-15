import { expect, it } from 'vitest';
import { classDay } from '../src/lib/attendance';
import { addStudent, studentRows, transferOut } from '../src/lib/students';
import { at, classDb, DATE } from './fixture';

const NOW = new Date(at('20:00'));

it('studentRows filters by no card, replaced card and transferred out, and searches by name', async () => {
  const db = await classDb();
  await db.cards.update('BBBBBBBB', { active: false });
  await db.cards.put({ uid: 'BBBB0002', learnerId: 'b', active: true, replacedAt: undefined });
  await db.cards.update('CCCCCCCC', { active: false });
  await db.enrollments.update('e0', { leftOn: '2026-11-10' });
  const names = async (f: Parameters<typeof studentRows>[3], q = '') =>
    (await studentRows(db, 'c1', DATE, f, q)).map(r => r.learner.firstName);
  expect(await names('all')).toEqual(['Ana', 'Ben', 'Carla']);
  expect(await names('nocard')).toEqual(['Carla']);
  expect(await names('replaced')).toEqual(['Ben']);
  expect(await names('left')).toEqual(['Ana']);
  expect(await names('all', 'carl')).toEqual(['Carla']);
  const ana = (await studentRows(db, 'c1', DATE, 'all', ''))[0];
  expect(ana).toMatchObject({ status: 'left', parent: 'none' });
});

it('presentPct counts half days as half', async () => {
  const db = await classDb();
  // Ana: present Fri 13 (07:00 tap, plus afternoon tap) → P; Carla: only an afternoon tap → H
  await db.taps.bulkPut([
    { id: 'x1', deviceId: 'd', cardUid: 'AAAAAAAA', at: at('12:40'), clockSuspect: false },
    { id: 'x2', deviceId: 'd', cardUid: 'CCCCCCCC', at: at('12:40'), clockSuspect: false },
  ]);
  await db.enrollments.toCollection().modify({ joinedOn: '2026-11-13' }); // only one counted day this month
  const rows = await studentRows(db, 'c1', DATE, 'all', '');
  expect(rows.find(r => r.learner.id === 'a')!.presentPct).toBe(100);
  expect(rows.find(r => r.learner.id === 'c')!.presentPct).toBe(50);
});

it('addStudent validates the name format and a 12-digit LRN, then queues add_learner with guardian fields', async () => {
  const db = await classDb();
  const base = { sex: 'M' as const, joinedOn: '2026-11-13' };
  await expect(addStudent(db, 'c1', { ...base, fullName: 'Domingo' }, NOW)).rejects.toThrow('Enter the full name as Last name, First name');
  await expect(addStudent(db, 'c1', { ...base, fullName: 'Domingo, Dino', lrn: '1234' }, NOW)).rejects.toThrow('LRN has 12 digits');
  const l = await addStudent(db, 'c1', { ...base, fullName: 'Domingo, Dino R.', lrn: '123456789012', from: 'Ilagan West CS', guardianName: 'Rosa Domingo', guardianPhone: '09171234567' }, NOW);
  expect(l).toMatchObject({ lastName: 'Domingo', firstName: 'Dino', middleName: 'R.', lrn: '123456789012', guardianName: 'Rosa Domingo' });
  expect(await db.enrollments.where('learnerId').equals(l.id).first()).toMatchObject({ classId: 'c1', joinedOn: '2026-11-13' });
  const ops = (await db.outbox.orderBy('seq').toArray()).map(i => i.op);
  expect(ops[0]).toMatchObject({ kind: 'rpc', fn: 'add_learner', args: { p_learner_id: l.id, p_lrn: '123456789012', p_guardian_name: 'Rosa Domingo', p_guardian_phone: '09171234567' } });
  expect(ops[1]).toMatchObject({ kind: 'update', table: 'enrollments', match: { class_id: 'c1', learner_id: l.id }, values: { joined_from: 'Ilagan West CS' } });
});

it('transferOut sets leftOn to the day after the last day and queues the enrollment update', async () => {
  const db = await classDb();
  await transferOut(db, 'e2', '2026-11-12', 'Cauayan South CS');
  expect(await db.enrollments.get('e2')).toMatchObject({ leftOn: '2026-11-13' });
  expect((await db.outbox.toArray())[0].op).toMatchObject({
    kind: 'update', table: 'enrollments', match: { class_id: 'c1', learner_id: 'c' },
    values: { left_on: '2026-11-13', leave_reason: 'Transferred to Cauayan South CS' },
  });
});

it('a transferred-out learner is not in classDay after the last day but stays in history before it', async () => {
  const db = await classDb();
  await transferOut(db, 'e2', '2026-11-12', 'Cauayan South CS');
  expect((await classDay(db, 'c1', '2026-11-13', NOW)).rows.map(r => r.learner.id)).toEqual(['a', 'b']);
  expect((await classDay(db, 'c1', '2026-11-12', NOW)).rows.map(r => r.learner.id)).toEqual(['a', 'b', 'c']);
});
