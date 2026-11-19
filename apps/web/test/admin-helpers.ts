// Fakes shared by the admin tests.

/** A stand-in for supabase-js `auth.mfa`, recording calls. Right code: 123456. */
export function fakeMfa(opts: { levels?: [string, string]; factors?: { id: string; status: string }[] } = {}) {
  const calls: string[] = [];
  const factors = opts.factors ?? [];
  const mfa = {
    async getAuthenticatorAssuranceLevel() { return { data: { currentLevel: opts.levels?.[0] ?? 'aal1', nextLevel: opts.levels?.[1] ?? 'aal1' }, error: null }; },
    async listFactors() {
      return { data: { all: factors.map(f => ({ ...f, factor_type: 'totp' })), totp: factors.filter(f => f.status === 'verified').map(f => ({ ...f, factor_type: 'totp' })) }, error: null };
    },
    async unenroll({ factorId }: { factorId: string }) { calls.push(`unenroll ${factorId}`); return { data: {}, error: null }; },
    async enroll() {
      calls.push('enroll');
      return { data: { id: 'f-new', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg></svg>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://x' } }, error: null };
    },
    async challengeAndVerify({ factorId, code }: { factorId: string; code: string }) {
      calls.push(`verify ${factorId} ${code}`);
      return code === '123456' ? { data: {}, error: null } : { data: null, error: { message: 'Invalid TOTP code entered' } };
    },
  };
  return { sb: { auth: { mfa } } as never, calls };
}
