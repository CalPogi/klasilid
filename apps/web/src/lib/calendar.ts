import type { IsoDate } from '@klasilid/core';
import { classDay } from './attendance';
import type { KlasilidDb, LCalendarDay, OutboxItem } from './db';

/**
 * SY 2026–2027 holidays and DepEd break days, preloaded; the teacher can change any of them.
 * Aug–Dec 2026 copied from the approved mockup; 2027 regular holidays added. Weekends left out (already no-school).
 */
export const PH_HOLIDAYS: { date: IsoDate; name: string }[] = [
  { date: '2026-08-21', name: 'Ninoy Aquino Day' },
  { date: '2026-08-31', name: 'National Heroes Day' },
  { date: '2026-11-02', name: "All Souls' Day" },
  { date: '2026-11-30', name: 'Bonifacio Day' },
  { date: '2026-12-08', name: 'Immaculate Conception' },
  { date: '2026-12-21', name: 'Christmas break' },
  { date: '2026-12-22', name: 'Christmas break' },
  { date: '2026-12-23', name: 'Christmas break' },
  { date: '2026-12-24', name: 'Christmas Eve' },
  { date: '2026-12-25', name: 'Christmas Day' },
  { date: '2026-12-28', name: 'Christmas break' },
  { date: '2026-12-29', name: 'Christmas break' },
  { date: '2026-12-30', name: 'Rizal Day' },
  { date: '2026-12-31', name: "New Year's Eve" },
  { date: '2027-01-01', name: "New Year's Day" },
  { date: '2027-03-25', name: 'Maundy Thursday' },
  { date: '2027-03-26', name: 'Good Friday' },
  { date: '2027-04-09', name: 'Araw ng Kagitingan' },
];

export type DayKind = 'school' | 'half' | 'suspension' | 'holiday';
export const KIND_LABEL: Record<Exclude<DayKind, 'school'>, string> = { holiday: 'Holiday', half: 'Half day', suspension: 'Suspended' };
const DEFAULT_NAME: Record<Exclude<DayKind, 'school'>, string> = { holiday: 'Holiday', half: 'Half day', suspension: 'Class suspension' };

/** Only the school year's admin can change the calendar on the server; a refusal lands in the rejected list (plan 2a). */
export async function setDayType(db: KlasilidDb, schoolYearId: string, date: IsoDate, kind: DayKind, name?: string): Promise<void> {
  const existing = (await db.calendarDays.where('date').equals(date).toArray()).filter(d => d.schoolYearId === schoolYearId);
  const createdAt = new Date().toISOString();
  await db.transaction('rw', db.calendarDays, db.outbox, async () => {
    await db.calendarDays.bulkDelete(existing.map(d => d.id));
    if (kind === 'school') {
      await db.outbox.add({ createdAt, op: { kind: 'delete', table: 'calendar_days', match: { school_year_id: schoolYearId, date } } });
      return;
    }
    const row: LCalendarDay = { id: existing[0]?.id ?? crypto.randomUUID(), schoolYearId, date, type: kind, name: name ?? (existing[0]?.type === kind ? existing[0].name : DEFAULT_NAME[kind]) };
    await db.calendarDays.put(row);
    await db.outbox.add({ createdAt, op: { kind: 'upsert', table: 'calendar_days', onConflict: 'school_year_id,date',
      row: { school_year_id: schoolYearId, date, type: row.type, name: row.name } } });
  });
}

/** Local rows plus queued upserts for the preloaded holidays of a new school year. */
export function holidayRows(schoolYearId: string, createdAt: string): { rows: LCalendarDay[]; ops: OutboxItem[] } {
  const rows = PH_HOLIDAYS.map(h => ({ id: crypto.randomUUID(), schoolYearId, date: h.date, type: 'holiday' as const, name: h.name }));
  return {
    rows,
    ops: rows.map(r => ({ createdAt, op: { kind: 'upsert', table: 'calendar_days', onConflict: 'school_year_id,date',
      row: { school_year_id: schoolYearId, date: r.date, type: r.type, name: r.name } } })),
  };
}

export interface DayCell { date: IsoDate; weekend: boolean; kind: Exclude<DayKind, 'school'> | null; name?: string; pct?: number; inCount?: number; isToday: boolean; past: boolean }

/** One cell per date of `month` ('YYYY-MM'); past school days get the share of learners who came in the morning. */
export async function monthCells(db: KlasilidDb, classId: string, month: string, today: IsoDate, now: Date): Promise<DayCell[]> {
  const cls = await db.classes.get(classId);
  const special = new Map((await db.calendarDays.toArray())
    .filter(d => d.date.startsWith(month) && (!cls || d.schoolYearId === cls.schoolYearId) && d.type !== 'event').map(d => [d.date, d]));
  const cells: DayCell[] = [];
  const d = new Date(month + '-01T00:00:00Z');
  while (d.toISOString().slice(0, 7) === month) {
    const date = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    const s = special.get(date);
    const cell: DayCell = { date, weekend: wd === 0 || wd === 6, kind: (s?.type as DayCell['kind']) ?? null, name: s?.name, isToday: date === today, past: date < today };
    if (!cell.weekend && (cell.kind === null || cell.kind === 'half') && date <= today) {
      const day = await classDay(db, classId, date, now);
      if (!day.needsSetup && day.counts.total) { cell.pct = Math.round((day.counts.in / day.counts.total) * 100); cell.inCount = day.counts.in; }
    }
    cells.push(cell);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return cells;
}
