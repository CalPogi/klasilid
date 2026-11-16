#!/usr/bin/env node
// Makes a door reader's credentials: node scripts/new-reader.mjs <class-uuid> [--id KD-0002]
// Prints the SQL that registers the reader (hashes only) and the plain values to type into the reader's setup page.
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha = s => createHash('sha256').update(s).digest('hex');

export async function makeReader(classId, id) {
  if (!UUID.test(classId)) throw new Error('class id must be a uuid');
  const deviceId = id ?? `KD-${String(randomInt(10000)).padStart(4, '0')}`;
  if (!/^KD-\d{4}$/.test(deviceId)) throw new Error('reader id looks like KD-0001');
  const key = randomBytes(32).toString('base64url');
  const token = String(randomInt(100_000_000)).padStart(8, '0');
  const sql = `insert into devices(id, class_id, key_hash, pairing_token_hash) values ('${deviceId}', '${classId}', '${sha(key)}', '${sha(token)}');`;
  return { id: deviceId, key, token, sql };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [classId, flag, idArg] = process.argv.slice(2);
  try {
    const r = await makeReader(classId ?? '', flag === '--id' ? idArg : undefined);
    console.log(`Run this in the Supabase SQL editor:\n\n${r.sql}\n`);
    console.log(`Type these into the reader's setup page (keep them private; they are not stored anywhere else):\n`);
    console.log(`  Reader ID:    ${r.id}\n  Reader key:   ${r.key}\n  Pairing code: ${r.token}`);
  } catch (e) {
    console.error(`${e.message}\nUsage: node scripts/new-reader.mjs <class-uuid> [--id KD-0002]`);
    process.exit(1);
  }
}
