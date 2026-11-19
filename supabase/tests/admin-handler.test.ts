import { describe, expect, it } from 'vitest';
import { callerOf, handleAdmin, type AdminDeps, type Caller } from '../functions/admin/handler';
import { sha256Hex } from '../functions/tap/handler';

const OWNER: Caller = { userId: 'owner-1', aal: 'aal2' };
const EMPTY = { schools: [], teachers: [], readers: [] };

function deps(over: Partial<AdminDeps> = {}) {
  const log: { fn: string; args: unknown[] }[] = [];
  const rec = <A extends unknown[], R>(fn: string, impl: (...a: A) => R) => (...a: A) => { log.push({ fn, args: a }); return impl(...a); };
  const d: AdminDeps = {
    roleOf: rec('roleOf', async (id: string) => (id === 'owner-1' ? 'owner' : 'teacher')),
    overview: rec('overview', async () => EMPTY),
    addSchool: rec('addSchool', async () => 'school-new'),
    schoolExists: rec('schoolExists', async (id: string) => id === 'school-1'),
    setSchoolCode: rec('setSchoolCode', async () => {}),
    classExists: rec('classExists', async (id: string) => id === 'class-1'),
    readerExists: rec('readerExists', async () => false),
    insertReader: rec('insertReader', async () => {}),
    setReaderSecrets: rec('setReaderSecrets', async (id: string) => id === 'KD-0001'),
    retireReader: rec('retireReader', async () => true),
    usernameOf: rec('usernameOf', async (id: string) => (id === 'teacher-1' ? 'test-adviser' : null)),
    deleteTeacher: rec('deleteTeacher', async () => ({ classIds: ['class-1'] })),
    removeClassPhotos: rec('removeClassPhotos', async () => []),
    audit: rec('audit', async () => {}),
    ...over,
  };
  return { d, log, called: (fn: string) => log.filter(l => l.fn === fn) };
}

const CHANGES = ['addSchool', 'setSchoolCode', 'insertReader', 'setReaderSecrets', 'retireReader', 'deleteTeacher', 'removeClassPhotos', 'audit'];

describe('who may call', () => {
  it('refuses a missing caller, an aal1 caller and a teacher', async () => {
    for (const [caller, status, message] of [
      [null, 401, 'Sign in first'],
      [{ userId: 'owner-1', aal: 'aal1' }, 403, 'Two-step sign-in needed'],
      [{ userId: 'teacher-1', aal: 'aal2' }, 403, 'Owner only'],
    ] as const) {
      const { d, log } = deps();
      const r = await handleAdmin(caller, { action: 'addSchool', name: 'X' }, d);
      expect(r).toEqual({ status, body: { message } });
      expect(log.filter(l => CHANGES.includes(l.fn))).toEqual([]);
    }
  });
});

describe('schools', () => {
  it('addSchool returns a code whose hash was stored', async () => {
    const { d, called } = deps();
    const r = await handleAdmin(OWNER, { action: 'addSchool', name: '  Sample School ' }, d);
    expect(r.status).toBe(200);
    const { schoolId, code } = r.body as { schoolId: string; code: string };
    expect(schoolId).toBe('school-new');
    expect(called('addSchool')[0].args).toEqual(['Sample School']);
    expect(called('setSchoolCode')[0].args).toEqual(['school-new', await sha256Hex(code.replace('-', ''))]);
    expect(called('audit').map(a => a.args)).toEqual([['add_school', 'school-new', 'owner-1']]);
  });
  it('addSchool needs a name', async () => {
    const { d } = deps();
    expect(await handleAdmin(OWNER, { action: 'addSchool', name: ' ' }, d)).toEqual({ status: 400, body: { message: 'Enter the school name' } });
  });
  it('newSchoolCode 404s for an unknown school', async () => {
    const { d, called } = deps();
    expect(await handleAdmin(OWNER, { action: 'newSchoolCode', schoolId: 'nope' }, d)).toEqual({ status: 404, body: { message: 'Not found' } });
    expect(called('setSchoolCode')).toEqual([]);
    const ok = await handleAdmin(OWNER, { action: 'newSchoolCode', schoolId: 'school-1' }, d);
    expect(ok.status).toBe(200);
    expect(called('audit').map(a => a.args)).toEqual([['new_school_code', 'school-1', 'owner-1']]);
  });
});

