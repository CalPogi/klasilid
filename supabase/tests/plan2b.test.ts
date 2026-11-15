import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, freshDb, one } from './db';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const T = id(1), T2 = id(2), P = id(3);
const SY = id(100), C = id(101), C2 = id(102), L = id(200), L2 = id(201);
let db: PGlite;

beforeEach(async () => {
  db = await freshDb();
  for (const [u, role] of [[T, 'teacher'], [T2, 'teacher'], [P, 'parent']]) {
    await db.query(`insert into auth.users(id) values ($1)`, [u]);
    await db.query(`insert into profiles(id, role, display_name) values ($1, $2, $2)`, [u, role]);
  }
  const school = await one(db, `insert into schools(name) values ('Test School') returning id`);
  await db.query(`insert into school_years(id, school_id, label, starts_on, ends_on, admin_id) values ($1, $2, 'SY', '2026-06-01', '2027-04-30', $3)`, [SY, school.id, T]);
  await db.query(`insert into classes(id, school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, $3, 'Advisory', 6, 'Diamond', true), ($4, $2, $5, 'Advisory', 6, 'Ruby', true)`, [C, SY, T, C2, T2]);
  await db.query(`insert into learners(id, last_name, first_name, sex) values ($1, 'Abad', 'Ana', 'F')`, [L]);
  await db.query(`insert into enrollments(class_id, learner_id) values ($1, $2)`, [C, L]);
  await db.query(`insert into guardians(user_id, learner_id, consent_at) values ($1, $2, now())`, [P, L]);
});

describe('plan 2b schema', () => {
  it('a teacher can save guardian name and phone on her learner; a parent cannot', async () => {
    await as(db, T, async () => {
      await db.query(`update learners set guardian_name = 'Rosa Abad', guardian_phone = '09171234567' where id = $1`, [L]);
      expect(await one(db, `select guardian_name, guardian_phone from learners where id = $1`, [L])).toEqual({ guardian_name: 'Rosa Abad', guardian_phone: '09171234567' });
    });
    await as(db, P, async () => {
      await db.query(`update learners set guardian_phone = '0000' where id = $1`, [L]);
    });
    expect(await one(db, `select guardian_phone from learners where id = $1`, [L])).toEqual({ guardian_phone: null });
  });

  it('add_learner v2 stores LRN and guardian fields and is still idempotent', async () => {
    await as(db, T, async () => {
      const call = () => db.query(`select add_learner($1, $2, 'Bautista', 'Ben', null, 'M', '2026-11-03', '123456789012', 'Lito Bautista', '09181234567')`, [L2, C]);
      await call();
      await call();
      expect(await one(db, `select lrn, guardian_name, guardian_phone from learners where id = $1`, [L2])).toEqual({ lrn: '123456789012', guardian_name: 'Lito Bautista', guardian_phone: '09181234567' });
      expect(await one(db, `select count(*)::int as n from enrollments where learner_id = $1`, [L2])).toEqual({ n: 1 });
    });
  });

  it('seat_plans get created_at by default', async () => {
    const r = await one(db, `insert into seat_plans(class_id, rows, cols, effective_from) values ($1, 8, 5, '2026-11-13') returning created_at`, [C]);
    expect(r.created_at).toBeTruthy();
  });

  it('classes have review_outside, true by default', async () => {
    expect(await one(db, `select review_outside from classes where id = $1`, [C])).toEqual({ review_outside: true });
  });
});

describe('excuse letters', () => {
  const put = (path: string) => db.query(`insert into storage.objects(bucket_id, name) values ('excuse-letters', $1)`, [path]);

  it("the teacher can upload and read letters in her class folder; another teacher and parents can't read them", async () => {
    await as(db, T, async () => {
      await put(`${C}/c1.jpg`);
      expect((await db.query(`select name from storage.objects`)).rows).toEqual([{ name: `${C}/c1.jpg` }]);
    });
    await put(`${C}/c1.jpg`); // committed copy for the other readers
    await as(db, T2, async () => { expect((await db.query(`select name from storage.objects`)).rows).toEqual([]); });
    await as(db, P, async () => { expect((await db.query(`select name from storage.objects`)).rows).toEqual([]); });
  });

  it("a teacher can't upload into another class's folder", async () => {
    await as(db, T, async () => {
      await expect(put(`${C2}/x.jpg`)).rejects.toThrow();
    });
  });

  it('nobody can update or delete an excuse letter', async () => {
    await put(`${C}/c1.jpg`);
    await as(db, T, async () => {
      await db.query(`update storage.objects set name = $1`, [`${C}/renamed.jpg`]);
      await db.query(`delete from storage.objects`);
    });
    expect((await db.query(`select name from storage.objects`)).rows).toEqual([{ name: `${C}/c1.jpg` }]);
  });
});

it('a teacher can record where a learner transferred in from', async () => {
  await as(db, T, async () => {
    await db.query(`update enrollments set joined_from = 'Ilagan West CS' where learner_id = $1`, [L]);
    expect(await one(db, `select joined_from from enrollments where learner_id = $1`, [L])).toEqual({ joined_from: 'Ilagan West CS' });
  });
});

describe('register_card', () => {
  const reg = (uid: string, learner: string) => db.query(`select register_card($1, $2)`, [uid, learner]);
  it('registers a new card for her learner and is idempotent', async () => {
    await as(db, T, async () => {
      await reg('AB12CD34', L);
      await reg('AB12CD34', L);
      expect((await db.query(`select uid, learner_id, active from cards`)).rows).toEqual([{ uid: 'AB12CD34', learner_id: L, active: true }]);
    });
  });
  it("refuses a card that is already someone else's, even another teacher's learner", async () => {
    await db.query(`insert into learners(id, last_name, first_name, sex) values ($1, 'Cruz', 'Ben', 'M')`, [L2]);
    await db.query(`insert into enrollments(class_id, learner_id) values ($1, $2)`, [C2, L2]);
    await db.query(`insert into cards(uid, learner_id) values ('AB12CD34', $1)`, [L2]);
    await as(db, T, async () => {
      await expect(reg('AB12CD34', L)).rejects.toThrow(/card already registered/);
    });
  });
  it("refuses a learner who isn't hers", async () => {
    await as(db, T2, async () => {
      await expect(reg('AB12CD34', L)).rejects.toThrow(/not your learner/);
    });
  });
});

it('a select on storage does not fail because another bucket has non-uuid folder names', async () => {
  await db.query(`insert into storage.buckets(id, name) values ('other', 'other')`);
  await db.query(`insert into storage.objects(bucket_id, name) values ('other', 'not-a-uuid/x.png')`);
  await as(db, T, async () => {
    expect((await db.query(`select name from storage.objects`)).rows).toEqual([]);
  });
});
