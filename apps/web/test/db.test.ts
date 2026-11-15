import { expect, it } from 'vitest';
import { openDb, pendingCount, recordCorrection, type LCorrection } from '../src/lib/db';
import { FIRST, LAST, seedDemo } from '../src/lib/demo';

const fresh = () => openDb('t-' + crypto.randomUUID());
const base: Omit<LCorrection, 'id' | 'at'> = {
  learnerId: 'l1', classId: 'c1', date: '2026-11-13', session: 'am', status: 'absent',
  reason: 'tapped_by_classmate', createdBy: 'teacher-1',
};

it('recordCorrection writes the row and one outbox insert atomically', async () => {
  const db = fresh();
  const c = await recordCorrection(db, base, new Date('2026-11-13T01:00:00Z'));
  expect(c.at).toBe('2026-11-13T01:00:00.000Z');
  expect(await db.corrections.count()).toBe(1);
  const out = await db.outbox.toArray();
  expect(out).toHaveLength(1);
  expect(out[0].op).toMatchObject({ kind: 'insert', table: 'attendance_corrections' });
  const row = (out[0].op as { row: Record<string, unknown> }).row;
  expect(row).toMatchObject({
    id: c.id, learner_id: 'l1', class_id: 'c1', date: '2026-11-13', session: 'am', status: 'absent',
    reason: 'tapped_by_classmate', created_by: 'teacher-1', created_at: c.at,
  });
});

it('rejects a missing reason and an empty "other"', async () => {
  const db = fresh();
  await expect(recordCorrection(db, { ...base, reason: '' as never })).rejects.toThrow('A reason is required');
  await expect(recordCorrection(db, { ...base, reason: 'other', reasonText: '   ' })).rejects.toThrow('Describe the reason');
  expect(await db.corrections.count()).toBe(0);
  expect(await db.outbox.count()).toBe(0);
});

it('keeps the "other" text in the row', async () => {
  const db = fresh();
  await recordCorrection(db, { ...base, reason: 'other', reasonText: 'Went home sick at 10' });
  const row = ((await db.outbox.toArray())[0].op as { row: Record<string, unknown> }).row;
  expect(row.reason_text).toBe('Went home sick at 10');
});

it('pendingCount counts outbox items', async () => {
  const db = fresh();
  expect(await pendingCount(db)).toBe(0);
  await recordCorrection(db, base);
  await recordCorrection(db, { ...base, session: 'pm' });
  expect(await pendingCount(db)).toBe(2);
});

it('seedDemo creates 38 learners with cards and no outbox items', async () => {
  const db = fresh();
  await seedDemo(db, new Date('2026-11-13T04:00:00Z'));
  expect(await db.learners.count()).toBe(38);
  expect(await db.cards.count()).toBe(38);
  expect(await db.enrollments.count()).toBe(38);
  expect(await db.tapWindows.count()).toBe(4);
  expect(await db.taps.count()).toBeGreaterThan(38 * 9);
  expect(await db.outbox.count()).toBe(0);
  const cls = await db.classes.toArray();
  expect(cls).toMatchObject([{ grade: 6, section: 'Diamond', isAdvisory: true }]);
});

it('demo taps for today stop at now', async () => {
  const db = fresh();
  const now = new Date('2026-11-13T00:00:00Z'); // 08:00 Manila
  await seedDemo(db, now);
  const latest = (await db.taps.orderBy('at').last())!;
  expect(Date.parse(latest.at)).toBeLessThanOrEqual(now.getTime());
});

it('demo names are invented: every name comes from demo.ts\'s own lists', async () => {
  const db = fresh();
  await seedDemo(db, new Date('2026-11-13T04:00:00Z'));
  for (const l of await db.learners.toArray()) {
    expect(FIRST).toContain(l.firstName);
    expect(LAST).toContain(l.lastName);
  }
});

it('a correction with a photo queues the insert (with photo_path) then the upload, and keeps the photo on the device', async () => {
  const db = fresh();
  const photo = new Blob(['jpg-bytes'], { type: 'image/jpeg' });
  const c = await recordCorrection(db, base, new Date('2026-11-13T01:00:00Z'), photo);
  const ops = (await db.outbox.orderBy('seq').toArray()).map(i => i.op);
  expect(ops).toHaveLength(2);
  expect(ops[0]).toMatchObject({ kind: 'insert', table: 'attendance_corrections', row: { id: c.id, photo_path: `c1/${c.id}.jpg` } });
  expect(ops[1]).toEqual({ kind: 'upload', bucket: 'excuse-letters', path: `c1/${c.id}.jpg`, correctionId: c.id });
  expect(await db.photos.get(c.id)).toMatchObject({ correctionId: c.id, name: `c1/${c.id}.jpg` }); // fake-indexeddb can't clone Blob contents under jsdom
  expect(c.photoPath).toBe(`c1/${c.id}.jpg`);
});
