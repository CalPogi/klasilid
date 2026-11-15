import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { as, freshDb, one } from './db';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const T = id(1), T2 = id(2), P = id(3);
const SCHOOL = id(100), YEAR = id(101), CLASS = id(102), CLASS2 = id(103), YEAR2 = id(104), SCHOOL2 = id(105);
const L1 = id(200);
let db: PGlite;

const setup = (school = SCHOOL, year = YEAR, cls = CLASS) =>
  db.query(`select setup_class($1, 'Test School', $2, 'SY 2026–2027', '2026-06-01', '2027-04-30', $3, 6, 'Diamond') as id`, [school, year, cls]);
const addLearner = (cls = CLASS, learner = L1) =>
  db.query(`select add_learner($1, $2, 'Abad', 'Ana', null, 'F', '2026-06-01') as id`, [learner, cls]);
const count = async (table: string) => (await one(db, `select count(*)::int as n from ${table}`)).n;

beforeEach(async () => {
  db = await freshDb();
  for (const [u, role] of [[T, 'teacher'], [T2, 'teacher'], [P, 'parent']]) {
    await db.query(`insert into auth.users(id) values ($1)`, [u]);
    await db.query(`insert into profiles(id, role, display_name) values ($1, $2, $2)`, [u, role]);
  }
});

describe('setup_class', () => {
  it('creates school, year (admin = caller) and advisory class', async () => {
    await as(db, T, async () => {
      expect((await setup()).rows[0]).toEqual({ id: CLASS });
      expect(await one(db, `select admin_id from school_years where id = $1`, [YEAR])).toEqual({ admin_id: T });
      expect(await one(db, `select teacher_id, subject, grade, section, is_advisory from classes where id = $1`, [CLASS]))
        .toEqual({ teacher_id: T, subject: 'Advisory', grade: 6, section: 'Diamond', is_advisory: true });
    });
  });

  it('twice with the same ids creates nothing new', async () => {
    await as(db, T, async () => {
      await setup();
      await setup();
      expect([await count('schools'), await count('school_years'), await count('classes')]).toEqual([1, 1, 1]);
    });
  });

  it('by a parent raises "teachers only"', async () => {
    await as(db, P, async () => {
      await expect(setup()).rejects.toThrow(/teachers only/);
    });
  });
});

describe('add_learner', () => {
  beforeEach(async () => {
    // Committed state for these tests, created as superuser (`as` rolls back).
    await db.query(`insert into schools(id, name) values ($1, 'Test School')`, [SCHOOL]);
    await db.query(`insert into school_years(id, school_id, label, starts_on, ends_on, admin_id) values ($1, $2, 'SY', '2026-06-01', '2027-04-30', $3)`, [YEAR, SCHOOL, T]);
    await db.query(`insert into classes(id, school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, $3, 'Advisory', 6, 'Diamond', true)`, [CLASS, YEAR, T]);
    await db.query(`insert into schools(id, name) values ($1, 'Other School')`, [SCHOOL2]);
    await db.query(`insert into school_years(id, school_id, label, starts_on, ends_on, admin_id) values ($1, $2, 'SY', '2026-06-01', '2027-04-30', $3)`, [YEAR2, SCHOOL2, T2]);
    await db.query(`insert into classes(id, school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, $3, 'Advisory', 6, 'Ruby', true)`, [CLASS2, YEAR2, T2]);
  });

  it('adds learner + enrollment visible to the teacher', async () => {
    await as(db, T, async () => {
      expect((await addLearner()).rows[0]).toEqual({ id: L1 });
      expect((await db.query(`select first_name from learners`)).rows).toEqual([{ first_name: 'Ana' }]);
    });
  });

  it("into another teacher's class raises \"not your class\"", async () => {
    await as(db, T2, async () => {
      await expect(addLearner(CLASS)).rejects.toThrow(/not your class/);
    });
  });

  it("a learner already enrolled with another teacher raises", async () => {
    await db.query(`insert into learners(id, last_name, first_name, sex) values ($1, 'Abad', 'Ana', 'F')`, [L1]);
    await db.query(`insert into enrollments(class_id, learner_id) values ($1, $2)`, [CLASS2, L1]);
    await as(db, T, async () => {
      await expect(addLearner()).rejects.toThrow(/learner belongs to another teacher/);
    });
  });

  it('is idempotent', async () => {
    await db.exec(`set request.jwt.claim.sub = '${T}'`);
    await db.exec(`set role authenticated`);
    await addLearner();
    await addLearner();
    await db.exec(`reset role`);
    expect([await count('learners'), await count('enrollments')]).toEqual([1, 1]);
  });
});

it('anon cannot call either function', async () => {
  await as(db, null, async () => {
    await expect(setup()).rejects.toThrow(/permission denied/);
  });
  await as(db, null, async () => {
    await expect(addLearner()).rejects.toThrow(/permission denied/);
  });
});
