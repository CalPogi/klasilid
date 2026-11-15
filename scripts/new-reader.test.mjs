import { expect, it } from 'vitest';
import { sha256Hex } from '../supabase/functions/tap/handler';
import { makeReader } from './new-reader.mjs';

const CLASS = '11111111-2222-4333-8444-555555555555';

it('makes a KD-#### id, a 43-char base64url key and an 8-digit token', async () => {
  const r = await makeReader(CLASS);
  expect(r.id).toMatch(/^KD-\d{4}$/);
  expect(r.key).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(r.token).toMatch(/^\d{8}$/);
  expect((await makeReader(CLASS, 'KD-0002')).id).toBe('KD-0002');
  expect((await makeReader(CLASS)).key).not.toBe(r.key);
});

it('the SQL holds sha256 hashes and never the plain key or token', async () => {
  const r = await makeReader(CLASS, 'KD-0002');
  expect(r.sql).toBe(
    `insert into devices(id, class_id, key_hash, pairing_token_hash) values ('KD-0002', '${CLASS}', '${await sha256Hex(r.key)}', '${await sha256Hex(r.token)}');`,
  );
  expect(r.sql).not.toContain(r.key);
  expect(r.sql).not.toContain(r.token);
});

it('the key hash matches sha256Hex(key) so the tap endpoint accepts it', async () => {
  const r = await makeReader(CLASS);
  expect(r.sql).toContain(await sha256Hex(r.key));
});

it('refuses a class id that is not a uuid or a bad reader id (no SQL injection)', async () => {
  await expect(makeReader("x'); drop table devices; --")).rejects.toThrow('class id must be a uuid');
  await expect(makeReader(CLASS, "KD-1'")).rejects.toThrow('reader id looks like KD-0001');
});
