// Remote over supabase-js. A thin adapter: row-level security decides what comes back. Tested against a live project later.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { KlasilidDb, LTap } from './db';
import { correctionFromRow, type Remote, type Snapshot } from './sync';

type Row = Record<string, unknown>;

/** The server looked at the change and refused it (permission, constraint, bad input). Retrying won't help. */
export class RejectedError extends Error {}

/** Postgres/PostgREST errors carry a code; a failed fetch (no internet) does not. 401/408/429 are worth retrying. */
function toError(e: { message: string; code?: string; status?: number }): Error {
  const retry = !e.code && (!e.status || [401, 408, 429].includes(e.status) || e.status >= 500);
  return retry ? new Error(e.message) : new RejectedError(e.message);
}
/** Server and device clocks differ; re-fetch a margin and let merge-by-id drop the repeats. */
const SKEW_MARGIN_MS = 10 * 60_000;

export function supabaseRemote(sb: SupabaseClient, db?: KlasilidDb): Remote {
  const all = async (table: string, filter?: (q: any) => any): Promise<Row[]> => {
    let q = sb.from(table).select('*');
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  };

  return {
    async push(op) {
      let res: { error: { message: string; code?: string; status?: number } | null };
      switch (op.kind) {
        case 'insert': res = await sb.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: true }); break;
        case 'upsert': res = await sb.from(op.table).upsert(op.row, { onConflict: op.onConflict }); break;
        case 'update': res = await sb.from(op.table).update(op.values).match(op.match); break;   // zero matched rows is not an error
        case 'delete': res = await sb.from(op.table).delete().match(op.match); break;
        case 'upload': {
          const photo = await db?.photos.get(op.correctionId);
          if (!photo) throw new RejectedError('photo missing on this device');
          const up = await sb.storage.from(op.bucket).upload(op.path, photo.blob, { upsert: true, contentType: 'image/jpeg' });
          res = { error: up.error ? { message: up.error.message, status: Number((up.error as { statusCode?: string }).statusCode) || undefined } : null };
          break;
        }
        case 'rpc': res = await sb.rpc(op.fn, op.args); break;
      }
      if (res.error) throw toError(res.error);
    },

    async pull(sinceIso): Promise<Snapshot> {
      const since = sinceIso ? new Date(Date.parse(sinceIso) - SKEW_MARGIN_MS).toISOString() : null;
      const [classes, learners, enrollments, cards, windows, days, plans, seats, taps, corrections] = await Promise.all([
        all('classes'), all('learners'), all('enrollments'), all('cards'), all('tap_windows'), all('calendar_days'), all('seat_plans'), all('seats'),
        all('taps', q => (since ? q.gt('received_at', since) : q)),
        // created_at is the device's clock, so filtering on it can skip an offline correction; one class's corrections are few, fetch them all.
        all('attendance_corrections'),
      ]);
      return {
        classes: classes.map(r => ({ id: r.id, schoolYearId: r.school_year_id, subject: r.subject, grade: r.grade, section: r.section,
          isAdvisory: r.is_advisory, ignoreRepeatMinutes: r.ignore_repeat_minutes, reviewOutside: r.review_outside })) as Snapshot['classes'],
        learners: learners.map(r => ({ id: r.id, lastName: r.last_name, firstName: r.first_name, middleName: r.middle_name ?? undefined,
          sex: r.sex, lrn: r.lrn ?? undefined, guardianName: r.guardian_name ?? undefined, guardianPhone: r.guardian_phone ?? undefined })) as Snapshot['learners'],
        enrollments: enrollments.map(r => ({ id: r.id, classId: r.class_id, learnerId: r.learner_id, joinedOn: r.joined_on,
          leftOn: r.left_on ?? undefined })) as Snapshot['enrollments'],
        cards: cards.map(r => ({ uid: r.uid, learnerId: r.learner_id, active: r.active })) as Snapshot['cards'],
        tapWindows: windows.map(r => ({ id: r.id, classId: r.class_id, session: r.session, kind: r.kind, opens: r.opens,
          lateAfter: r.late_after, closes: r.closes, effectiveFrom: r.effective_from })) as Snapshot['tapWindows'],
        calendarDays: days.map(r => ({ id: r.id, schoolYearId: r.school_year_id, date: r.date, type: r.type, name: r.name })) as Snapshot['calendarDays'],
        seatPlans: plans.map(r => ({ id: r.id, classId: r.class_id, rows: r.rows, cols: r.cols, effectiveFrom: r.effective_from, createdAt: r.created_at })) as Snapshot['seatPlans'],
        seats: seats.map(r => ({ id: r.id, planId: r.plan_id, row: r.row, col: r.col, learnerId: r.learner_id })) as Snapshot['seats'],
        taps: taps.map((r): LTap => ({ id: r.id as string, deviceId: r.device_id as string, cardUid: r.card_uid as string,
          at: new Date(r.tapped_at as string).toISOString(), clockSuspect: r.clock_suspect as boolean })),
        corrections: corrections.map(correctionFromRow),
      };
    },
  };
}
