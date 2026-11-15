import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, one } from './db';

const T = '00000000-0000-0000-0000-00000000000a';
let db: PGlite;
let classId: string;
let learnerId: string;

beforeEach(async () => {
  db = await freshDb();
  await db.query(`insert into auth.users(id) values ($1)`, [T]);
  await db.query(`insert into profiles(id, role, display_name) values ($1, 'teacher', 'Teacher')`, [T]);
  const school = await one(db, `insert into schools(name) values ('Test School') returning id`);
  const sy = await one(db, `insert into school_years(school_id, label, starts_on, ends_on) values ($1, 'SY 2026–2027', '2026-06-01', '2027-04-30') returning id`, [school.id]);
  classId = (await one(db, `insert into classes(school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, 'Advisory', 6, 'Diamond', true) returning id`, [sy.id, T])).id as string;
  learnerId = (await one(db, `insert into learners(last_name, first_name, sex) values ('Dela Cruz', 'Juan', 'M') returning id`)).id as string;
  await db.query(`insert into devices(id, class_id, key_hash, pairing_token_hash) values ('KD-0001', $1, 'x', 'y')`, [classId]);
});

const insertTap = (id = 'KD-0001-1') =>
  db.query(`insert into taps(id, device_id, card_uid, tapped_at) values ($1, 'KD-0001', '04A1B2C3', now()) on conflict (id) do nothing`, [id]);

describe('schema', () => {
  it('migrations apply cleanly', async () => {
    expect(await one(db, `select count(*)::int as n from classes`)).toEqual({ n: 1 });
  });

  it('taps are append-only', async () => {
    await insertTap();
    await expect(db.query(`update taps set card_uid = '04FFFFFF'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from taps`)).rejects.toThrow(/append-only/);
  });

  it('corrections are append-only', async () => {
    await db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, created_by) values ($1, $2, '2026-11-13', 'am', 'absent', 'sick', $3)`, [learnerId, classId, T]);
    await expect(db.query(`update attendance_corrections set status = 'on_time'`)).rejects.toThrow(/append-only/);
    await expect(db.query(`delete from attendance_corrections`)).rejects.toThrow(/append-only/);
  });

  it('corrections need text when reason is other', async () => {
    const q = (text: string) => db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, reason_text, created_by) values ($1, $2, '2026-11-13', 'am', 'absent', 'other', $3, $4)`, [learnerId, classId, text, T]);
    await expect(q('  ')).rejects.toThrow();
    await expect(q('Went home early')).resolves.toBeDefined();
  });

  it('card uid format is enforced', async () => {
    const q = (uid: string) => db.query(`insert into cards(uid, learner_id) values ($1, $2)`, [uid, learnerId]);
    await expect(q('04a1b2c3')).rejects.toThrow();
    await expect(q('04A1B2C3')).resolves.toBeDefined();
    await expect(q('04A1B2C3D4E5F6')).resolves.toBeDefined();
  });

  it('duplicate tap id is ignored with on conflict do nothing', async () => {
    await insertTap();
    await insertTap();
    expect(await one(db, `select count(*)::int as n from taps`)).toEqual({ n: 1 });
  });

  it('correction insert writes an audit_log row with the actor', async () => {
    await db.exec(`set request.jwt.claim.sub = '${T}'`);
    await db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, created_by) values ($1, $2, '2026-11-13', 'am', 'absent', 'sick', $3)`, [learnerId, classId, T]);
    expect(await one(db, `select table_name, action, actor from audit_log`)).toEqual({ table_name: 'attendance_corrections', action: 'INSERT', actor: T });
  });
});
