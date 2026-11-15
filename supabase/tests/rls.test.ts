import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, freshDb, one } from './db';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const T = id(1), T2 = id(2), PA = id(3), PB = id(4), SA = id(5), O = id(6);
let db: PGlite;
let C: string, C2: string, A: string, B: string, SY: string;

const rows = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows;
const learnerNames = async () => (await rows(`select first_name from learners order by first_name`)).map(r => r.first_name);

beforeEach(async () => {
  db = await freshDb();
  for (const [u, role] of [[T, 'teacher'], [T2, 'teacher'], [PA, 'parent'], [PB, 'parent'], [SA, 'student'], [O, 'owner']]) {
    await db.query(`insert into auth.users(id) values ($1)`, [u]);
    await db.query(`insert into profiles(id, role, display_name) values ($1, $2, $2)`, [u, role]);
  }
  const school = await one(db, `insert into schools(name) values ('Test School') returning id`);
  const sy = (await one(db, `insert into school_years(school_id, label, starts_on, ends_on) values ($1, 'SY 2026–2027', '2026-06-01', '2027-04-30') returning id`, [school.id])).id;
  C = (await one(db, `insert into classes(school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, 'Advisory', 6, 'Diamond', true) returning id`, [sy, T])).id as string;
  C2 = (await one(db, `insert into classes(school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, 'Advisory', 6, 'Ruby', true) returning id`, [sy, T2])).id as string;
  A = (await one(db, `insert into learners(last_name, first_name, sex, user_id) values ('Reyes', 'Ana', 'F', $1) returning id`, [SA])).id as string;
  B = (await one(db, `insert into learners(last_name, first_name, sex) values ('Cruz', 'Ben', 'M') returning id`)).id as string;
  await db.query(`insert into enrollments(class_id, learner_id) values ($1, $2), ($1, $3)`, [C, A, B]);
  await db.query(`insert into guardians(user_id, learner_id, consent_at, consent_version) values ($1, $2, now(), 'v1')`, [PA, A]);
  await db.query(`insert into guardians(user_id, learner_id) values ($1, $2)`, [PB, B]);
  await db.query(`insert into cards(uid, learner_id) values ('0A0A0A0A', $1), ('0B0B0B0B', $2)`, [A, B]);
  await db.query(`insert into devices(id, class_id, key_hash, pairing_token_hash) values ('KD-0001', $1, 'secret-hash', 'pair-hash')`, [C]);
  await db.query(`insert into taps(id, device_id, card_uid, tapped_at) values ('KD-0001-1', 'KD-0001', '0A0A0A0A', now()), ('KD-0001-2', 'KD-0001', '0B0B0B0B', now())`);
  await db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, created_by) values ($1, $3, '2026-11-13', 'am', 'absent', 'sick', $4), ($2, $3, '2026-11-13', 'am', 'absent', 'sick', $4)`, [A, B, C, T]);
  await db.query(`insert into tap_windows(class_id, session, kind, opens, late_after, closes, effective_from) values ($1, 'am', 'in', 390, 435, 480, '2026-06-01')`, [C]);
  await db.query(`insert into calendar_days(school_year_id, date, type, name) values ($1, '2026-11-30', 'holiday', 'Bonifacio Day')`, [sy]);
  await db.query(`update school_years set admin_id = $1`, [T]);
  SY = sy as string;
});

describe('teacher', () => {
  it('sees both learners and all taps of her class', async () => {
    await as(db, T, async () => {
      expect(await learnerNames()).toEqual(['Ana', 'Ben']);
      expect((await rows(`select id from taps`)).length).toBe(2);
      expect((await rows(`select id from attendance_corrections`)).length).toBe(2);
    });
  });
  it('another teacher sees nothing of this class', async () => {
    await as(db, T2, async () => {
      expect(await learnerNames()).toEqual([]);
      expect(await rows(`select id from taps`)).toEqual([]);
      expect(await rows(`select id from tap_windows`)).toEqual([]);
    });
  });
  it('can record a correction for her class', async () => {
    await as(db, T, async () => {
      await db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, created_by) values ($1, $2, '2026-11-13', 'pm', 'excused', 'sick', $3)`, [A, C, T]);
    });
  });
  it('cannot update or delete a correction', async () => {
    await as(db, T, async () => {
      await expect(db.query(`update attendance_corrections set status = 'on_time'`)).rejects.toThrow();
    });
    await as(db, T, async () => {
      await expect(db.query(`delete from attendance_corrections`)).rejects.toThrow();
    });
  });
  it('device key hashes are not readable by the teacher', async () => {
    await as(db, T, async () => {
      await expect(db.query(`select key_hash from devices`)).rejects.toThrow(/permission denied/);
    });
    await as(db, T, async () => {
      expect(await rows(`select id from devices`)).toEqual([{ id: 'KD-0001' }]);
    });
  });
  it('cannot insert taps directly', async () => {
    await as(db, T, async () => {
      await expect(db.query(`insert into taps(id, device_id, card_uid, tapped_at) values ('KD-0001-9', 'KD-0001', '0A0A0A0A', now())`)).rejects.toThrow();
    });
  });
});

