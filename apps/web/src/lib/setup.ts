import { hm, validateWindows, type IsoDate, type Session, type TapKind } from '@klasilid/core';
import type { KlasilidDb, LLearner, LTapWindow, OutboxItem } from './db';
import { todayManila } from './attendance';
import { holidayRows } from './calendar';

export interface SetupWindow { session: Session; kind: TapKind; opens: string; lateAfter: string | null; closes: string }
export interface SetupLearner { lastName: string; firstName: string; middleName?: string; sex: 'M' | 'F' }
export interface SetupInput {
  schoolName: string; yearLabel: string; startsOn: IsoDate; endsOn: IsoDate;
  grade: 4 | 5 | 6; section: string; rows: number; cols: number;
  windows: SetupWindow[];
  learners: SetupLearner[];
}

export const DEFAULT_SCHOOL = 'San Isidro West Central School';
export const SECTIONS = ['Diamond', 'Ruby', 'Pearl', 'Sapphire', 'Emerald', 'Jade', 'Opal', 'Topaz', 'Amethyst', 'Garnet'];
export const SCHOOL_YEARS = [{ label: 'SY 2026–2027', startsOn: '2026-06-01', endsOn: '2027-04-30' }];
/** Every 15 minutes from 5:00 AM to 7:00 PM, as 'HH:MM' (the mockup's time dropdowns). */
export const TIMES = Array.from({ length: (19 - 5) * 4 + 1 }, (_, i) => {
  const m = 5 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
/** '13:15' → '1:15 PM' */
export function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}
export const DEFAULT_WINDOWS: SetupWindow[] = [
  { session: 'am', kind: 'in', opens: '06:30', lateAfter: '07:15', closes: '08:00' },
  { session: 'am', kind: 'out', opens: '11:30', lateAfter: null, closes: '12:15' },
  { session: 'pm', kind: 'in', opens: '12:30', lateAfter: '13:00', closes: '13:30' },
  { session: 'pm', kind: 'out', opens: '16:00', lateAfter: null, closes: '17:00' },
];

const key = (l: SetupLearner) => [l.lastName, l.firstName, l.middleName ?? ''].map(s => s.trim().toLowerCase()).join('|');

/** Problems with the whole input; [] means it can be applied. */
export function validateSetup(s: SetupInput): string[] {
  const e: string[] = [];
  if (!s.schoolName.trim()) e.push('Enter the school name');
  if (!s.section) e.push('Choose a section');
  if (!(s.startsOn < s.endsOn)) e.push('The school year must end after it starts');
  if (![s.rows, s.cols].every(n => Number.isInteger(n) && n >= 1 && n <= 10)) e.push('Rows and seats per row must be 1 to 10');
  e.push(...validateWindows(s.windows.map(w => ({
    ...w, opens: hm(w.opens), closes: hm(w.closes), lateAfter: w.lateAfter ? hm(w.lateAfter) : null, effectiveFrom: s.startsOn,
  }))));
  if (s.learners.length === 0) e.push('Add at least one learner');
  if (s.learners.some(l => !l.lastName.trim() || !l.firstName.trim())) e.push('Every learner needs a last and first name');
  const seen = new Map<string, SetupLearner>();
  for (const l of s.learners) {
    const first = seen.get(key(l));
    if (first) e.push(`Duplicate learner: ${first.lastName.trim()}, ${first.firstName.trim()}`);
    else seen.set(key(l), l);
  }
  return e;
}

/** "Last, First Middle" per line; lines without a comma or a first name are skipped. */
export function parseLearnerList(text: string): Omit<SetupLearner, 'sex'>[] {
  return text.split(/\r?\n/).flatMap(line => {
    const [last, rest] = line.split(',').map(s => s?.trim());
    if (!last || !rest) return [];
    const [firstName, ...middle] = rest.split(/\s+/);
    return [{ lastName: last, firstName, ...(middle.length ? { middleName: middle.join(' ') } : {}) }];
  });
}

/** Writes the class locally and queues it for the server, in one transaction. Returns the class id. */
export async function applySetup(db: KlasilidDb, s: SetupInput, now: Date): Promise<string> {
  const today = todayManila(now);
  const createdAt = now.toISOString();
  const [schoolId, yearId, classId, planId] = [1, 2, 3, 4].map(() => crypto.randomUUID());
  const learners: LLearner[] = s.learners.map(l => ({
    id: crypto.randomUUID(), lastName: l.lastName.trim(), firstName: l.firstName.trim(),
    ...(l.middleName?.trim() ? { middleName: l.middleName.trim() } : {}), sex: l.sex,
  }));
  const windows: LTapWindow[] = s.windows.map(w => ({
    id: crypto.randomUUID(), classId, session: w.session, kind: w.kind, opens: hm(w.opens),
    lateAfter: w.lateAfter ? hm(w.lateAfter) : null, closes: hm(w.closes), effectiveFrom: today, // policies only accept today onward
  }));
  const op = (o: OutboxItem['op']): OutboxItem => ({ op: o, createdAt });
  const outbox: OutboxItem[] = [
    op({ kind: 'rpc', fn: 'setup_class', args: {
      p_school_id: schoolId, p_school_name: s.schoolName.trim(), p_year_id: yearId, p_year_label: s.yearLabel,
      p_starts: s.startsOn, p_ends: s.endsOn, p_class_id: classId, p_grade: s.grade, p_section: s.section } }),
    ...learners.map(l => op({ kind: 'rpc', fn: 'add_learner', args: {
      p_learner_id: l.id, p_class_id: classId, p_last: l.lastName, p_first: l.firstName, p_middle: l.middleName ?? null,
      p_sex: l.sex, p_joined: today } })),
    ...windows.map(w => op({ kind: 'insert', table: 'tap_windows', row: {
      id: w.id, class_id: classId, session: w.session, kind: w.kind, opens: w.opens, late_after: w.lateAfter,
      closes: w.closes, effective_from: w.effectiveFrom } })),
    op({ kind: 'insert', table: 'seat_plans', row: { id: planId, class_id: classId, rows: s.rows, cols: s.cols, effective_from: today } }),
  ];
  const holidays = holidayRows(yearId, createdAt); // queued after setup_class, which creates the year

  await db.transaction('rw', [db.classes, db.learners, db.enrollments, db.tapWindows, db.seatPlans, db.calendarDays, db.outbox, db.meta], async () => {
    await db.classes.put({ id: classId, schoolYearId: yearId, subject: 'Advisory', grade: s.grade, section: s.section, isAdvisory: true, ignoreRepeatMinutes: 3 });
    await db.learners.bulkPut(learners);
    await db.enrollments.bulkPut(learners.map(l => ({ id: crypto.randomUUID(), classId, learnerId: l.id, joinedOn: today })));
    await db.tapWindows.bulkPut(windows);
    await db.seatPlans.put({ id: planId, classId, rows: s.rows, cols: s.cols, effectiveFrom: today });
    await db.calendarDays.bulkPut(holidays.rows);
    await db.outbox.bulkAdd([...outbox, ...holidays.ops]);
    await db.meta.put({ key: 'classId', value: classId });
  });
  return classId;
}
