import { expect, it } from 'vitest';
import { makeReader } from '../../scripts/new-reader.mjs';
import { makeSchoolCode as scriptSchoolCode } from '../../scripts/school-code.mjs';
import { makeReaderSecrets, makeSchoolCode, randomReaderId } from '../functions/admin/secrets';
import { sha256Hex } from '../functions/tap/handler';

const CODE = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
const KEY = /^[A-Za-z0-9_-]{43}$/;

it("school code looks like the script's and its hash matches the script's scheme", async () => {
  for (let i = 0; i < 50; i++) {
    const { code, hash } = await makeSchoolCode();
    expect(code).toMatch(CODE);
    expect(hash).toBe(await sha256Hex(code.replace('-', '')));
  }
});

it('reader secrets look like new-reader.mjs output', async () => {
  for (let i = 0; i < 50; i++) {
    const s = await makeReaderSecrets();
    expect(s.key).toMatch(KEY);
    expect(s.pairingCode).toMatch(/^\d{8}$/);
    expect(s.keyHash).toBe(await sha256Hex(s.key));
    expect(s.tokenHash).toBe(await sha256Hex(s.pairingCode));
  }
});

it('reader ids look like KD-0001', () => {
  const ids = Array.from({ length: 200 }, randomReaderId);
  for (const id of ids) expect(id).toMatch(/^KD-\d{4}$/);
  expect(new Set(ids).size).toBeGreaterThan(150);
});

it('the function and the scripts agree', async () => {
  const r = await makeReader('00000000-0000-0000-0000-000000000001');
  expect(r.id).toMatch(/^KD-\d{4}$/);
  expect(r.key).toMatch(KEY);
  expect(r.token).toMatch(/^\d{8}$/);
  expect(r.sql).toContain(await sha256Hex(r.key));
  const s = scriptSchoolCode('00000000-0000-0000-0000-000000000001');
  expect(s.code).toMatch(CODE);
  expect(s.sql).toContain(await sha256Hex(s.code.replace('-', '')));
});
