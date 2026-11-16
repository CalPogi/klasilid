import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, expect, it } from 'vitest';
import { as, freshDb, one } from './db';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const T = id(1), T2 = id(2), SCHOOL = id(100), YEAR = id(101), CLASS = id(102), CLASS2 = id(103), YEAR2 = id(104);
let db: PGlite;

const setup = (cls: string, section = 'Sampaguita', year = YEAR) =>
  db.query(`select setup_class($1, 'Sample School', $2, 'SY 2026–2027', '2026-06-01', '2027-04-30', $3, 6, $4) as id`, [SCHOOL, year, cls, section]);

beforeEach(async () => {
  db = await freshDb();
  for (const u of [T, T2]) {
    await db.query(`insert into auth.users(id) values ($1)`, [u]);
    await db.query(`insert into profiles(id, role, display_name) values ($1, 'teacher', 'Teacher')`, [u]);
  }
  await db.query(`insert into schools(id, name) values ($1, 'Sample School')`, [SCHOOL]);
  await db.query(`insert into school_signup_codes(school_id, code_hash) values ($1, 'abc')`, [SCHOOL]);
  await db.query(`insert into signup_attempts(ip, ok) values ('1.2.3.4', false)`);
});

it('signed-in teachers and anonymous visitors cannot read the code or attempt tables', async () => {
  for (const who of [T, null]) {
    for (const table of ['school_signup_codes', 'signup_attempts']) {
      await as(db, who, async () => {
        await expect(db.query(`select * from ${table}`)).rejects.toThrow(/permission denied/);
      });
    }
  }
});

it('a second adviser for the same year, grade and section is refused and nothing of it is created', async () => {
  await as(db, T, async () => { await setup(CLASS); await db.exec('commit; begin'); });
  await as(db, T2, async () => {
    await expect(setup(CLASS2, 'sampaguita')).rejects.toThrow('Gr. 6 sampaguita already has an adviser');
  });
  expect(await one(db, `select count(*)::int as n from classes`)).toEqual({ n: 1 });
});

it('an adviser who signed up before the year existed joins the year another adviser made (same label)', async () => {
  await as(db, T, async () => { await setup(CLASS); await db.exec('commit; begin'); });
  await as(db, T2, async () => { await setup(CLASS2, 'Ilang-Ilang', YEAR2); await db.exec('commit; begin'); });
  expect(await one(db, `select school_year_id from classes where id = $1`, [CLASS2])).toEqual({ school_year_id: YEAR });
  expect(await one(db, `select count(*)::int as n from school_years`)).toEqual({ n: 1 });
});

it('the same section through a second year id is still refused', async () => {
  await as(db, T, async () => { await setup(CLASS); await db.exec('commit; begin'); });
  await as(db, T2, async () => {
    await expect(setup(CLASS2, 'Sampaguita', YEAR2)).rejects.toThrow('Gr. 6 Sampaguita already has an adviser');
  });
});

it('begin_signup_attempt counts failures from one address in the last 10 minutes, atomically, and prunes old rows', async () => {
  await db.query(`insert into signup_attempts(ip, ok, at) values ('9.9.9.9', false, now() - interval '2 days')`);
  const begin = async (ip: string) => (await one(db, `select * from begin_signup_attempt($1)`, [ip])) as { attempt_id: number; failures: number };
  const counts = [];
  for (let i = 0; i < 12; i++) counts.push((await begin('5.5.5.5')).failures);
  expect(counts).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  const a = await begin('6.6.6.6');
  expect(a.failures).toBe(0);
  await db.query(`update signup_attempts set ok = true where id = $1`, [a.attempt_id]);
  expect((await begin('6.6.6.6')).failures).toBe(0);
  expect(await one(db, `select count(*)::int as n from signup_attempts where ip = '9.9.9.9'`)).toEqual({ n: 0 });
  for (const who of [T, null]) {
    await as(db, who, async () => { await expect(db.query(`select * from begin_signup_attempt('1.1.1.1')`)).rejects.toThrow(/permission denied/); });
  }
});

it('a teacher reads her own school from her profile but cannot change it', async () => {
  await db.query(`update profiles set school_id = $1 where id = $2`, [SCHOOL, T]);
  await as(db, T, async () => {
    expect(await one(db, `select school_id from profiles where id = $1`, [T])).toEqual({ school_id: SCHOOL });
    await expect(db.query(`update profiles set school_id = null where id = $1`, [T])).rejects.toThrow(/permission denied/);
  });
});

it('another section in the same year is fine, and a replayed setup of the same class is still a no-op', async () => {
  await as(db, T, async () => {
    await setup(CLASS);
    await setup(CLASS);
    await db.exec('commit; begin');
  });
  await as(db, T2, async () => { await setup(CLASS2, 'Ilang-Ilang'); await db.exec('commit; begin'); });
  expect(await one(db, `select count(*)::int as n from classes`)).toEqual({ n: 2 });
});
