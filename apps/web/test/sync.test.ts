import { computeDay } from '@klasilid/core';
import { beforeEach, expect, it } from 'vitest';
import { openDb, recordCorrection, type KlasilidDb, type LCorrection, type OutboxOp } from '../src/lib/db';
import { RejectedError } from '../src/lib/remote-supabase';
import { correctionFromRow, syncOnce, type Remote, type Snapshot } from '../src/lib/sync';

const empty = (): Snapshot => ({ classes: [], learners: [], enrollments: [], cards: [], tapWindows: [], calendarDays: [], seatPlans: [], taps: [], corrections: [] });

/** In-memory stand-in for Supabase: ignores duplicate ids like the server's on-conflict-do-nothing. */
class FakeRemote implements Remote {
  rows = new Map<string, Record<string, unknown>>();
  rpcs: OutboxOp[] = [];
  pushes = 0;
  failAfter = Infinity;
  failPull = false;
  refuse = new Set<string>();
  base = empty();
  async push(op: OutboxOp) {
    if (this.pushes >= this.failAfter) throw new Error('network down');
    if (op.kind === 'insert' && this.refuse.has(op.row.id as string)) throw new RejectedError('new row violates row-level security policy');
    this.pushes++;
    if (op.kind === 'insert') { if (!this.rows.has(op.row.id as string)) this.rows.set(op.row.id as string, op.row); }
    else this.rpcs.push(op);
  }
  async pull(): Promise<Snapshot> {
    if (this.failPull) throw new Error('offline');
    return { ...this.base, corrections: [...this.base.corrections, ...[...this.rows.values()].map(correctionFromRow)] };
  }
}

const fresh = () => openDb('t-' + crypto.randomUUID());
const corr = (over: Partial<LCorrection> = {}) => ({
  learnerId: 'l1', classId: 'c1', date: '2026-11-13', session: 'am' as const, status: 'absent' as const,
  reason: 'tapped_by_classmate' as const, createdBy: 't1', ...over,
});

let db: KlasilidDb;
let remote: FakeRemote;
beforeEach(() => { db = fresh(); remote = new FakeRemote(); });

it('pushes every outbox item in order, then pulls', async () => {
  const a = await recordCorrection(db, corr(), new Date('2026-11-13T01:00:00Z'));
  const b = await recordCorrection(db, corr({ session: 'pm' }), new Date('2026-11-13T02:00:00Z'));
  const r = await syncOnce(db, remote, new Date('2026-11-13T03:00:00Z'));
  expect(r).toEqual({ pushed: 2, pulled: true, rejected: 0 });
  expect([...remote.rows.keys()]).toEqual([a.id, b.id]);
  expect(await db.outbox.count()).toBe(0);
  expect((await db.meta.get('lastPull'))?.value).toBe('2026-11-13T03:00:00.000Z');
});

it('network drops mid-push: sent items are removed, the rest stay, no pull', async () => {
  for (const s of ['am', 'pm', 'am'] as const) await recordCorrection(db, corr({ session: s }));
  remote.failAfter = 1;
  const r = await syncOnce(db, remote);
  expect(r).toMatchObject({ pushed: 1, pulled: false, error: 'network down' });
  expect(remote.rows.size).toBe(1);
  expect(await db.outbox.count()).toBe(2);
  expect(await db.meta.get('lastPull')).toBeUndefined();
  remote.failAfter = Infinity;
  expect(await syncOnce(db, remote)).toEqual({ pushed: 2, pulled: true, rejected: 0 });
  expect(remote.rows.size).toBe(3);
  expect(await db.outbox.count()).toBe(0);
});

it('a retried push of an already-received item is not duplicated', async () => {
  const c = await recordCorrection(db, corr());
  const item = (await db.outbox.toArray())[0];
  await remote.push(item.op); // arrived, but the ack was lost
  await syncOnce(db, remote);
  expect([...remote.rows.keys()]).toEqual([c.id]);
});

it('pull replaces small tables and merges taps/corrections without dropping local ones', async () => {
  await db.learners.put({ id: 'gone', firstName: 'Old', lastName: 'Row', sex: 'M' });
  await db.taps.put({ id: 'local-tap', deviceId: 'd', cardUid: 'DE000001', at: '2026-11-13T00:00:00Z', clockSuspect: false });
  remote.base.learners = [{ id: 'l1', firstName: 'Ana', lastName: 'Abad', sex: 'F' }];
  remote.base.taps = [{ id: 'server-tap', deviceId: 'd', cardUid: 'DE000002', at: '2026-11-13T00:01:00Z', clockSuspect: false }];
  await syncOnce(db, remote);
  expect((await db.learners.toArray()).map(l => l.id)).toEqual(['l1']);
  expect((await db.taps.toArray()).map(t => t.id).sort()).toEqual(['local-tap', 'server-tap']);
});

it('two devices correcting offline converge on the later-created correction', async () => {
  const dbB = fresh();
  await recordCorrection(db, corr({ status: 'absent' }), new Date('2026-11-13T08:00:00Z'));
  await recordCorrection(dbB, corr({ status: 'excused', reason: 'sick' }), new Date('2026-11-13T08:05:00Z'));
  await syncOnce(db, remote);
  await syncOnce(dbB, remote);
  await syncOnce(db, remote);
  for (const d of [db, dbB]) {
    const corrections = await d.corrections.toArray();
    expect(corrections).toHaveLength(2);
    const r = computeDay({ date: '2026-11-13', taps: [], windows: [], dayType: 'school', corrections, now: '2026-11-13T12:00:00Z', ignoreRepeatMinutes: 3 });
    expect(r.am.status).toBe('excused');
  }
});

it('offline (pull throws) leaves local data untouched and returns error', async () => {
  await db.learners.put({ id: 'keep', firstName: 'Ana', lastName: 'Abad', sex: 'F' });
  remote.failPull = true;
  const r = await syncOnce(db, remote);
  expect(r).toMatchObject({ pulled: false, error: 'offline' });
  expect(await db.learners.count()).toBe(1);
});

it('a change the server refuses is set aside and the rest still sync', async () => {
  const a = await recordCorrection(db, corr({ session: 'am' }));
  const b = await recordCorrection(db, corr({ session: 'pm' }));
  const c = await recordCorrection(db, corr({ session: 'am', status: 'excused', reason: 'sick' }));
  remote.refuse.add(b.id);
  const r = await syncOnce(db, remote);
  expect(r).toMatchObject({ pushed: 2, pulled: true, rejected: 1 });
  expect([...remote.rows.keys()]).toEqual([a.id, c.id]);
  expect(await db.outbox.count()).toBe(0);
  const set = await db.rejected.toArray();
  expect(set).toHaveLength(1);
  expect(set[0]).toMatchObject({ error: 'new row violates row-level security policy' });
});
