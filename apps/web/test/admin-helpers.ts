// Fakes shared by the admin tests. Names, codes and keys are made up.
import type { Overview } from '../src/lib/admin';

export const OVERVIEW: Overview = {
  schools: [{ id: 'school-1', name: 'San Isidro West Central School', codeMadeAt: '2026-11-18T03:00:00Z', advisers: 2 }],
  teachers: [
    { id: 'teacher-1', displayName: 'Maria Santos', username: 'msantos', schoolId: 'school-1', schoolName: 'San Isidro West Central School',
      classes: [{ id: 'class-diamond', grade: 6, section: 'Diamond', subject: 'Advisory' }] },
    { id: 'teacher-2', displayName: 'Test Adviser', username: 'test-adviser', schoolId: 'school-1', schoolName: 'San Isidro West Central School',
      classes: [{ id: 'class-test', grade: 6, section: 'Test', subject: 'Advisory' }] },
  ],
  readers: [
    { id: 'KD-0417', classId: 'class-diamond', className: 'Gr. 6 Diamond', teacherName: 'Maria Santos', schoolName: 'San Isidro West Central School',
      lastSeenAt: '2026-11-19T00:00:00Z', firmware: null, retiredAt: null },
    { id: 'KD-0002', classId: 'class-test', className: 'Gr. 6 Test', teacherName: 'Test Adviser', schoolName: 'San Isidro West Central School',
      lastSeenAt: null, firmware: null, retiredAt: null },
    { id: 'KD-0105', classId: 'class-diamond', className: 'Gr. 6 Diamond', teacherName: 'Maria Santos', schoolName: 'San Isidro West Central School',
      lastSeenAt: '2026-11-10T00:00:00Z', firmware: null, retiredAt: '2026-11-19T00:00:00Z' },
  ],
};

/** A supabase client stand-in for the admin section: aal2 by default, `functions.invoke('admin')` answers from OVERVIEW. */
export function fakeAdmin(opts: {
  levels?: [string, string]; hold?: Promise<void>; fail?: Record<string, [number, string]>; failOnce?: boolean;
} = {}) {
  const calls: Record<string, unknown>[] = [];
  const failed = new Set<string>();
  const answers: Record<string, unknown> = {
    overview: OVERVIEW,
    addReader: { id: 'KD-0002', key: 'k3y-value', pairingCode: '48027136' },
    newReaderKey: { key: 'k3y-value', pairingCode: '48027136' },
    retireReader: { ok: true },
    addSchool: { schoolId: 'school-2', code: 'QK7P-4XWN' },
    newSchoolCode: { code: 'QK7P-4XWN' },
    deleteTeacher: { ok: true, photosLeft: [] },
    removeClassPhotos: { photosLeft: [] },
  };
  const mfa = fakeMfa({ levels: opts.levels ?? ['aal2', 'aal2'], factors: [{ id: 'f-1', status: 'verified' }] });
  const sb = {
    auth: { ...(mfa.sb as { auth: object }).auth, async signOut() { return { error: null }; } },
    functions: {
      async invoke(name: string, { body }: { body: Record<string, unknown> }) {
        calls.push(body);
        const action = String(body.action);
        if (action !== 'overview' && opts.hold) await opts.hold;
        const f = opts.fail?.[action];
        if (f && !(opts.failOnce && failed.has(action))) {
          failed.add(action);
          const context = f[0] ? new Response(JSON.stringify({ message: f[1] }), { status: f[0] }) : undefined;
          return { data: null, error: Object.assign(new Error(f[0] ? 'Edge Function returned a non-2xx status code' : 'Failed to send a request'), { context }) };
        }
        return { data: answers[action], error: null };
      },
    },
  };
  return { sb: sb as never, calls, answers };
}

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
