// Remote over supabase-js. A thin adapter: row-level security decides what comes back. Tested against a live project later.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { LTap } from './db';
import { correctionFromRow, type Remote, type Snapshot } from './sync';

type Row = Record<string, unknown>;
/** Server and device clocks differ; re-fetch a margin and let merge-by-id drop the repeats. */
const SKEW_MARGIN_MS = 10 * 60_000;

export function supabaseRemote(sb: SupabaseClient): Remote {
  const all = async (table: string, filter?: (q: any) => any): Promise<Row[]> => {
    let q = sb.from(table).select('*');
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  };

  return {
    async push(op) {
      const { error } = op.kind === 'insert'
        ? await sb.from(op.table).upsert(op.row, { onConflict: 'id', ignoreDuplicates: true })
        : await sb.rpc(op.fn, op.args);
      if (error) throw new Error(error.message);
    },

    async pull(sinceIso): Promise<Snapshot> {
      const since = sinceIso ? new Date(Date.parse(sinceIso) - SKEW_MARGIN_MS).toISOString() : null;
      const [classes, learners, enrollments, cards, windows, days, plans, taps, corrections] = await Promise.all([
        all('classes'), all('learners'), all('enrollments'), all('cards'), all('tap_windows'), all('calendar_days'), all('seat_plans'),
        all('taps', q => (since ? q.gt('received_at', since) : q)),
        all('attendance_corrections', q => (since ? q.gt('created_at', since) : q)),
      ]);
      return {
        classes: classes.map(r => ({ id: r.id, schoolYearId: r.school_year_id, subject: r.subject, grade: r.grade, section: r.section,
          isAdvisory: r.is_advisory, ignoreRepeatMinutes: r.ignore_repeat_minutes })) as Snapshot['classes'],
        learners: learners.map(r => ({ id: r.id, lastName: r.last_name, firstName: r.first_name, middleName: r.middle_name ?? undefined,
          sex: r.sex })) as Snapshot['learners'],
        enrollments: enrollments.map(r => ({ id: r.id, classId: r.class_id, learnerId: r.learner_id, joinedOn: r.joined_on,
          leftOn: r.left_on ?? undefined })) as Snapshot['enrollments'],
        cards: cards.map(r => ({ uid: r.uid, learnerId: r.learner_id, active: r.active })) as Snapshot['cards'],
        tapWindows: windows.map(r => ({ id: r.id, classId: r.class_id, session: r.session, kind: r.kind, opens: r.opens,
          lateAfter: r.late_after, closes: r.closes, effectiveFrom: r.effective_from })) as Snapshot['tapWindows'],
        calendarDays: days.map(r => ({ id: r.id, schoolYearId: r.school_year_id, date: r.date, type: r.type, name: r.name })) as Snapshot['calendarDays'],
        seatPlans: plans.map(r => ({ id: r.id, classId: r.class_id, rows: r.rows, cols: r.cols, effectiveFrom: r.effective_from })) as Snapshot['seatPlans'],
        taps: taps.map((r): LTap => ({ id: r.id as string, deviceId: r.device_id as string, cardUid: r.card_uid as string,
          at: new Date(r.tapped_at as string).toISOString(), clockSuspect: r.clock_suspect as boolean })),
        corrections: corrections.map(correctionFromRow),
      };
    },
  };
}
