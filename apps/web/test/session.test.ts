import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { classDay } from '../src/lib/attendance';
import { openDb, recordCorrection } from '../src/lib/db';
import { DEMO_CLASS_ID, DEMO_TEACHER_ID, seedDemo } from '../src/lib/demo';
import { dbName, modeFromEnv, signIn, signOut, startSession, supabaseAuth, WRONG_LOGIN, type AuthPort } from '../src/lib/session';
import SignIn from '../src/pages/SignIn.svelte';

const fresh = () => openDb('t-' + crypto.randomUUID());
const fakeAuth = (ok = true, userId = 'u-1'): AuthPort & { calls: number } => ({
  calls: 0,
  async signIn(email, password) {
    this.calls++;
    if (!ok || password !== 'right') throw new Error(WRONG_LOGIN);
    return { userId, displayName: "Ma'am Test" };
  },
  async signOut() { this.calls++; },
});

describe('owner sign-in', () => {
  /** A stand-in for a supabase client: password sign-in, the profile read, and setSession. */
  const fakeClient = (role: string, opts: { setSessionFails?: boolean; profile?: 'error' | 'missing' } = {}) => {
    const c = {
      setSessions: [] as unknown[],
      auth: {
        async signInWithPassword({ email }: { email: string }) {
          return { data: { user: { id: 'u-' + email.split('@')[0] }, session: { access_token: 'a', refresh_token: 'r' } }, error: null };
        },
        async setSession(s: unknown) {
          if (opts.setSessionFails) return { data: { session: null }, error: { message: 'Failed to fetch' } };
          c.setSessions.push(s);
          return { data: {}, error: null };
        },
        async signOut() { return { error: null }; },
      },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () =>
        opts.profile === 'error' ? { data: null, error: { message: 'Failed to fetch' } }
          : opts.profile === 'missing' ? { data: null, error: null }
          : { data: { display_name: 'Name', role, school_id: null, schools: null }, error: null } }) }) }),
    };
    return c;
  };

  it('a teacher whose session could not be saved is not signed in', async () => {
    const auth = supabaseAuth(fakeClient('teacher', { setSessionFails: true }) as never, () => fakeClient('teacher') as never);
    await expect(auth.signIn('maria', 'pw')).rejects.toThrow("Can't reach Klasilid right now. Check the internet and try again.");
  });

  it('an owner whose session could not be held is not signed in', async () => {
    const auth = supabaseAuth(fakeClient('owner') as never, refresh => fakeClient('owner', { setSessionFails: refresh }) as never);
    await expect(auth.signIn('owner', 'pw')).rejects.toThrow("Can't reach Klasilid right now. Check the internet and try again.");
  });

  it('a failed profile read never falls through to the teacher path', async () => {
    for (const profile of ['error', 'missing'] as const) {
      const saved = fakeClient('teacher');
      const auth = supabaseAuth(saved as never, () => fakeClient('owner', { profile }) as never);
      await expect(auth.signIn('owner', 'pw')).rejects.toThrow("Can't reach Klasilid right now. Check the internet and try again.");
      expect(saved.setSessions).toEqual([]);
    }
  });

  it('owner sign-in returns the owner client and touches no local data', async () => {
    const db = fresh();
    await signIn(db, fakeAuth(true, 'u-teacher'), 't', 'right');
    await seedDemo(db, new Date('2026-11-13T04:00:00Z'));
    await recordCorrection(db, { learnerId: 'l', classId: 'c', date: '2026-11-13', session: 'am', status: 'absent', reason: 'sick', createdBy: 'u-teacher' });
    const before = { meta: await db.meta.toArray(), outbox: await db.outbox.count(), learners: await db.learners.count() };
    const owner = {} as never;
    const auth: AuthPort = { async signIn() { return { userId: 'u-owner', displayName: 'Owner', ownerClient: owner }; }, async signOut() {} };
    const s = await signIn(db, auth, 'owner', 'pw');
    expect(s).toEqual({ mode: 'online', userId: 'u-owner', displayName: 'Owner', owner });
    expect({ meta: await db.meta.toArray(), outbox: await db.outbox.count(), learners: await db.learners.count() }).toEqual(before);
  });

  it('owner sign-in leaves the saved login untouched', async () => {
    const saved = fakeClient('owner');
    const memory: ReturnType<typeof fakeClient>[] = [];
    const auth = supabaseAuth(saved as never, () => { const m = fakeClient('owner'); memory.push(m); return m as never; });
    const r = await auth.signIn('owner', 'pw');
    expect(saved.setSessions).toEqual([]);
    expect(r.ownerClient).toBe(memory.at(-1));
    expect(memory.at(-1)!.setSessions).toHaveLength(1); // the owner's own in-memory client holds the session
  });

  it('a teacher session goes to the saved login once', async () => {
    const saved = fakeClient('teacher');
    const auth = supabaseAuth(saved as never, () => fakeClient('teacher') as never);
    const r = await auth.signIn('maria', 'pw');
    expect(saved.setSessions).toEqual([{ access_token: 'a', refresh_token: 'r' }]);
    expect(r.ownerClient).toBeUndefined();
    expect(r.userId).toBe('u-maria');
  });
});

