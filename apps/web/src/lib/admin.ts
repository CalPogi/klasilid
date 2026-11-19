// The owner's admin section (docs/2026-11-19-admin-design.md): two-step sign-in and calls to the `admin` function.
import type { SupabaseClient } from '@supabase/supabase-js';

/** What the `admin` function's overview returns (supabase/functions/admin/handler.ts). No learner data. */
export interface Overview {
  schools: { id: string; name: string; codeMadeAt: string | null; advisers: number }[];
  teachers: {
    id: string; displayName: string; username: string; schoolId: string | null; schoolName: string | null;
    classes: { id: string; grade: number; section: string; subject: string }[];
  }[];
  readers: {
    id: string; classId: string; className: string; teacherName: string; schoolName: string;
    lastSeenAt: string | null; firmware: string | null; retiredAt: string | null;
  }[];
}

export const OFFLINE = 'Can’t reach Klasilid right now. Check the internet and try again.';
export const NEED_TWO_STEP = 'Two-step sign-in needed';
export const OWNER_ONLY = 'Owner only';

/** A refusal or failure from the admin function; status 0 when it couldn't be reached. */
export class AdminError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Calls one admin action. Throws AdminError with the server's message (or OFFLINE). */
export async function adminCall<T>(sb: SupabaseClient, action: string, body: object = {}): Promise<T> {
  const { data, error } = await sb.functions.invoke('admin', { body: { action, ...body } });
  if (!error) return data as T;
  const res = (error as { context?: unknown }).context;
  if (!(res instanceof Response)) throw new AdminError(OFFLINE, 0);
  const message = await res.json().then(j => (typeof j?.message === 'string' ? j.message : ''), () => '');
  throw new AdminError(message || OFFLINE, res.status);
}

const MANILA: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' };
/** 'Nov 19' (Manila date). */
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', MANILA);
/** 'just now', '2 min ago', '5 h ago', else the date. */
export function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return shortDate(iso);
}

export const ENDED = 'Your admin sign-in ended. Sign in again.';

export type TwoStepNeed = 'setup' | 'code' | 'done' | 'ended';

/** done: this session already passed the second step; code: a factor exists, ask for its code; setup: none yet;
 *  ended: there is no session any more (signed out elsewhere, or its refresh failed). */
export async function twoStepNeed(sb: SupabaseClient): Promise<TwoStepNeed> {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (!data.currentLevel) return 'ended';
  if (data.currentLevel === 'aal2') return 'done';
  return data.nextLevel === 'aal2' ? 'code' : 'setup';
}

/** Starts a new authenticator. A setup left halfway leaves an unverified factor behind; it is removed first. */
export async function startSetup(sb: SupabaseClient): Promise<{ factorId: string; qr: string; secret: string }> {
  const listed = await sb.auth.mfa.listFactors();
  if (listed.error) throw listed.error;
  for (const f of listed.data.all) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      const { error } = await sb.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw error;
    }
  }
  const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Klasilid admin' });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Checks a 6-digit code; with no factorId, uses the account's verified authenticator. True when accepted. */
export async function verifyCode(sb: SupabaseClient, factorId: string | null, code: string): Promise<boolean> {
  let id = factorId;
  if (!id) {
    const { data, error } = await sb.auth.mfa.listFactors();
    if (error) throw error;
    id = data.totp[0]?.id ?? null;
    if (!id) return false;
  }
  const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: id, code });
  return !error;
}
