import { hm, manilaDate, type IsoDate } from '@klasilid/core';
import type { KlasilidDb, LCard, LEnrollment, LLearner, LTap, LTapWindow } from './db';

// Invented names only (spec §11). Never put a real learner's name here.
export const FIRST = ['Ana', 'Ben', 'Carla', 'Dino', 'Ella', 'Franco', 'Gia', 'Hugo', 'Ivy', 'Jomar', 'Kaye', 'Leo', 'Mika',
  'Nico', 'Olive', 'Paolo', 'Queenie', 'Rico', 'Sofia', 'Tomas'] as const;
export const LAST = ['Abad', 'Bautista', 'Castro', 'Domingo', 'Espino', 'Flores', 'Galang', 'Herrera', 'Ilagan', 'Javier',
  'Lazaro', 'Macaraeg', 'Navarro', 'Ocampo', 'Pascual', 'Quiambao', 'Robles', 'Salazar', 'Tolentino'] as const;

export const DEMO_CLASS_ID = 'demo-class';
export const DEMO_TEACHER_ID = 'demo-teacher';
const COUNT = 38;

/** Manila wall-clock time on a Manila date → ISO UTC. */
const manilaIso = (date: IsoDate, minutes: number, seconds = 0): string => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes, seconds) - 8 * 3600_000).toISOString();
};

/** The last `n` weekdays up to and including `today`, oldest first. */
const schoolDays = (today: IsoDate, n: number): IsoDate[] => {
  const out: IsoDate[] = [];
  const d = new Date(today + 'T00:00:00Z');
  while (out.length < n) {
    const wd = d.getUTCDay();
    if (wd !== 0 && wd !== 6) out.unshift(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
};

/** One advisory class with 38 invented learners, cards, tap windows and taps for the last 10 school days (spec §11: fake data). */
export async function seedDemo(db: KlasilidDb, now: Date): Promise<void> {
  const learners: LLearner[] = [];
  const cards: LCard[] = [];
  const enrollments: LEnrollment[] = [];
  for (let i = 0; i < COUNT; i++) {
    const id = `demo-l-${String(i + 1).padStart(2, '0')}`;
    learners.push({ id, firstName: FIRST[(i * 7) % FIRST.length], lastName: LAST[(i * 5 + i / 3) % LAST.length | 0], sex: i % 2 ? 'M' : 'F' });
    cards.push({ uid: 'DE' + (i + 1).toString(16).toUpperCase().padStart(6, '0'), learnerId: id, active: true });
    enrollments.push({ id: `demo-e-${i + 1}`, classId: DEMO_CLASS_ID, learnerId: id, joinedOn: '2026-06-01' });
  }
  const w = (id: string, session: 'am' | 'pm', kind: 'in' | 'out', opens: string, lateAfter: string | null, closes: string): LTapWindow =>
    ({ id, classId: DEMO_CLASS_ID, session, kind, opens: hm(opens), lateAfter: lateAfter ? hm(lateAfter) : null, closes: hm(closes), effectiveFrom: '2026-06-01' });
  const windows = [
    w('demo-w-1', 'am', 'in', '06:30', '07:15', '08:00'),
    w('demo-w-2', 'am', 'out', '11:30', null, '12:15'),
    w('demo-w-3', 'pm', 'in', '12:30', '13:00', '13:30'),
    w('demo-w-4', 'pm', 'out', '16:00', null, '17:00'),
  ];

  // A believable mix: mostly on time, a few late, a few absent, one after-closing arrival per day.
  const taps: LTap[] = [];
  const days = schoolDays(manilaDate(now.toISOString()), 10);
  days.forEach((date, di) => {
    cards.forEach((card, i) => {
      if ((i * 3 + di) % 19 === 4) return; // absent all day
      const late = (i + di * 2) % 11 === 3;
      const afterClosing = (i + di) % 37 === 7;
      const amIn = afterClosing ? hm('08:20') : late ? hm('07:16') + (i % 12) : hm('06:40') + ((i * 7 + di) % 34);
      const plan = [amIn, hm('11:35') + (i % 20), hm('12:35') + ((i + di) % 20), hm('16:05') + (i % 30)];
      plan.forEach((m, k) => {
        const at = manilaIso(date, m, (i * 13 + k) % 60);
        if (Date.parse(at) <= now.getTime()) taps.push({ id: `demo-t-${date}-${i}-${k}`, deviceId: 'demo-reader', cardUid: card.uid, at, clockSuspect: false });
      });
    });
  });

  await db.transaction('rw', [db.classes, db.learners, db.cards, db.enrollments, db.tapWindows, db.taps, db.meta], async () => {
    await db.classes.put({ id: DEMO_CLASS_ID, schoolYearId: 'demo-sy', subject: 'Advisory', grade: 6, section: 'Diamond', isAdvisory: true, ignoreRepeatMinutes: 3 });
    await db.learners.bulkPut(learners);
    await db.cards.bulkPut(cards);
    await db.enrollments.bulkPut(enrollments);
    await db.tapWindows.bulkPut(windows);
    await db.taps.bulkPut(taps);
    await db.meta.put({ key: 'demoSeeded', value: true });
  });
}
