import type { SupabaseClient } from '@supabase/supabase-js';
import type { KlasilidDb } from './db';
import { DEMO_TEACHER_ID, seedDemo } from './demo';

export type Mode = 'demo' | 'online';
/** `owner`: an owner's admin session, held only in memory (never saved on the device). */
export interface Session { mode: Mode; userId: string; displayName: string; username?: string; owner?: SupabaseClient }
export interface AuthPort {
  /** `school`: the school a teacher signed up into with a school code (profiles.school_id).
   *  `ownerClient`: present only for the owner account; its session lives in that client alone. */
  signIn(username: string, password: string): Promise<{ userId: string; displayName: string; school?: { id: string; name: string }; ownerClient?: SupabaseClient }>;
  signOut(): Promise<void>;
  /** Re-checks the current password first. */
  changePassword?(current: string, next: string): Promise<void>;
  setEmail?(email: string): Promise<void>;
}
export const WRONG_LOGIN = 'That username or password isn’t right. Check both and try again.';

/** Demo and real data never share a local database, so demo rows can't be pushed to a real account. */
export const dbName = (mode: Mode) => (mode === 'demo' ? 'klasilid-demo' : 'klasilid');

/** Children's records stay on a device only while their teacher uses it. */
async function clearLocal(db: KlasilidDb) {
  await Promise.all(db.tables.filter(t => t.name !== 'outbox').map(t => t.clear()));
}

/** Demo mode until a Supabase project is configured (both variables set). */
export function modeFromEnv(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }): Mode {
  return env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? 'online' : 'demo';
}

/** Opens without the network: demo seeds once; online returns the user cached at the last sign-in (spec §9). */
export async function startSession(db: KlasilidDb, mode: Mode): Promise<Session | null> {
  if (mode === 'demo') {
    if (!(await db.meta.get('demoSeeded'))) await seedDemo(db, new Date());
    return { mode, userId: DEMO_TEACHER_ID, displayName: "Ma'am" };
  }
  const user = (await db.meta.get('user'))?.value as { userId: string; displayName: string } | undefined;
  return user ? { mode, ...user } : null;
}

export async function signIn(db: KlasilidDb, auth: AuthPort, username: string, password: string): Promise<Session> {
  const { school, ownerClient, ...user } = await auth.signIn(username.trim(), password);
  // The owner's admin session never opens, clears or writes this device's offline data (admin design §5).
  if (ownerClient) return { mode: 'online', ...user, owner: ownerClient };
  const owner = (await db.meta.get('owner'))?.value as string | undefined;
  if (owner && owner !== user.userId) {
    const waiting = await db.outbox.count();
    if (waiting) {
      await auth.signOut();
      throw new Error(`${waiting} changes from the last teacher on this device haven't synced yet. Ask them to sign in once with internet first.`);
    }
    await clearLocal(db);
  }
  const cached = { ...user, username: username.trim() };
  await db.meta.put({ key: 'owner', value: user.userId });
  await db.meta.put({ key: 'user', value: cached });
  // Her school comes from the server, so setup reopens for it on any device; a year already known here is kept.
  if (school && ((await db.meta.get('join'))?.value as { schoolId?: string } | undefined)?.schoolId !== school.id)
    await db.meta.put({ key: 'join', value: { schoolId: school.id, schoolName: school.name, yearId: null } });
  return { mode: 'online', ...cached };
}

/** With nothing waiting, the device forgets the class; unsynced changes stay (and keep their owner) until they sync. */
export async function signOut(db: KlasilidDb, auth: AuthPort): Promise<void> {
  await auth.signOut();
  await db.meta.delete('user');
  if ((await db.outbox.count()) === 0) await clearLocal(db);
}

/** Updates the cached sign-in and queues the profile change. */
export async function saveDisplayName(db: KlasilidDb, userId: string, name: string): Promise<void> {
  const user = (await db.meta.get('user'))?.value as Record<string, unknown> | undefined;
  await db.transaction('rw', db.meta, db.outbox, async () => {
    if (user) await db.meta.put({ key: 'user', value: { ...user, displayName: name } });
    await db.outbox.add({ createdAt: new Date().toISOString(), op: { kind: 'update', table: 'profiles', match: { id: userId }, values: { display_name: name } } });
  });
}

/**
 * Supabase sign-in. Login slips give usernames, and Supabase signs in by email,
 * so a username becomes `<username>@login.klasilid.app`; a real email is used as typed.
 *
 * The password is checked on a throwaway in-memory client (`memoryClient(false)`) so the role is known before
 * anything is saved: a teacher's session then goes to the saved client `sb`; the owner's goes to a fresh in-memory
 * client (`memoryClient(true)`, refreshing itself) and never reaches the device's saved login. Without
 * `memoryClient`, the owner can't sign in here.
 */
export function supabaseAuth(sb: SupabaseClient, memoryClient?: (autoRefresh: boolean) => SupabaseClient): AuthPort {
  return {
    async signIn(username, password) {
      const email = username.includes('@') ? username : `${username.toLowerCase()}@login.klasilid.app`;
      const offline = "Can't reach Klasilid right now. Check the internet and try again.";
      const check = memoryClient ? memoryClient(false) : sb;
      const { data, error } = await check.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.status === 400 ? WRONG_LOGIN : offline);
      // The role decides where the session goes, so an unread profile stops here instead of guessing "teacher".
      const { data: p, error: pe } = await check.from('profiles').select('display_name, role, school_id, schools(name)').eq('id', data.user.id).maybeSingle();
      if (pe || !p) throw new Error(offline);
      const base = { userId: data.user.id, displayName: p.display_name ?? username };
      if (p.role === 'owner') {
        if (!memoryClient) throw new Error('Sign in to the admin section from the Klasilid website.');
        const owner = memoryClient(true);
        if ((await owner.auth.setSession(data.session)).error) throw new Error(offline);
        return { ...base, ownerClient: owner };
      }
      if (check !== sb && (await sb.auth.setSession(data.session)).error) throw new Error(offline);
      const schoolName = (p.schools as { name?: string } | null)?.name;
      return { ...base, ...(p.school_id && schoolName ? { school: { id: p.school_id, name: schoolName } } : {}) };
    },
    async changePassword(current, next) {
      const { data } = await sb.auth.getUser();
      const email = data.user?.email;
      if (!email) throw new Error("Can't change the password offline");
      const check = await sb.auth.signInWithPassword({ email, password: current });
      if (check.error) throw new Error(check.error.status === 400 ? 'Current password is wrong' : "Can't change the password offline");
      const { error } = await sb.auth.updateUser({ password: next });
      if (error) throw new Error(error.message);
    },
    async setEmail(email) {
      const { error } = await sb.auth.updateUser({ email });
      if (error) throw new Error(error.message);
    },
    async signOut() {
      // 'local' clears the saved login on this device even with no internet; a global sign-out would fail offline and keep it.
      await sb.auth.signOut({ scope: 'local' });
    },
  };
}
