import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';
import { openDb } from '../src/lib/db';
import { applySetup, claimSection, DEFAULT_WINDOWS, type SetupInput } from '../src/lib/setup';
import { checkSignup, OFFLINE, OLD_LINK, signUpRemote, type SignupInput } from '../src/lib/signup';
import { inviteOf, routeOf } from '../src/lib/router';
import { signIn, type AuthPort } from '../src/lib/session';
import Setup from '../src/pages/Setup.svelte';
import SignUp from '../src/pages/SignUp.svelte';

const ok: SignupInput = { code: 'ABCD-2345', displayName: "Ma'am Santos", username: 'maria.santos', password: 'longenough' };
const fresh = () => openDb('t-' + crypto.randomUUID());

describe('checkSignup', () => {
  it.each([
    [{}, {}],
    [{ code: '' }, { code: 'Enter the school code' }],
    [{ code: 'abc' }, { code: 'The school code looks like XXXX-XXXX' }],
    [{ code: ' abcd 2345 ' }, {}],
    [{ displayName: '  ' }, { displayName: 'Enter your name' }],
    [{ username: 'ab' }, { username: 'Use 3–30 small letters, numbers, dots, dashes or underscores' }],
    [{ username: 'maria santos' }, { username: 'Use 3–30 small letters, numbers, dots, dashes or underscores' }],
    [{ username: ' Maria.Santos ' }, {}],
    [{ username: 'Admin' }, { username: 'That username can’t be used' }],
    [{ password: 'short' }, { password: 'Use at least 8 characters' }],
  ])('%j → %j', (over, errors) => {
    expect(checkSignup({ ...ok, ...over })).toEqual(errors);
  });
});

