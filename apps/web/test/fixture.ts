import { hm } from '@klasilid/core';
import { openDb, type KlasilidDb, type LTapWindow } from '../src/lib/db';

export const DATE = '2026-11-13'; // a Friday
/** Manila wall-clock time → ISO UTC. */
export const at = (hms: string, date = DATE) => {
  const [h, m, s = 0] = hms.split(':').map(Number);
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m, s) - 8 * 3600_000).toISOString();
};
const win = (id: string, session: 'am' | 'pm', kind: 'in' | 'out', o: string, l: string | null, c: string): LTapWindow =>
  ({ id, classId: 'c1', session, kind, opens: hm(o), lateAfter: l ? hm(l) : null, closes: hm(c), effectiveFrom: '2026-06-01' });

/** Class c1 with Ana (on time 07:00), Ben (late 07:20) and Carla (no tap). */
export async function classDb(): Promise<KlasilidDb> {
  const db = openDb('t-' + crypto.randomUUID());
  await db.classes.put({ id: 'c1', schoolYearId: 'sy', subject: 'Advisory', grade: 6, section: 'Diamond', isAdvisory: true, ignoreRepeatMinutes: 3 });
  await db.learners.bulkPut([
    { id: 'a', firstName: 'Ana', lastName: 'Abad', sex: 'F' },
    { id: 'b', firstName: 'Ben', lastName: 'Bautista', sex: 'M' },
    { id: 'c', firstName: 'Carla', lastName: 'Castro', sex: 'F' },
  ]);
  await db.enrollments.bulkPut(['a', 'b', 'c'].map((l, i) => ({ id: 'e' + i, classId: 'c1', learnerId: l, joinedOn: '2026-06-01' })));
  await db.cards.bulkPut([{ uid: 'AAAAAAAA', learnerId: 'a', active: true }, { uid: 'BBBBBBBB', learnerId: 'b', active: true },
    { uid: 'CCCCCCCC', learnerId: 'c', active: true }]);
  await db.tapWindows.bulkPut([win('w1', 'am', 'in', '06:30', '07:15', '08:00'), win('w2', 'am', 'out', '11:30', null, '12:15'),
    win('w3', 'pm', 'in', '12:30', '13:00', '13:30'), win('w4', 'pm', 'out', '16:00', null, '17:00')]);
  await db.taps.bulkPut([
    { id: 't1', deviceId: 'd', cardUid: 'AAAAAAAA', at: at('07:00'), clockSuspect: false },
    { id: 't2', deviceId: 'd', cardUid: 'BBBBBBBB', at: at('07:20'), clockSuspect: false },
  ]);
  return db;
}
