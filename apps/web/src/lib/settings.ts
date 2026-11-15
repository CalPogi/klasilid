import { hm, validateWindows } from '@klasilid/core';
import { dayLetter, todayManila, type ClassDay } from './attendance';
import type { KlasilidDb, LTapWindow, OutboxOp } from './db';
import type { SetupWindow } from './setup';

const queue = (db: KlasilidDb, op: OutboxOp) => db.outbox.add({ createdAt: new Date().toISOString(), op });

/** Tap times from today forward; past days keep theirs (spec §7.1). Saving again today replaces today's times. */
export async function saveTapWindows(db: KlasilidDb, classId: string, windows: SetupWindow[], now: Date): Promise<string[]> {
  const today = todayManila(now);
  const rows: LTapWindow[] = windows.map(w => ({
    id: `${classId}-${w.session}-${w.kind}-${today}`, classId, session: w.session, kind: w.kind,
    opens: hm(w.opens), lateAfter: w.lateAfter ? hm(w.lateAfter) : null, closes: hm(w.closes), effectiveFrom: today,
  }));
  const errors = validateWindows(rows);
  if (errors.length) return errors;
  await db.transaction('rw', db.tapWindows, db.outbox, async () => {
    // Same (class, session, kind, day) means the same window: drop any other copy so only one is in effect.
    const same = (await db.tapWindows.where('classId').equals(classId).toArray()).filter(w => w.effectiveFrom === today);
    await db.tapWindows.bulkDelete(same.map(w => w.id));
    await db.tapWindows.bulkPut(rows);
    for (const r of rows)
      await queue(db, { kind: 'upsert', table: 'tap_windows', onConflict: 'class_id,session,kind,effective_from', row: {
        class_id: classId, session: r.session, kind: r.kind, opens: r.opens, late_after: r.lateAfter, closes: r.closes, effective_from: today } });
  });
  return [];
}

export async function setIgnoreRepeat(db: KlasilidDb, classId: string, minutes: 1 | 3 | 5 | 10): Promise<void> {
  await db.transaction('rw', db.classes, db.outbox, async () => {
    await db.classes.update(classId, { ignoreRepeatMinutes: minutes });
    await queue(db, { kind: 'update', table: 'classes', match: { id: classId }, values: { ignore_repeat_minutes: minutes } });
  });
}

export async function setReviewOutside(db: KlasilidDb, classId: string, review: boolean): Promise<void> {
  await db.transaction('rw', db.classes, db.outbox, async () => {
    await db.classes.update(classId, { reviewOutside: review });
    await queue(db, { kind: 'update', table: 'classes', match: { id: classId }, values: { review_outside: review } });
  });
}

export async function setLanguage(db: KlasilidDb, userId: string, language: 'en' | 'fil'): Promise<void> {
  await db.prefs.put({ key: 'language', value: language });
  await queue(db, { kind: 'update', table: 'profiles', match: { id: userId }, values: { language } });
}

export type Theme = 'light' | 'dark' | 'auto';
/** The mockup's setTheme: 'auto' follows the device; the choice is remembered on this device. */
export function applyTheme(t: Theme): void {
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = t === 'auto' ? (dark ? 'dark' : 'light') : t;
  try { localStorage.setItem('kTheme', t); } catch { /* private mode: not remembered */ }
}
export function savedTheme(): Theme {
  try { return (localStorage.getItem('kTheme') as Theme) || 'light'; } catch { return 'light'; }
}

const csvCell = (v: string | number) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

/** The month grid as CSV: Learner, one column per day (grid letters), Absent, Late. */
export function attendanceCsv(days: ClassDay[]): string {
  const learners = new Map<string, string>();
  for (const d of days) for (const r of d.rows) learners.set(r.learner.id, `${r.learner.lastName}, ${r.learner.firstName}`);
  const lines = [['Learner', ...days.map(d => d.date), 'Absent', 'Late'].map(csvCell).join(',')];
  for (const [id, name] of learners) {
    const letters = days.map(d => { const r = d.rows.find(x => x.learner.id === id); return r ? dayLetter(r.am, r.pm) : ''; });
    lines.push([name, ...letters.map(l => (l === 'N' ? '' : l)), letters.filter(l => l === 'A').length, letters.filter(l => l === 'L').length].map(csvCell).join(','));
  }
  return lines.join('\r\n');
}