describe('review fixes', () => {
  it("a teacher cannot enroll another teacher's learner", async () => {
    await as(db, T2, async () => {
      await expect(db.query(`insert into enrollments(class_id, learner_id) values ($1, $2)`, [C2, A])).rejects.toThrow();
    });
  });
  it("a teacher cannot change a learner's account link", async () => {
    await as(db, T, async () => {
      await expect(db.query(`update learners set user_id = null where id = $1`, [A])).rejects.toThrow(/permission denied/);
    });
  });
  it('helper functions are not in the API schema and not callable by anon', async () => {
    await as(db, null, async () => {
      await expect(db.query(`select public.learner_of_card('0A0A0A0A')`)).rejects.toThrow();
    });
    await as(db, null, async () => {
      await expect(db.query(`select private.is_family($1)`, [A])).rejects.toThrow(/permission denied/);
    });
  });
  it('a card cannot be reassigned or deleted, only deactivated', async () => {
    await as(db, T, async () => {
      await expect(db.query(`update cards set learner_id = $1 where uid = '0A0A0A0A'`, [B])).rejects.toThrow(/permission denied/);
    });
    await as(db, T, async () => {
      await expect(db.query(`delete from cards where uid = '0A0A0A0A'`)).rejects.toThrow(/permission denied/);
    });
    await as(db, T, async () => {
      await db.query(`update cards set active = false, replaced_at = now() where uid = '0A0A0A0A'`);
    });
  });
  it('past tap windows cannot be added, changed or removed', async () => {
    await as(db, T, async () => {
      await expect(db.query(`insert into tap_windows(class_id, session, kind, opens, late_after, closes, effective_from) values ($1, 'am', 'in', 400, 440, 480, '2026-01-01')`, [C])).rejects.toThrow();
    });
    await as(db, T, async () => {
      await db.query(`update tap_windows set opens = 300`);
      await db.query(`delete from tap_windows`);
      expect(await rows(`select opens from tap_windows`)).toEqual([{ opens: 390 }]);
    });
    await as(db, T, async () => {
      await db.query(`insert into tap_windows(class_id, session, kind, opens, late_after, closes, effective_from) values ($1, 'am', 'in', 400, 440, 480, '2099-01-01')`, [C]);
    });
  });
  it('only the school year admin edits the calendar', async () => {
    await as(db, T2, async () => {
      await expect(db.query(`insert into calendar_days(school_year_id, date, type, name) values ($1, '2026-12-01', 'suspension', 'Typhoon')`, [SY])).rejects.toThrow();
    });
    await as(db, T, async () => {
      await db.query(`insert into calendar_days(school_year_id, date, type, name) values ($1, '2026-12-01', 'suspension', 'Typhoon')`, [SY]);
    });
  });
});

describe('parent', () => {
  it('consented parent sees only their own child', async () => {
    await as(db, PA, async () => {
      expect(await learnerNames()).toEqual(['Ana']);
      expect((await rows(`select card_uid from taps`)).map(r => r.card_uid)).toEqual(['0A0A0A0A']);
      expect((await rows(`select learner_id from attendance_corrections`)).map(r => r.learner_id)).toEqual([A]);
      expect((await rows(`select id from tap_windows`)).length).toBe(1);
      expect((await rows(`select name from calendar_days`)).map(r => r.name)).toEqual(['Bonifacio Day']);
    });
  });
  it('unconsented parent sees nothing', async () => {
    await as(db, PB, async () => {
      expect(await learnerNames()).toEqual([]);
      expect(await rows(`select id from taps`)).toEqual([]);
      expect(await rows(`select id from attendance_corrections`)).toEqual([]);
      expect(await rows(`select id from tap_windows`)).toEqual([]);
    });
  });
  it('can give consent on their own link', async () => {
    await as(db, PB, async () => {
      await db.query(`update guardians set consent_at = now(), consent_version = 'v1' where user_id = $1`, [PB]);
      expect(await learnerNames()).toEqual(['Ben']);
    });
  });
  it('cannot insert a correction', async () => {
    await as(db, PA, async () => {
      await expect(db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, created_by) values ($1, $2, '2026-11-13', 'pm', 'on_time', 'sick', $3)`, [A, C, PA])).rejects.toThrow();
    });
  });
  it('cannot read seat assignments or login codes', async () => {
    await as(db, PA, async () => {
      expect(await rows(`select id from seats`)).toEqual([]);
    });
    await as(db, PA, async () => {
      await expect(db.query(`select * from login_codes`)).rejects.toThrow(/permission denied/);
    });
  });
});

describe('student', () => {
  it('sees nothing until a parent consents, then only self', async () => {
    await db.query(`update guardians set consent_at = null where user_id = $1`, [PA]);
    await as(db, SA, async () => {
      expect(await learnerNames()).toEqual([]);
      expect(await rows(`select id from taps`)).toEqual([]);
    });
    await db.query(`update guardians set consent_at = now() where user_id = $1`, [PA]);
    await as(db, SA, async () => {
      expect(await learnerNames()).toEqual(['Ana']);
      expect((await rows(`select card_uid from taps`)).map(r => r.card_uid)).toEqual(['0A0A0A0A']);
    });
  });
});

describe('owner and anon', () => {
  it('owner sees no learners, taps or corrections', async () => {
    await as(db, O, async () => {
      expect(await learnerNames()).toEqual([]);
      expect(await rows(`select id from taps`)).toEqual([]);
      expect(await rows(`select id from attendance_corrections`)).toEqual([]);
      expect(await rows(`select id from enrollments`)).toEqual([]);
    });
  });
  it('anon sees nothing (every table is refused)', async () => {
    for (const table of ['learners', 'taps', 'classes', 'attendance_corrections', 'schools']) {
      await as(db, null, async () => {
        await expect(db.query(`select * from ${table}`)).rejects.toThrow(/permission denied/);
      });
    }
  });
});