describe('signUpRemote', () => {
  const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('posts the normalised username and returns the school', async () => {
    const f = reply(200, { schoolId: 's', schoolName: 'Sample School', yearId: 'y' });
    expect(await signUpRemote(f, 'https://x.test', { ...ok, username: ' Maria.Santos ' })).toEqual({ ok: true, schoolId: 's', schoolName: 'Sample School', yearId: 'y' });
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('https://x.test/functions/v1/signup');
    expect(JSON.parse(init.body)).toEqual({ ...ok, username: 'maria.santos' });
  });
  it('maps a taken username and a lockout', async () => {
    expect(await signUpRemote(reply(409, { field: 'username', message: 'That username is taken' }), '', ok))
      .toEqual({ ok: false, field: 'username', message: 'That username is taken' });
    expect(await signUpRemote(reply(429, { message: 'Too many tries. Wait 10 minutes and try again.' }), '', ok))
      .toEqual({ ok: false, message: 'Too many tries. Wait 10 minutes and try again.' });
  });
  it('says internet is needed when the request fails', async () => {
    const f = vi.fn(async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    expect(await signUpRemote(f, '', ok)).toEqual({ ok: false, message: OFFLINE });
  });
});

describe('sign-up page', () => {
  const fill = async (v: Partial<SignupInput>) => {
    const ids = { displayName: 'Your name in Klasilid', username: 'Username', password: 'Password' } as const;
    for (const [k, label] of Object.entries(ids)) {
      const value = (v as Record<string, string>)[k];
      if (value !== undefined) await fireEvent.input(screen.getByLabelText(label), { target: { value } });
    }
  };
  const open = (signup = vi.fn(), onsignedup = vi.fn(), invite = ok.code) => render(SignUp, { invite, signup, onsignedup });

  it('has no school code field: the code comes from the invite link', () => {
    open();
    expect(screen.queryByLabelText('School code')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Create your adviser account' })).toBeTruthy();
  });

  it('without an invite link it asks for one and shows no form', () => {
    open(vi.fn(), vi.fn(), '');
    expect(screen.getByRole('heading', { name: 'Ask for your sign-up link' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
  });

  it('a failed submit lists each problem as a link to its field and focuses the summary', async () => {
    const signup = vi.fn();
    open(signup);
    await fill({ displayName: "Ma'am Santos", username: 'ab', password: 'short' });
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    const summary = screen.getByRole('alert');
    expect(summary.textContent).toContain('Fix 2 things to continue');
    const links = [...summary.querySelectorAll('a')].map(a => [a.getAttribute('href'), a.textContent]);
    expect(links).toEqual([['#suUser', 'Use 3–30 small letters, numbers, dots, dashes or underscores'], ['#suPass', 'Use at least 8 characters']]);
    expect(document.activeElement).toBe(summary);
    expect(screen.getByLabelText('Username').getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText('Your name in Klasilid').getAttribute('aria-invalid')).toBe('false');
    expect(signup).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Your name in Klasilid') as HTMLInputElement).value).toBe("Ma'am Santos");
  });

  it('an invite the server no longer accepts says to ask for a new link', async () => {
    open(vi.fn().mockResolvedValue({ ok: false, field: 'code', message: 'That school code isn’t right. Check it with the Klasilid admin.' }));
    await fill(ok);
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toContain(OLD_LINK);
  });

  it('a broken invite link (not a code at all) gets the same message without calling the server', async () => {
    const signup = vi.fn();
    open(signup, vi.fn(), 'abc');
    await fill(ok);
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('alert').textContent).toContain(OLD_LINK);
    expect(signup).not.toHaveBeenCalled();
  });

  it('shows a server error on its field and keeps what was typed when offline', async () => {
    const signup = vi.fn()
      .mockResolvedValueOnce({ ok: false, field: 'username', message: 'That username is taken' })
      .mockResolvedValueOnce({ ok: false, message: OFFLINE });
    open(signup);
    await fill(ok);
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('link', { name: 'That username is taken' })).getAttribute('href')).toBe('#suUser');
    expect(screen.getByLabelText('Username').getAttribute('aria-describedby')).toBe('suUserMsg');
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect((await screen.findByRole('alert')).textContent).toContain(OFFLINE);
    expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe(ok.username);
    expect((screen.getByLabelText('Password') as HTMLInputElement).value).toBe(ok.password);
  });

  it('hands the result to the app after a successful sign-up and drops the invite from the address bar', async () => {
    location.hash = `#/signup?invite=${ok.code}`;
    const r = { ok: true, schoolId: 's', schoolName: 'Sample School', yearId: null };
    const onsignedup = vi.fn();
    open(vi.fn().mockResolvedValue(r), onsignedup);
    await fill(ok);
    await fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await vi.waitFor(() => expect(onsignedup).toHaveBeenCalledWith(ok, r));
    expect(location.hash).not.toContain('invite');
    location.hash = '';
  });
});

describe('invite links', () => {
  it('route and invite come from #/signup?invite=…', () => {
    expect(routeOf('#/signup?invite=Y3RS-MWTL')).toBe('signup');
    expect(inviteOf('#/signup?invite=Y3RS-MWTL')).toBe('Y3RS-MWTL');
    expect(inviteOf('#/signup')).toBe('');
    expect(routeOf('#/today')).toBe('today');
  });
});

const NOW = new Date('2026-11-13T00:00:00Z');
const input = (): SetupInput => ({
  schoolName: 'Sample School', yearLabel: 'SY 2026–2027', startsOn: '2026-06-01', endsOn: '2027-04-30',
  grade: 6, section: 'Sampaguita', rows: 8, cols: 5, windows: DEFAULT_WINDOWS.map(w => ({ ...w })),
  learners: [{ lastName: 'Abad', firstName: 'Ana', sex: 'F' }],
});

it('applySetup in join mode with an existing year reuses the ids and queues no holidays', async () => {
  const db = fresh();
  await db.meta.put({ key: 'join', value: { schoolId: 'school-1', schoolName: 'Sample School', yearId: 'year-1' } });
  const classId = await applySetup(db, input(), NOW, { schoolId: 'school-1', schoolName: 'Sample School', yearId: 'year-1' });
  const ops = (await db.outbox.orderBy('seq').toArray()).map(i => i.op);
  expect(ops.some(o => 'table' in o && o.table === 'calendar_days')).toBe(false);
  expect(ops[0]).toMatchObject({ kind: 'rpc', fn: 'setup_class', args: { p_school_id: 'school-1', p_year_id: 'year-1', p_class_id: classId } });
  expect(await db.classes.get(classId)).toMatchObject({ schoolYearId: 'year-1' });
  // kept: if the server later refuses the class and it disappears, the wizard reopens for the same school
  expect((await db.meta.get('join'))?.value).toMatchObject({ schoolId: 'school-1' });
});

describe('claimSection (online: the section is claimed before anything is written)', () => {
  const join = { schoolId: 'school-1', schoolName: 'Sample School', yearId: null };
  const port = (error: { message: string; code?: string } | null, year?: string) => {
    const calls: Record<string, unknown>[] = [];
    return { calls, rpc: async (_fn: string, args: Record<string, unknown>) => { calls.push(args); return { error }; },
      yearByLabel: vi.fn(async () => year ?? (calls[0].p_year_id as string)) };
  };
  it('a first adviser makes the year, so its holidays are hers to add', async () => {
    const p = port(null);
    const c = await claimSection(p, input(), join);
    expect(c).toEqual({ classId: p.calls[0].p_class_id, yearId: p.calls[0].p_year_id, newYear: true });
    expect(p.calls[0]).toMatchObject({ p_school_id: 'school-1', p_grade: 6, p_section: 'Sampaguita' });
  });
  it('a later adviser lands in the year another adviser made', async () => {
    expect(await claimSection(port(null, 'year-other'), input(), join)).toMatchObject({ yearId: 'year-other', newYear: false });
  });
  it('with the year known from sign-up it does not look it up', async () => {
    const p = port(null);
    expect(await claimSection(p, input(), { ...join, yearId: 'year-1' })).toMatchObject({ yearId: 'year-1', newYear: false });
    expect(p.yearByLabel).not.toHaveBeenCalled();
  });
  it('a taken section comes back as the message', async () => {
    expect(await claimSection(port({ code: 'P0001', message: 'Gr. 6 Sampaguita already has an adviser' }), input(), join))
      .toEqual({ error: 'Gr. 6 Sampaguita already has an adviser' });
  });
  it('offline it returns null so setup is queued as before', async () => {
    expect(await claimSection(port({ code: '', message: 'TypeError: Failed to fetch' }), input(), join)).toBeNull();
    expect(await claimSection({ rpc: async () => { throw new TypeError('Failed to fetch'); }, yearByLabel: async () => null }, input(), join)).toBeNull();
  });
});

it('the wizard keeps everything and shows the message when the section is taken', async () => {
  const onfinish = vi.fn();
  const db = fresh();
  render(Setup, { db, now: () => NOW, onfinish, join: { schoolId: 'school-1', schoolName: 'Sample School', yearId: 'year-1' },
    claim: { rpc: async () => ({ error: { code: 'P0001', message: 'Gr. 6 Sampaguita already has an adviser' } }), yearByLabel: async () => null } });
  await fireEvent.change(screen.getByLabelText('Section'), { target: { value: 'Ruby' } });
  const next = () => screen.getByRole('button', { name: /^(Next|Finish)$/ });
  await fireEvent.click(next());
  await fireEvent.input(screen.getByLabelText('Paste a list'), { target: { value: 'Abad, Ana' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Add from list' }));
  for (let i = 0; i < 4; i++) await fireEvent.click(next());
  expect(await screen.findByText('Gr. 6 Sampaguita already has an adviser')).toBeTruthy();
  expect(screen.getByLabelText('Section')).toBeTruthy(); // back on the class step
  expect(onfinish).not.toHaveBeenCalled();
  expect(await db.classes.count()).toBe(0);
});

it('signing in remembers the school from the profile, so a wiped device still opens the right wizard', async () => {
  const db = fresh();
  const auth: AuthPort = { signIn: async () => ({ userId: 'u-1', displayName: 'T', school: { id: 'school-1', name: 'Sample School' } }), signOut: async () => {} };
  const s = await signIn(db, auth, 'maria.santos', 'longenough');
  expect(s).not.toHaveProperty('school');
  expect((await db.meta.get('join'))?.value).toEqual({ schoolId: 'school-1', schoolName: 'Sample School', yearId: null });
  await db.meta.put({ key: 'join', value: { schoolId: 'school-1', schoolName: 'Sample School', yearId: 'year-1' } });
  await signIn(db, auth, 'maria.santos', 'longenough');
  expect((await db.meta.get('join'))?.value).toMatchObject({ yearId: 'year-1' }); // a known year is not thrown away
});

it('when the server refused the class, the reopened wizard says why', async () => {
  const db = fresh();
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
  await db.meta.put({ key: 'join', value: { schoolId: 'school-1', schoolName: 'Sample School', yearId: 'year-1' } });
  await db.rejected.add({ op: { kind: 'rpc', fn: 'setup_class', args: {} }, createdAt: NOW.toISOString(), error: 'Gr. 6 Sampaguita already has an adviser', at: NOW.toISOString() });
  const auth: AuthPort = { signIn: async () => ({ userId: 'u-1', displayName: '' }), signOut: async () => {} };
  render(App, { deps: { db, mode: 'online', auth, remote: null } });
  expect(await screen.findByText('Gr. 6 Sampaguita already has an adviser', {}, { timeout: 3000 })).toBeTruthy();
  location.hash = '';
});

it('applySetup in join mode without a year creates the year and its holidays', async () => {
  const db = fresh();
  await applySetup(db, input(), NOW, { schoolId: 'school-1', schoolName: 'Sample School', yearId: null });
  const ops = (await db.outbox.orderBy('seq').toArray()).map(i => i.op);
  expect(ops[0]).toMatchObject({ args: { p_school_id: 'school-1' } });
  expect(ops.some(o => 'table' in o && o.table === 'calendar_days')).toBe(true);
});

it('reopens the wizard in join mode if the adviser left before finishing', async () => {
  const db = fresh();
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
  await db.meta.put({ key: 'owner', value: 'u-1' });
  await db.meta.put({ key: 'join', value: { schoolId: 'school-1', schoolName: 'Sample School', yearId: 'year-1' } });
  const auth: AuthPort = { signIn: async () => ({ userId: 'u-1', displayName: '' }), signOut: async () => {} };
  render(App, { deps: { db, mode: 'online', auth, remote: null } });
  const school = (await screen.findByLabelText('School', {}, { timeout: 3000 })) as HTMLInputElement;
  expect(school.value).toBe('Sample School');
  expect(school.readOnly).toBe(true);
  expect(screen.queryByLabelText('School year')).toBeNull();
  location.hash = '';
});