describe('shared devices', () => {
  it('demo and online keep separate local databases', () => {
    expect(dbName('demo')).not.toBe(dbName('online'));
  });

  it('a different teacher signing in on this device starts with an empty local database', async () => {
    const db = fresh();
    await signIn(db, fakeAuth(true, 'u-a'), 'a', 'right');
    await seedDemo(db, new Date('2026-11-13T04:00:00Z'));
    await db.meta.delete('user'); // sign-out interrupted before it cleared the class: data and owner left behind
    await signIn(db, fakeAuth(true, 'u-b'), 'b', 'right');
    expect(await db.learners.count()).toBe(0);
    expect((await db.meta.get('user'))?.value).toMatchObject({ userId: 'u-b' });
  });

  it("refuses a different teacher while the last teacher's changes are unsynced", async () => {
    const db = fresh();
    await signIn(db, fakeAuth(true, 'u-a'), 'a', 'right');
    await recordCorrection(db, { learnerId: 'l', classId: 'c', date: '2026-11-13', session: 'am', status: 'absent', reason: 'sick', createdBy: 'u-a' });
    await signOut(db, fakeAuth(true, 'u-a'));
    await expect(signIn(db, fakeAuth(true, 'u-b'), 'b', 'right')).rejects.toThrow(/haven't synced yet/);
    expect(await db.outbox.count()).toBe(1);
    expect(await db.meta.get('user')).toBeUndefined();
  });

  it('sign-out with nothing waiting clears the local data', async () => {
    const db = fresh();
    await signIn(db, fakeAuth(true, 'u-a'), 'a', 'right');
    await seedDemo(db, new Date('2026-11-13T04:00:00Z'));
    await signOut(db, fakeAuth(true, 'u-a'));
    expect(await db.learners.count()).toBe(0);
  });
});

describe('session', () => {
  it('modeFromEnv is demo when either variable is missing', () => {
    expect(modeFromEnv({})).toBe('demo');
    expect(modeFromEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co' })).toBe('demo');
    expect(modeFromEnv({ VITE_SUPABASE_ANON_KEY: 'k' })).toBe('demo');
    expect(modeFromEnv({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_ANON_KEY: 'k' })).toBe('online');
  });

  it('demo startSession seeds once and returns the demo teacher', async () => {
    const db = fresh();
    const s = await startSession(db, 'demo');
    expect(s).toMatchObject({ mode: 'demo', userId: DEMO_TEACHER_ID });
    expect(await db.learners.count()).toBe(38);
    await db.learners.delete('demo-l-01');
    await startSession(db, 'demo');
    expect(await db.learners.count()).toBe(37); // not reseeded
  });

  it('online startSession returns the cached user with no network', async () => {
    const db = fresh();
    expect(await startSession(db, 'online')).toBeNull();
    await seedDemo(db, new Date('2026-11-13T04:00:00Z'));
    await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
    const s = await startSession(db, 'online');
    expect(s).toEqual({ mode: 'online', userId: 'u-1', displayName: "Ma'am Test" });
    const day = await classDay(db, DEMO_CLASS_ID, '2026-11-13', new Date('2026-11-13T04:00:00Z'));
    expect(day.rows).toHaveLength(38);
  });

  it('signIn caches the user; signOut clears it but keeps outbox items', async () => {
    const db = fresh();
    const auth = fakeAuth();
    expect(await signIn(db, auth, 'teacher@example.com', 'right')).toEqual({ mode: 'online', userId: 'u-1', displayName: "Ma'am Test", username: 'teacher@example.com' });
    expect((await db.meta.get('user'))?.value).toEqual({ userId: 'u-1', displayName: "Ma'am Test", username: 'teacher@example.com' });
    await recordCorrection(db, { learnerId: 'l', classId: 'c', date: '2026-11-13', session: 'am', status: 'absent', reason: 'sick', createdBy: 'u-1' });
    await signOut(db, auth);
    expect(await db.meta.get('user')).toBeUndefined();
    expect(await db.outbox.count()).toBe(1);
  });
});

it('a wrong password shows the wrong-login message and stays on sign-in', async () => {
  const onsignedin = vi.fn();
  render(SignIn, { db: fresh(), auth: fakeAuth(), onsignedin });
  await fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'lou.test' } });
  await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText(WRONG_LOGIN)).toBeTruthy();
  expect(onsignedin).not.toHaveBeenCalled();
});

it('a right password signs in', async () => {
  const onsignedin = vi.fn();
  render(SignIn, { db: fresh(), auth: fakeAuth(), onsignedin });
  await fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'lou.test' } });
  await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'right' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await vi.waitFor(() => expect(onsignedin).toHaveBeenCalledWith({ mode: 'online', userId: 'u-1', displayName: "Ma'am Test", username: 'lou.test' }));
});
