import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, expect, it } from 'vitest';
import { as, freshDb, one } from './db';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const T = id(1), T2 = id(2), SCHOOL = id(100), YEAR = id(101), CLASS = id(102), CLASS2 = id(103);
let db: PGlite;

const setup = (cls: string, section = 'Sampaguita') =>
  db.query(`select setup_class($1, 'Sample School', $2, 'SY 2026–2027', '2026-06-01', '2027-04-30', $3, 6, $4) as id`, [SCHOOL, YEAR, cls, section]);

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

it('another section in the same year is fine, and a replayed setup of the same class is still a no-op', async () => {
  await as(db, T, async () => {
    await setup(CLASS);
    await setup(CLASS);
    await db.exec('commit; begin');
  });
  await as(db, T2, async () => { await setup(CLASS2, 'Ilang-Ilang'); await db.exec('commit; begin'); });
  expect(await one(db, `select count(*)::int as n from classes`)).toEqual({ n: 2 });
});
