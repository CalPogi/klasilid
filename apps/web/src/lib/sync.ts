import { RejectedError } from './remote-supabase';
import type {
  KlasilidDb, LCalendarDay, LCard, LClass, LCorrection, LEnrollment, LLearner, LSeat, LSeatPlan, LTap, LTapWindow, OutboxOp,
} from './db';

/** What the server holds that this device may see. Small tables arrive in full; taps and corrections are merged by id. */
export interface Snapshot {
  classes: LClass[]; learners: LLearner[]; enrollments: LEnrollment[]; cards: LCard[]; tapWindows: LTapWindow[];
  calendarDays: LCalendarDay[]; seatPlans: LSeatPlan[]; seats: LSeat[]; taps: LTap[]; corrections: LCorrection[];
}

export interface Remote {
  /** Must be idempotent: inserts carry client ids and the server ignores duplicates; RPCs are idempotent by id. */
  push(op: OutboxOp): Promise<void>;
  /** Taps and corrections received after `sinceIso` (null = all); small tables in full. */
  pull(sinceIso: string | null): Promise<Snapshot>;
}

export interface SyncResult { pushed: number; pulled: boolean; rejected: number; error?: string }

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Push the outbox in order, then pull. Never loses or duplicates a queued change (spec §9). */
export async function syncOnce(db: KlasilidDb, remote: Remote, now = new Date()): Promise<SyncResult> {
  let pushed = 0;
  let rejected = 0;
  for (const item of await db.outbox.orderBy('seq').toArray()) {
    try {
      await remote.push(item.op);
      pushed++;
    } catch (e) {
      if (!(e instanceof RejectedError)) return { pushed, pulled: false, rejected, error: message(e) }; // offline: keep the rest, skip the pull
      // Refused for good: set it aside (never lost, shown to the teacher) so it can't block every later change.
      await db.rejected.add({ op: item.op, createdAt: item.createdAt, error: e.message, at: now.toISOString() });
      rejected++;
    }
    await db.outbox.delete(item.seq!);
  }

  const startedAt = now.toISOString();
  const since = ((await db.meta.get('lastPull'))?.value as string | undefined) ?? null;
  let snap: Snapshot;
  try {
    snap = await remote.pull(since);
  } catch (e) {
    return { pushed, pulled: false, rejected, error: message(e) };
  }

  const small = [db.classes, db.learners, db.enrollments, db.cards, db.tapWindows, db.calendarDays, db.seatPlans, db.seats];
  await db.transaction('rw', [...small, db.taps, db.corrections, db.outbox, db.meta], async () => {
    // A change queued while the pull was in flight would be wiped by a full replace; keep local rows until it is pushed.
    if ((await db.outbox.count()) === 0) {
      await Promise.all(small.map(t => t.clear()));
      await db.classes.bulkPut(snap.classes);
      await db.learners.bulkPut(snap.learners);
      await db.enrollments.bulkPut(snap.enrollments);
      await db.cards.bulkPut(snap.cards);
      await db.tapWindows.bulkPut(snap.tapWindows);
      await db.calendarDays.bulkPut(snap.calendarDays);
      await db.seatPlans.bulkPut(snap.seatPlans);
      await db.seats.bulkPut(snap.seats);
    }
    await db.taps.bulkPut(snap.taps);
    await db.corrections.bulkPut(snap.corrections);
    await db.meta.put({ key: 'lastPull', value: startedAt });
  });
  return { pushed, pulled: true, rejected };
}

/** Server row (snake_case) → local correction. Shared by the Supabase remote and tests. */
export function correctionFromRow(r: Record<string, unknown>): LCorrection {
  return {
    id: r.id as string, learnerId: r.learner_id as string, classId: r.class_id as string, date: r.date as string,
    session: r.session as LCorrection['session'], status: r.status as LCorrection['status'], reason: r.reason as LCorrection['reason'],
    reasonText: (r.reason_text as string | null) ?? undefined, createdBy: r.created_by as string, at: new Date(r.created_at as string).toISOString(),
    photoPath: (r.photo_path as string | null) ?? undefined,
  };
}
