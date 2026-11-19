import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, expect, it } from 'vitest';
import { as, freshDb, one } from './db';

const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const O = id(1), T = id(2), T2 = id(3), PA = id(4), PB = id(5), SA = id(6);
let db: PGlite;
let SCHOOL: string, C: string, C2: string, A: string, B: string, PLAN: string;

const count = async (sql: string, params: unknown[] = []) => Number((await one(db, `select count(*)::int as n from ${sql}`, params)).n);
const json = async (sql: string, params: unknown[] = []) => (await one(db, sql, params)).r as any;

beforeEach(async () => {
  db = await freshDb();
  const users: [string, string, string][] = [
    [O, 'owner', 'owner'], [T, 'teacher', 'test-adviser'], [T2, 'teacher', 'msantos'],
    [PA, 'parent', 'parent.a'], [PB, 'parent', 'parent.b'], [SA, 'student', 'student.a'],
  ];
  SCHOOL = (await one(db, `insert into schools(name) values ('Sample School') returning id`)).id as string;
  for (const [u, role, name] of users) {
    await db.query(`insert into auth.users(id, email) values ($1, $2)`, [u, `${name}@login.klasilid.app`]);
    await db.query(`insert into profiles(id, role, display_name, school_id) values ($1, $2, $3, $4)`,
      [u, role, role === 'teacher' ? (u === T ? 'Test Adviser' : 'Maria Santos') : name, role === 'teacher' ? SCHOOL : null]);
  }
  await db.query(`insert into school_signup_codes(school_id, code_hash) values ($1, 'abc')`, [SCHOOL]);
  const sy = (await one(db, `insert into school_years(school_id, label, starts_on, ends_on, admin_id) values ($1, 'SY 2026-2027', '2026-06-01', '2027-04-30', $2) returning id`, [SCHOOL, T])).id;
  C = (await one(db, `insert into classes(school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, 'Advisory', 6, 'Test', true) returning id`, [sy, T])).id as string;
  C2 = (await one(db, `insert into classes(school_year_id, teacher_id, subject, grade, section, is_advisory) values ($1, $2, 'Advisory', 6, 'Diamond', true) returning id`, [sy, T2])).id as string;
  // A was only ever in C; B is in C and was once in C2.
  A = (await one(db, `insert into learners(last_name, first_name, sex, user_id) values ('Uno', 'Learner', 'F', $1) returning id`, [SA])).id as string;
  B = (await one(db, `insert into learners(last_name, first_name, sex) values ('Dos', 'Learner', 'M') returning id`)).id as string;
  await db.query(`insert into enrollments(class_id, learner_id) values ($1, $2), ($1, $3)`, [C, A, B]);
  await db.query(`insert into enrollments(class_id, learner_id, left_on) values ($1, $2, '2026-08-01')`, [C2, B]);
  await db.query(`insert into guardians(user_id, learner_id) values ($1, $2), ($3, $4)`, [PA, A, PB, B]);
  await db.query(`insert into login_codes(learner_id, for_role, username, code_hash) values ($1, 'parent', 'p-uno', 'h')`, [A]);
  await db.query(`insert into cards(uid, learner_id) values ('0A0A0A0A', $1), ('0B0B0B0B', $2)`, [A, B]);
  await db.query(`insert into devices(id, class_id, key_hash, pairing_token_hash) values ('KD-0001', $1, 'kh', 'th'), ('KD-0002', $2, 'kh2', 'th2')`, [C, C2]);
  await db.query(`insert into taps(id, device_id, card_uid, tapped_at) values ('KD-0001-1', 'KD-0001', '0A0A0A0A', now()), ('KD-0002-1', 'KD-0002', '0B0B0B0B', now())`);
  await db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, created_by) values ($1, $2, '2026-11-13', 'am', 'absent', 'sick', $3)`, [A, C, T]);
  await db.query(`insert into tap_windows(class_id, session, kind, opens, late_after, closes, effective_from) values ($1, 'am', 'in', 390, 435, 480, '2026-06-01')`, [C]);
  PLAN = (await one(db, `insert into seat_plans(class_id, rows, cols, effective_from) values ($1, 2, 2, '2026-06-01') returning id`, [C])).id as string;
  await db.query(`insert into seats(plan_id, row, col, learner_id) values ($1, 1, 1, $2), ($1, 1, 2, $3)`, [PLAN, A, B]);
});

it('admin functions refuse teachers and anonymous callers', async () => {
  const calls = [`select admin_overview()`, `select admin_retire_reader('KD-0001', '${O}')`, `select admin_delete_teacher('${T}', '${O}')`];
  for (const who of [T, null]) {
    for (const sql of calls) {
      await as(db, who, async () => { await expect(db.query(sql)).rejects.toThrow(/permission denied/); });
    }
  }
  await db.exec('begin; set local role service_role');
  await db.query(`select admin_overview()`);
  await db.exec('rollback');
});

it('overview lists schools, teachers with usernames and readers', async () => {
  const r = await json(`select admin_overview() as r`);
  expect(r.schools).toEqual([{ id: SCHOOL, name: 'Sample School', codeMadeAt: expect.any(String), advisers: 2 }]);
  const test = r.teachers.find((t: any) => t.id === T);
  expect(test).toMatchObject({ displayName: 'Test Adviser', username: 'test-adviser', schoolId: SCHOOL, schoolName: 'Sample School' });
  expect(test.classes).toEqual([{ id: C, grade: 6, section: 'Test', subject: 'Advisory' }]);
  expect(r.teachers.map((t: any) => t.id).sort()).toEqual([T, T2].sort());
  expect(r.readers[0]).toMatchObject({ id: 'KD-0001', classId: C, className: 'Gr. 6 Test', teacherName: 'Test Adviser', schoolName: 'Sample School', lastSeenAt: null, retiredAt: null });
  expect(JSON.stringify(r)).not.toMatch(/Learner|Uno|Dos|0A0A0A0A/);
});

it('retire replaces both hashes and keeps taps', async () => {
  expect((await one(db, `select admin_retire_reader('KD-0001', $1) as ok`, [O])).ok).toBe(true);
  const d = await one(db, `select key_hash, pairing_token_hash, retired_at from devices where id = 'KD-0001'`);
  expect(d.key_hash).not.toBe('kh');
  expect(d.pairing_token_hash).not.toBe('th');
  expect(d.key_hash).not.toBe(d.pairing_token_hash);
  expect(d.retired_at).not.toBeNull();
  expect(await count(`taps where device_id = 'KD-0001'`)).toBe(1);
  expect(await count(`audit_log where table_name = 'admin' and action = 'retire_reader' and row_id = 'KD-0001' and actor = $1`, [O])).toBe(1);
  expect((await one(db, `select admin_retire_reader('KD-0001', $1) as ok`, [O])).ok).toBe(false);
  expect((await one(db, `select admin_retire_reader('KD-9999', $1) as ok`, [O])).ok).toBe(false);
  const r = await json(`select admin_overview() as r`);
  expect(r.readers.at(-1)).toMatchObject({ id: 'KD-0001', retiredAt: expect.any(String) });
});

it('delete removes the teacher, her classes and everything under them in one go', async () => {
  const r = await json(`select admin_delete_teacher($1, $2) as r`, [T, O]);
  expect(r.classIds).toEqual([C]);
  expect(r.counts).toEqual({ classes: 1, learners: 1, taps: 1, corrections: 1 });
  for (const [table, where] of [
    ['classes', `teacher_id = '${T}'`], ['enrollments', `class_id = '${C}'`], ['taps', `device_id = 'KD-0001'`],
    ['attendance_corrections', `class_id = '${C}'`], ['seat_plans', `class_id = '${C}'`], ['seats', `plan_id = '${PLAN}'`],
    ['tap_windows', `class_id = '${C}'`], ['devices', `id = 'KD-0001'`], ['cards', `uid = '0A0A0A0A'`],
    ['learners', `id = '${A}'`], ['login_codes', `learner_id = '${A}'`], ['guardians', `user_id = '${PA}'`],
    ['profiles', `id in ('${T}', '${PA}', '${SA}')`], ['auth.users', `id in ('${T}', '${PA}', '${SA}')`],
  ]) expect(await count(`${table} where ${where}`), table).toBe(0);
  expect(await one(db, `select admin_id from school_years`)).toEqual({ admin_id: null });
  // The other teacher's class, reader and taps are untouched.
  expect(await count(`taps where device_id = 'KD-0002'`)).toBe(1);
  expect(await count(`classes where id = $1`, [C2])).toBe(1);
});

it('delete keeps a learner who was ever enrolled with another teacher', async () => {
  await db.query(`select admin_delete_teacher($1, $2)`, [T, O]);
  expect(await count(`learners where id = $1`, [B])).toBe(1);
  expect(await count(`cards where uid = '0B0B0B0B'`)).toBe(1);
  expect(await count(`guardians where learner_id = $1`, [B])).toBe(1);
  expect(await count(`profiles where id = $1`, [PB])).toBe(1);
  expect(await count(`enrollments where learner_id = $1`, [B])).toBe(1); // only the C2 one is left
});

it('delete leaves no audit rows for deleted rows and writes one summary row', async () => {
  expect(await count(`audit_log where table_name <> 'admin'`)).toBeGreaterThan(0);
  await db.query(`select admin_delete_teacher($1, $2)`, [T, O]);
  const left = (await db.query<{ old: unknown; new: unknown }>(`select old, new from audit_log where table_name <> 'admin'`)).rows;
  expect(JSON.stringify(left)).not.toContain(C);
  expect(JSON.stringify(left)).not.toContain(A);
  const s = await one(db, `select row_id, actor, new from audit_log where table_name = 'admin' and action = 'delete_teacher'`);
  expect(s).toMatchObject({ row_id: T, actor: O });
  expect(s.new).toEqual({ username: 'test-adviser', classes: 1, learners: 1, taps: 1, corrections: 1 });
});

it('delete is all or nothing', async () => {
  // A correction she made in another teacher's class keeps her profile referenced, so the delete must fail.
  await db.query(`insert into attendance_corrections(learner_id, class_id, date, session, status, reason, created_by) values ($1, $2, '2026-11-14', 'am', 'absent', 'sick', $3)`, [B, C2, T]);
  const before = await count(`taps`) + await count(`learners`) + await count(`classes`) + await count(`audit_log`);
  await expect(db.query(`select admin_delete_teacher($1, $2)`, [T, O])).rejects.toThrow();
  expect(await count(`taps`) + await count(`learners`) + await count(`classes`) + await count(`audit_log`)).toBe(before);
  expect(await count(`profiles where id = $1`, [T])).toBe(1);
});

it('taps stay append-only outside the delete', async () => {
  await db.query(`select admin_delete_teacher($1, $2)`, [T, O]);
  await db.exec('begin; set local role service_role');
  await expect(db.query(`delete from taps`)).rejects.toThrow(/append-only/);
  await db.exec('rollback');
});

it('an API role cannot turn the purge switch on for itself', async () => {
  await db.exec(`begin; set local role service_role; select set_config('klasilid.purge', 'on', true)`);
  await expect(db.query(`delete from taps`)).rejects.toThrow(/append-only/);
  await db.exec('rollback');
});

it('delete refuses an owner or a missing profile', async () => {
  await expect(db.query(`select admin_delete_teacher($1, $2)`, [O, O])).rejects.toThrow(/not a teacher/);
  await expect(db.query(`select admin_delete_teacher($1, $2)`, [id(99), O])).rejects.toThrow(/not a teacher/);
});
