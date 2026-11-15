import { computeDay, manilaDate, windowsForDate, type DayType, type HalfDay, type IsoDate, type ReviewItem, type TapWindow } from '@klasilid/core';
import type { KlasilidDb, LLearner, LTap } from './db';

export interface LearnerDay { learner: LLearner; am: HalfDay; pm: HalfDay; review: ReviewItem[]; /** this learner's taps that day */ taps: LTap[] }
export interface ClassDay {
  date: IsoDate;
  dayType: DayType;
  /** No in-window is in effect for this date: show "Set up tap times", never mark anyone absent. */
  needsSetup: boolean;
  rows: LearnerDay[];
  /** Tap windows in effect that day. */
  windows: TapWindow[];
  /** From the morning half: in = on time + late, notYet = pending. */
  counts: { in: number; late: number; absent: number; notYet: number; total: number };
  /** Taps whose card is not an active card of an enrolled learner. */
  unknownTaps: LTap[];
  /** Taps of enrolled learners stamped by a reader clock that looked wrong. */
  suspectTaps: LTap[];
}

export function todayManila(now: Date): IsoDate {
  return manilaDate(now.toISOString());
}

/** The UTC instant of Manila midnight at the start of `date`. */
const manilaMidnight = (date: IsoDate) => new Date(Date.parse(date + 'T00:00:00Z') - 8 * 3600_000);

const byName = (a: LLearner, b: LLearner) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName);

export async function classDay(db: KlasilidDb, classId: string, date: IsoDate, now: Date): Promise<ClassDay> {
  const cls = await db.classes.get(classId);
  const enrolled = (await db.enrollments.where('classId').equals(classId).toArray())
    .filter(e => e.joinedOn <= date && (!e.leftOn || date < e.leftOn));
  const learners = (await db.learners.bulkGet(enrolled.map(e => e.learnerId))).filter((l): l is LLearner => !!l).sort(byName);
  const ids = new Set(learners.map(l => l.id));
  const ownerOf = new Map((await db.cards.toArray()).filter(c => c.active && ids.has(c.learnerId)).map(c => [c.uid, c.learnerId]));

  const start = manilaMidnight(date);
  const end = new Date(start.getTime() + 24 * 3600_000);
  const taps = await db.taps.where('at').between(start.toISOString(), end.toISOString(), true, false).toArray();
  const windows = windowsForDate(await db.tapWindows.where('classId').equals(classId).toArray(), date);
  const needsSetup = !windows.some(w => w.kind === 'in');

  const weekday = new Date(date + 'T00:00:00Z').getUTCDay();
  const special = (await db.calendarDays.where('date').equals(date).toArray()).find(d => !cls || d.schoolYearId === cls.schoolYearId);
  const dayType: DayType = weekday === 0 || weekday === 6 ? 'holiday' // Saturday classes are out of scope
    : !special || special.type === 'event' ? 'school' : special.type;

  const corrections = (await db.corrections.where('date').equals(date).toArray()).filter(c => c.classId === classId);
  const rows: LearnerDay[] = learners.map(learner => {
    const mine = taps.filter(t => ownerOf.get(t.cardUid) === learner.id);
    const r = computeDay({
      date, dayType, now: now.toISOString(), windows, ignoreRepeatMinutes: cls?.ignoreRepeatMinutes ?? 3,
      taps: mine, corrections: corrections.filter(c => c.learnerId === learner.id),
    });
    return { learner, am: r.am, pm: r.pm, review: needsSetup ? [] : r.review, taps: mine };
  });

  const am = rows.map(r => r.am.status);
  const count = (s: string) => am.filter(x => x === s).length;
  return {
    date, dayType, needsSetup, rows, windows,
    counts: { in: count('on_time') + count('late'), late: count('late'), absent: count('absent'), notYet: count('pending'), total: rows.length },
    unknownTaps: taps.filter(t => !ownerOf.has(t.cardUid)),
    suspectTaps: taps.filter(t => t.clockSuspect && ownerOf.has(t.cardUid)),
  };
}

/** Learners the teacher should look at: stray taps first, then after-closing arrivals, then morning absences. */
export function needsAttention(day: ClassDay): LearnerDay[] {
  const review = day.rows.filter(r => r.review.length > 0);
  const afterClosing = day.rows.filter(r => r.am.flags.includes('after_closing') || r.pm.flags.includes('after_closing'));
  const absent = day.rows.filter(r => r.am.status === 'absent');
  return [...new Set([...review, ...afterClosing, ...absent])];
}

/** School days (weekdays that are not a holiday or suspension) in `month` ('YYYY-MM') up to `today`, newest first. */
export async function schoolDaysInMonth(db: KlasilidDb, classId: string, month: string, today: IsoDate): Promise<IsoDate[]> {
  const cls = await db.classes.get(classId);
  const off = new Set((await db.calendarDays.toArray())
    .filter(d => (!cls || d.schoolYearId === cls.schoolYearId) && (d.type === 'holiday' || d.type === 'suspension'))
    .map(d => d.date));
  const out: IsoDate[] = [];
  const d = new Date(month + '-01T00:00:00Z');
  while (d.toISOString().slice(0, 7) === month) {
    const iso = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay();
    if (iso <= today && wd !== 0 && wd !== 6 && !off.has(iso)) out.unshift(iso);
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** Months from the class's first enrollment to `today`, newest first, as 'YYYY-MM'. */
export async function monthsWithAttendance(db: KlasilidDb, classId: string, today: IsoDate): Promise<string[]> {
  const joined = (await db.enrollments.where('classId').equals(classId).toArray()).map(e => e.joinedOn).sort()[0] ?? today;
  const out: string[] = [];
  const d = new Date(joined.slice(0, 7) + '-01T00:00:00Z');
  while (d.toISOString().slice(0, 7) <= today.slice(0, 7)) {
    out.unshift(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export type DayLetter = 'P' | 'L' | 'A' | 'E' | 'H' | 'N';

/**
 * One letter for the month grid (mockup legend): P present, L late, A absent, E excused,
 * H half day (present one half, absent the other), N nothing yet. No-school halves are ignored.
 */
export function dayLetter(am: HalfDay, pm: HalfDay): DayLetter {
  const s = [am.status, pm.status].filter(x => x !== 'no_school' && x !== 'pending');
  if (!s.length) return 'N';
  const present = s.some(x => x === 'on_time' || x === 'late');
  if (present && s.includes('absent')) return 'H';
  if (s.includes('excused') && !present) return 'E';
  if (s.every(x => x === 'absent')) return 'A';
  return s.includes('late') ? 'L' : 'P';
}
