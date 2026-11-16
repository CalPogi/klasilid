import { expect, it } from 'vitest';
import { normalCode } from '../apps/web/src/lib/signup';
import { sha256Hex } from '../supabase/functions/tap/handler';
import { makeSchoolCode } from './school-code.mjs';

const SCHOOL = '11111111-2222-4333-8444-555555555555';

it('makes an XXXX-XXXX code from letters and digits that are easy to read', () => {
  for (let i = 0; i < 50; i++) expect(makeSchoolCode(SCHOOL).code).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/);
  expect(makeSchoolCode(SCHOOL).code).not.toBe(makeSchoolCode(SCHOOL).code);
});

it('the SQL holds the hash the sign-up function looks up, never the plain code', async () => {
  const r = makeSchoolCode(SCHOOL, "St. Mary's School");
  expect(r.sql).toContain(await sha256Hex(normalCode(r.code)));
  expect(r.sql).toContain(await sha256Hex(normalCode(r.code.toLowerCase().replace('-', ' '))));
  expect(r.sql).not.toContain(r.code);
  expect(r.sql).not.toContain(r.code.replace('-', ''));
  expect(r.sql).toContain(`insert into schools (id, name) values ('${SCHOOL}', 'St. Mary''s School') on conflict (id) do nothing;`);
  expect(r.sql).toContain('on conflict (school_id) do update set code_hash = excluded.code_hash, created_at = now();');
});

it('without a name it only sets the code (the school already exists)', () => {
  expect(makeSchoolCode(SCHOOL).sql).not.toContain('insert into schools');
});

it('refuses a school id that is not a uuid', () => {
  expect(() => makeSchoolCode("x'); drop table schools; --")).toThrow('school id must be a uuid');
});
