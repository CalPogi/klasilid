#!/usr/bin/env node
// Makes a school's sign-up code: node scripts/school-code.mjs <school-uuid> [--name "School name"]
// Prints the SQL (hash only) for the Supabase SQL editor and the plain code to give the school's advisers.
// Running it again for the same school replaces the code; the old one stops working.
import { createHash, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
const sha = s => createHash('sha256').update(s).digest('hex');
const q = s => `'${s.replace(/'/g, "''")}'`;

export function makeSchoolCode(schoolId, name) {
  if (!UUID.test(schoolId)) throw new Error('school id must be a uuid');
  const raw = Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  const sql = [
    ...(name ? [`insert into schools (id, name) values (${q(schoolId)}, ${q(name)}) on conflict (id) do nothing;`] : []),
    `insert into school_signup_codes (school_id, code_hash) values (${q(schoolId)}, ${q(sha(raw))})`
      + ' on conflict (school_id) do update set code_hash = excluded.code_hash, created_at = now();',
  ].join('\n');
  return { code, sql };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [schoolId, flag, name] = process.argv.slice(2);
  try {
    const r = makeSchoolCode(schoolId ?? '', flag === '--name' ? name : undefined);
    console.log(`Run this in the Supabase SQL editor:\n\n${r.sql}\n`);
    console.log(`Give this code to the school's advisers (it is not stored anywhere else):\n\n  ${r.code}`);
  } catch (e) {
    console.error(`${e.message}\nUsage: node scripts/school-code.mjs <school-uuid> [--name "School name"]`);
    process.exit(1);
  }
}
