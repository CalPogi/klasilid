// The owner's admin section (docs/2026-11-19-admin-design.md): two-step sign-in and calls to the `admin` function.
import type { SupabaseClient } from '@supabase/supabase-js';

export type TwoStepNeed = 'setup' | 'code' | 'done';

/** done: this session already passed the second step; code: a factor exists, ask for its code; setup: none yet. */
export async function twoStepNeed(sb: SupabaseClient): Promise<TwoStepNeed> {
  const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
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
