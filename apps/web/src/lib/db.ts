import Dexie, { type Table } from 'dexie';
import type { Correction, IsoDate, Tap, TapWindow } from '@klasilid/core';

// Local rows are camelCase versions of the server tables (supabase/migrations). Ids are client-generated UUIDs.
export interface LClass { id: string; schoolYearId: string; subject: string; grade: number; section: string; isAdvisory: boolean; ignoreRepeatMinutes: 1 | 3 | 5 | 10; reviewOutside?: boolean }
export interface LLearner { id: string; lastName: string; firstName: string; middleName?: string; sex: 'M' | 'F'; lrn?: string; guardianName?: string; guardianPhone?: string }
export interface LEnrollment { id: string; classId: string; learnerId: string; joinedOn: IsoDate; leftOn?: IsoDate; leaveReason?: string; joinedFrom?: string }
export interface LCard { uid: string; learnerId: string; active: boolean; issuedAt?: string; replacedAt?: string }
export interface LTapWindow extends TapWindow { id: string; classId: string }
export interface LTap extends Tap { deviceId: string; clockSuspect: boolean }
export interface LCorrection extends Correction { learnerId: string; classId: string; date: IsoDate; createdBy: string; photoPath?: string }
export interface LCalendarDay { id: string; schoolYearId: string; date: IsoDate; type: 'holiday' | 'half' | 'suspension' | 'event'; name: string }
export interface LSeatPlan { id: string; classId: string; rows: number; cols: number; effectiveFrom: IsoDate; createdAt?: string }
export interface LSeat { id: string; planId: string; row: number; col: number; learnerId: string }
export interface LPref { key: string; value: unknown }
export interface LMeta { key: string; value: unknown }
/** Excuse-letter photo kept on this device until plan 2b uploads it. */
export interface LPhoto { correctionId: string; blob: Blob; name: string }

type Row = Record<string, unknown>;
export type ServerTable = 'attendance_corrections' | 'tap_windows' | 'seat_plans' | 'seats' | 'calendar_days' | 'cards' | 'enrollments'
  | 'learners' | 'classes' | 'profiles';
/** A queued change. The server's row-level security and column grants decide what each may touch. */
export type OutboxOp =
  | { kind: 'insert'; table: ServerTable; row: Row }
  | { kind: 'upsert'; table: ServerTable; row: Row; onConflict: string }
  | { kind: 'update'; table: ServerTable; match: Row; values: Row }
  | { kind: 'delete'; table: ServerTable; match: Row }
  | { kind: 'upload'; bucket: 'excuse-letters'; path: string; correctionId: string }   // the photo is read from db.photos when pushed
  | { kind: 'rpc'; fn: 'setup_class' | 'add_learner' | 'register_card'; args: Row };
export interface OutboxItem { seq?: number; op: OutboxOp; createdAt: string }
/** A queued change the server refused; kept so it is never silently lost, and shown to the teacher. */
export interface RejectedItem { id?: number; op: OutboxOp; createdAt: string; error: string; at: string }

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
  rejected!: Table<RejectedItem, number>;
  seats!: Table<LSeat, string>;
  prefs!: Table<LPref, string>;

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
    this.version(3).stores({ rejected: '++id' });
    this.version(4).stores({ seats: 'id, planId', prefs: 'key' });
  }
}

export function openDb(name = 'klasilid'): KlasilidDb {
  return new KlasilidDb(name);
}

/**
 * Saves a correction locally and queues it for the server, in one transaction (spec §7.1).
 * With an excuse-letter photo, the path is set on the row now (corrections can't be edited later) and the upload is queued right after.
 */
export async function recordCorrection(db: KlasilidDb, c: Omit<LCorrection, 'id' | 'at' | 'photoPath'>, now = new Date(), photo?: Blob): Promise<LCorrection> {
  if (!c.reason) throw new Error('A reason is required');
  if (c.reason === 'other' && !c.reasonText?.trim()) throw new Error('Describe the reason');
  const id = crypto.randomUUID();
  const photoPath = photo ? `${c.classId}/${id}.jpg` : undefined;
  const row: LCorrection = { ...c, id, at: now.toISOString(), ...(photoPath ? { photoPath } : {}) };
  await db.transaction('rw', db.corrections, db.outbox, db.photos, async () => {
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
          photo_path: photoPath ?? null,
        },
      },
    });
    if (photo && photoPath) {
      await db.photos.put({ correctionId: id, blob: photo, name: photoPath });
      await db.outbox.add({ createdAt: row.at, op: { kind: 'upload', bucket: 'excuse-letters', path: photoPath, correctionId: id } });
    }
  });
  return row;
}

export function pendingCount(db: KlasilidDb): Promise<number> {
  return db.outbox.count();
}
