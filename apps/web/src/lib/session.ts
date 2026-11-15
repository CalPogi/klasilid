import type { SupabaseClient } from '@supabase/supabase-js';
import type { KlasilidDb } from './db';
import { DEMO_TEACHER_ID, seedDemo } from './demo';

export type Mode = 'demo' | 'online';
export interface Session { mode: Mode; userId: string; displayName: string }
export interface AuthPort {
  signIn(username: string, password: string): Promise<{ userId: string; displayName: string }>;
  signOut(): Promise<void>;
}
export const WRONG_LOGIN = 'Wrong email or password';

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
  const user = await auth.signIn(username.trim(), password);
  await db.meta.put({ key: 'user', value: user });
  return { mode: 'online', ...user };
}

/** Local data and the outbox stay, so nothing unsynced is lost; it syncs at the next sign-in. */
export async function signOut(db: KlasilidDb, auth: AuthPort): Promise<void> {
  await auth.signOut();
  await db.meta.delete('user');
}

/**
 * Supabase sign-in. Login slips give usernames, and Supabase signs in by email,
 * so a username becomes `<username>@login.klasilid.app`; a real email is used as typed.
 */
export function supabaseAuth(sb: SupabaseClient): AuthPort {
  return {
    async signIn(username, password) {
      const email = username.includes('@') ? username : `${username.toLowerCase()}@login.klasilid.app`;
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.status === 400 ? WRONG_LOGIN : "Can't reach Klasilid right now. Check the internet and try again.");
      const { data: p } = await sb.from('profiles').select('display_name').eq('id', data.user.id).maybeSingle();
      return { userId: data.user.id, displayName: p?.display_name ?? username };
    },
    async signOut() {
      await sb.auth.signOut();
    },
  };
}
