import { describe, expect, it } from 'vitest';
import { checkSignup, type SignupInput } from '../../apps/web/src/lib/signup';
import { handleSignup, pickYear, type SignupDeps } from '../functions/signup/handler';
import { sha256Hex } from '../functions/tap/handler';

const SCHOOL = { schoolId: 'school-1', schoolName: 'Sample School' };
const ok: SignupInput = { code: 'abcd-2345', displayName: "Ma'am Santos", username: 'maria.santos', password: 'longenough' };
const NOW = new Date('2026-11-17T02:00:00Z');

function deps(over: Partial<SignupDeps> = {}) {
  const attempts: { ip: string; ok: boolean; at: Date }[] = [];
  const created: { email: string; password: string; displayName: string }[] = [];
  let clock = NOW;
  const d: SignupDeps & { attempts: typeof attempts; created: typeof created; tick(ms: number): void } = {
    attempts, created,
    tick(ms) { clock = new Date(clock.getTime() + ms); },
    async schoolForCodeHash(hash) { return hash === (await sha256Hex('ABCD2345')) ? SCHOOL : null; },
    async currentYear() { return 'year-1'; },
    async failuresSince(ip, since) { return attempts.filter(a => a.ip === ip && !a.ok && a.at >= since).length; },
    async recordAttempt(ip, ok) { attempts.push({ ip, ok, at: clock }); },
    async createTeacher(u) { created.push(u); return { userId: 'u-1' }; },
    now: () => clock,
    ...over,
  };
  return d;
}

it('creates the teacher and returns the school and its current year', async () => {
  const d = deps();
  expect(await handleSignup(ok, '1.2.3.4', d)).toEqual({ status: 200, body: { schoolId: 'school-1', schoolName: 'Sample School', yearId: 'year-1' } });
  expect(d.created).toEqual([{ email: 'maria.santos@login.klasilid.app', password: 'longenough', displayName: "Ma'am Santos" }]);
  expect(d.attempts.map(a => a.ok)).toEqual([true]);
});

it('a wrong code is refused on the code field and counted as a failure', async () => {
  const d = deps();
  expect(await handleSignup({ ...ok, code: 'ZZZZ-2345' }, '1.2.3.4', d))
    .toEqual({ status: 400, body: { field: 'code', message: 'That school code isn’t right. Check it with the Klasilid admin.' } });
  expect(d.attempts.map(a => a.ok)).toEqual([false]);
  expect(d.created).toEqual([]);
});

it('a taken username is 409 on the username field', async () => {
  const d = deps({ async createTeacher() { return { taken: true }; } });
  expect(await handleSignup(ok, '1.2.3.4', d)).toEqual({ status: 409, body: { field: 'username', message: 'That username is taken' } });
});

it('normalises the username (case, spaces) before checking and creating it', async () => {
  const d = deps();
  expect((await handleSignup({ ...ok, username: ' Maria.Santos ' }, '1.2.3.4', d)).status).toBe(200);
  expect(d.created[0].email).toBe('maria.santos@login.klasilid.app');
});

describe('validation matches the app (same field, same message)', () => {
  it.each<Partial<SignupInput>>([
    { code: '' }, { code: 'abc' }, { displayName: ' ' }, { username: 'ab' }, { username: 'a b c' }, { username: 'Admin' }, { password: 'short' },
  ])('%j', async over => {
    const input = { ...ok, ...over };
    const [field, message] = Object.entries(checkSignup(input))[0];
    expect(await handleSignup(input, '1.2.3.4', deps())).toEqual({ status: 400, body: { field, message } });
  });
  it('a body that is not an object is a 400', async () => {
    expect((await handleSignup('nope', '1.2.3.4', deps())).status).toBe(400);
  });
});

it('after 10 wrong codes in 10 minutes the address is refused, even with the right code, until the window passes', async () => {
  const d = deps();
  for (let i = 0; i < 10; i++) expect((await handleSignup({ ...ok, code: 'ZZZZ-2345' }, '1.2.3.4', d)).status).toBe(400);
  const locked = { status: 429, body: { message: 'Too many tries. Wait 10 minutes and try again.' } };
  expect(await handleSignup({ ...ok, code: 'ZZZZ-2345' }, '1.2.3.4', d)).toEqual(locked);
  expect(await handleSignup(ok, '1.2.3.4', d)).toEqual(locked);
  expect(d.created).toEqual([]);
  expect((await handleSignup(ok, '5.6.7.8', d)).status).toBe(200); // another address is not affected
  d.tick(10 * 60_000 + 1);
  expect((await handleSignup({ ...ok, username: 'second.one' }, '1.2.3.4', d)).status).toBe(200);
});

describe('pickYear', () => {
  const years = [
    { id: 'old', startsOn: '2025-06-01', endsOn: '2026-04-30' },
    { id: 'now', startsOn: '2026-06-01', endsOn: '2027-04-30' },
    { id: 'next', startsOn: '2027-06-01', endsOn: '2028-04-30' },
  ];
  it('takes the year whose dates contain today', () => expect(pickYear(years, '2026-11-17')).toBe('now'));
  it('between years takes the latest start', () => expect(pickYear(years, '2027-05-15')).toBe('next'));
  it('no years is null', () => expect(pickYear([], '2026-11-17')).toBeNull());
});