describe('readers', () => {
  it('addReader picks an unused id, stores hashes only', async () => {
    let first = true;
    const { d, called } = deps({ readerExists: async () => { const taken = first; first = false; return taken; } });
    const r = await handleAdmin(OWNER, { action: 'addReader', classId: 'class-1' }, d);
    expect(r.status).toBe(200);
    const { id, key, pairingCode } = r.body as { id: string; key: string; pairingCode: string };
    expect(id).toMatch(/^KD-\d{4}$/);
    const [row] = called('insertReader')[0].args as [Record<string, string>];
    expect(row).toEqual({ id, classId: 'class-1', keyHash: await sha256Hex(key), tokenHash: await sha256Hex(pairingCode) });
    expect(JSON.stringify(row)).not.toContain(key);
  });
  it('addReader 404s for an unknown class; 400 for a missing classId', async () => {
    const { d } = deps();
    expect(await handleAdmin(OWNER, { action: 'addReader', classId: 'nope' }, d)).toEqual({ status: 404, body: { message: 'Not found' } });
    expect((await handleAdmin(OWNER, { action: 'addReader' }, d)).status).toBe(400);
  });
  it('newReaderKey refuses a retired or missing reader', async () => {
    const { d } = deps();
    expect(await handleAdmin(OWNER, { action: 'newReaderKey', readerId: 'KD-0002' }, d)).toEqual({ status: 404, body: { message: 'Not found' } });
    const ok = await handleAdmin(OWNER, { action: 'newReaderKey', readerId: 'KD-0001' }, d);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body as object).sort()).toEqual(['key', 'pairingCode']);
  });
  it('retireReader needs the exact reader id typed', async () => {
    const { d, called } = deps();
    expect(await handleAdmin(OWNER, { action: 'retireReader', readerId: 'KD-0002', confirm: 'kd-0002' }, d))
      .toEqual({ status: 400, body: { message: 'Type KD-0002 exactly to confirm' } });
    expect(called('retireReader')).toEqual([]);
    expect(await handleAdmin(OWNER, { action: 'retireReader', readerId: 'KD-0002', confirm: 'KD-0002' }, d)).toEqual({ status: 200, body: { ok: true } });
    expect(called('retireReader')[0].args).toEqual(['KD-0002', 'owner-1']);
    const gone = deps({ retireReader: async () => false });
    expect((await handleAdmin(OWNER, { action: 'retireReader', readerId: 'KD-0003', confirm: 'KD-0003' }, gone.d)).status).toBe(404);
  });
});

describe('teachers', () => {
  it('deleteTeacher needs the exact username and reports photos left', async () => {
    const { d, called } = deps({ removeClassPhotos: async () => ['class-1'] });
    expect(await handleAdmin(OWNER, { action: 'deleteTeacher', teacherId: 'teacher-1', confirm: 'Test-Adviser' }, d))
      .toEqual({ status: 400, body: { message: 'Type test-adviser exactly to confirm' } });
    expect(called('deleteTeacher')).toEqual([]);
    expect(await handleAdmin(OWNER, { action: 'deleteTeacher', teacherId: 'teacher-1', confirm: 'test-adviser' }, d))
      .toEqual({ status: 200, body: { ok: true, photosLeft: ['class-1'] } });
    expect(called('deleteTeacher')[0].args).toEqual(['teacher-1', 'owner-1']);
    expect((await handleAdmin(OWNER, { action: 'deleteTeacher', teacherId: 'nobody', confirm: 'x' }, d)).status).toBe(404);
  });
});

it('logs each change once and never a secret', async () => {
  const { d, called } = deps();
  const out: unknown[] = [];
  out.push((await handleAdmin(OWNER, { action: 'addSchool', name: 'S' }, d)).body);
  out.push((await handleAdmin(OWNER, { action: 'newSchoolCode', schoolId: 'school-1' }, d)).body);
  out.push((await handleAdmin(OWNER, { action: 'addReader', classId: 'class-1' }, d)).body);
  out.push((await handleAdmin(OWNER, { action: 'newReaderKey', readerId: 'KD-0001' }, d)).body);
  await handleAdmin(OWNER, { action: 'retireReader', readerId: 'KD-0001', confirm: 'KD-0001' }, d);
  await handleAdmin(OWNER, { action: 'deleteTeacher', teacherId: 'teacher-1', confirm: 'test-adviser' }, d);
  expect(called('audit').map(a => a.args[0])).toEqual(['add_school', 'new_school_code', 'add_reader', 'new_reader_key']);
  const logged = JSON.stringify(called('audit').map(a => a.args));
  for (const b of out as Record<string, string>[]) {
    for (const k of ['code', 'key', 'pairingCode'] as const) if (b[k]) expect(logged).not.toContain(b[k]);
  }
});

describe('who the caller is', () => {
  it('a token whose signature does not check out gives no caller', async () => {
    const forged = 'Bearer x.' + btoa(JSON.stringify({ sub: 'owner-1', aal: 'aal2' })) + '.y';
    expect(await callerOf(forged, async () => null)).toBeNull();
  });
  it('the caller comes from the verified claims, not the header', async () => {
    expect(await callerOf('Bearer t', async t => (t === 't' ? { sub: 'owner-1', aal: 'aal2' } : null))).toEqual({ userId: 'owner-1', aal: 'aal2' });
    expect(await callerOf('Bearer t', async () => ({ role: 'anon' }))).toBeNull(); // the anon key has no sub
    expect(await callerOf(null, async () => ({ sub: 'x', aal: 'aal2' }))).toBeNull();
  });
});

it('removeClassPhotos only touches classes that are gone, and logs it', async () => {
  const live = deps(); // classExists: only 'class-1'
  const gone = '00000000-0000-0000-0000-0000000000aa';
  expect(await handleAdmin(OWNER, { action: 'removeClassPhotos', classIds: ['class-1', '', '../x', gone] }, live.d))
    .toEqual({ status: 200, body: { photosLeft: [] } });
  expect(live.called('removeClassPhotos')[0].args).toEqual([[gone]]);
  expect(live.called('audit').map(a => a.args)).toEqual([['remove_class_photos', gone, 'owner-1']]);
});

it('overview returns the lists', async () => {
  const { d } = deps();
  expect(await handleAdmin(OWNER, { action: 'overview' }, d)).toEqual({ status: 200, body: EMPTY });
});

it('rejects an unknown action with 400', async () => {
  const { d } = deps();
  expect(await handleAdmin(OWNER, { action: 'dropTables' }, d)).toEqual({ status: 400, body: { message: 'Unknown action' } });
  expect((await handleAdmin(OWNER, null, d)).status).toBe(400);
});
