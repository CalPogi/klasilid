import Dexie, { type Table } from 'dexie';
import type { Correction, IsoDate, Tap, TapWindow } from '@klasilid/core';

// Local rows are camelCase versions of the server tables (supabase/migrations). Ids are client-generated UUIDs.
export interface LClass { id: string; schoolYearId: string; subject: string; grade: number; section: string; isAdvisory: boolean; ignoreRepeatMinutes: 1 | 3 | 5 | 10 }
export interface LLearner { id: string; lastName: string; firstName: string; middleName?: string; sex: 'M' | 'F' }
export interface LEnrollment { id: string; classId: string; learnerId: string; joinedOn: IsoDate; leftOn?: IsoDate }
export interface LCard { uid: string; learnerId: string; active: boolean }
export interface LTapWindow extends TapWindow { id: string; classId: string }
export interface LTap extends Tap { deviceId: string; clockSuspect: boolean }
export interface LCorrection extends Correction { learnerId: string; classId: string; date: IsoDate; createdBy: string }
export interface LCalendarDay { id: string; schoolYearId: string; date: IsoDate; type: 'holiday' | 'half' | 'suspension' | 'event'; name: string }
export interface LSeatPlan { id: string; classId: string; rows: number; cols: number; effectiveFrom: IsoDate }
export interface LMeta { key: string; value: unknown }
/** Excuse-letter photo kept on this device until plan 2b uploads it. */
export interface LPhoto { correctionId: string; blob: Blob; name: string }

export type OutboxOp =
  | { kind: 'insert'; table: 'attendance_corrections' | 'tap_windows' | 'seat_plans' | 'calendar_days'; row: Record<string, unknown> }
  | { kind: 'rpc'; fn: 'setup_class' | 'add_learner'; args: Record<string, unknown> };
export interface OutboxItem { seq?: number; op: OutboxOp; createdAt: string }

export class KlasilidDb extends Dexie {
  classes!: Table<LClass, string>;
  learners!: Table<LLearner, string>;
  enrollments!: Table<LEnrollment, string>;
  cards!: Table<LCard, string>;
  tapWindows!: Table<LTapWindow, string>;
  taps!: Table<LTap, string>;
  corrections!: Table<LCorrection, string>;
  calendarDays!: Table<LCalendarDay, string>;
  seatPlans!: Table<LSeatPlan, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<LMeta, string>;
  photos!: Table<LPhoto, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      classes: 'id',
      learners: 'id',
      enrollments: 'id, classId, learnerId',
      cards: 'uid, learnerId',
      tapWindows: 'id, classId',
      taps: 'id, cardUid, at',
      corrections: 'id, learnerId, date',
      calendarDays: 'id, date',
      seatPlans: 'id, classId',
      outbox: '++seq',
      meta: 'key',
    });
    this.version(2).stores({ photos: 'correctionId' });
  }
}

export function openDb(name = 'klasilid'): KlasilidDb {
  return new KlasilidDb(name);
}

/** Saves a correction locally and queues it for the server, in one transaction (spec §7.1). */
export async function recordCorrection(db: KlasilidDb, c: Omit<LCorrection, 'id' | 'at'>, now = new Date()): Promise<LCorrection> {
  if (!c.reason) throw new Error('A reason is required');
  if (c.reason === 'other' && !c.reasonText?.trim()) throw new Error('Describe the reason');
  const row: LCorrection = { ...c, id: crypto.randomUUID(), at: now.toISOString() };
  await db.transaction('rw', db.corrections, db.outbox, async () => {
    await db.corrections.add(row);
    await db.outbox.add({
      createdAt: row.at,
      op: {
        kind: 'insert',
        table: 'attendance_corrections',
        row: {
          id: row.id, learner_id: row.learnerId, class_id: row.classId, date: row.date, session: row.session,
          status: row.status, reason: row.reason, reason_text: row.reasonText ?? null, created_by: row.createdBy,
          created_at: row.at, // device time: the newest correction wins by when it was made, not when it synced
        },
      },
    });
  });
  return row;
}

export function pendingCount(db: KlasilidDb): Promise<number> {
  return db.outbox.count();
}
