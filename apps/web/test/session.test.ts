import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { classDay } from '../src/lib/attendance';
import { openDb, recordCorrection } from '../src/lib/db';
import { DEMO_CLASS_ID, DEMO_TEACHER_ID, seedDemo } from '../src/lib/demo';
import { dbName, modeFromEnv, signIn, signOut, startSession, WRONG_LOGIN, type AuthPort } from '../src/lib/session';
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
    expect(await signIn(db, auth, 'teacher@example.com', 'right')).toEqual({ mode: 'online', userId: 'u-1', displayName: "Ma'am Test" });
    expect((await db.meta.get('user'))?.value).toEqual({ userId: 'u-1', displayName: "Ma'am Test" });
    await recordCorrection(db, { learnerId: 'l', classId: 'c', date: '2026-11-13', session: 'am', status: 'absent', reason: 'sick', createdBy: 'u-1' });
    await signOut(db, auth);
    expect(await db.meta.get('user')).toBeUndefined();
    expect(await db.outbox.count()).toBe(1);
  });
});

it('a wrong password shows "Wrong email or password" and stays on sign-in', async () => {
  const onsignedin = vi.fn();
  render(SignIn, { db: fresh(), auth: fakeAuth(), onsignedin });
  await fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'lou.test' } });
  await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(await screen.findByText('Wrong email or password')).toBeTruthy();
  expect(onsignedin).not.toHaveBeenCalled();
});

it('a right password signs in', async () => {
  const onsignedin = vi.fn();
  render(SignIn, { db: fresh(), auth: fakeAuth(), onsignedin });
  await fireEvent.input(screen.getByLabelText('Username'), { target: { value: 'lou.test' } });
  await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'right' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await vi.waitFor(() => expect(onsignedin).toHaveBeenCalledWith({ mode: 'online', userId: 'u-1', displayName: "Ma'am Test" }));
});
