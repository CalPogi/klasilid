// Supabase Edge Function: POST /functions/v1/signup. Thin Deno wrapper; all logic lives in handler.ts.
// Deploy with --no-verify-jwt: the caller has no account yet. Public sign-up is off in Supabase Auth, so this is
// the only way a teacher account is made.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleSignup, pickYear } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, apikey' };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS });
  // ponytail: first x-forwarded-for entry, as the plan says; check before release that a client can't set it (Task 6).
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const body = await req.json().catch(() => null);
  const result = await handleSignup(body, ip, {
    schoolForCodeHash: async hash => {
      const r = must(await db.from('school_signup_codes').select('school_id, schools(name)').eq('code_hash', hash).maybeSingle());
      return r ? { schoolId: r.school_id, schoolName: (r as any).schools.name } : null;
    },
    currentYear: async (schoolId, today) => {
      const years = must(await db.from('school_years').select('id, starts_on, ends_on').eq('school_id', schoolId)) ?? [];
      return pickYear(years.map(y => ({ id: y.id, startsOn: y.starts_on, endsOn: y.ends_on })), today);
    },
    startAttempt: async ip => {
      const [r] = must(await db.rpc('begin_signup_attempt', { p_ip: ip })) as { attempt_id: number; failures: number }[];
      return { id: r.attempt_id, failures: r.failures };
    },
    clearAttempt: async id => { must(await db.from('signup_attempts').update({ ok: true }).eq('id', id)); },
    createTeacher: async ({ email, password, displayName, schoolId }) => {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) {
        if (error.status === 422 || /already/i.test(error.message)) return { taken: true };
        throw error;
      }
      const { error: pe } = await db.from('profiles').insert({ id: data.user.id, role: 'teacher', display_name: displayName, school_id: schoolId });
      if (pe) {
        await db.auth.admin.deleteUser(data.user.id); // no account without a profile
        throw pe;
      }
      return { userId: data.user.id };
    },
    now: () => new Date(),
  });
  return Response.json(result.body, { status: result.status, headers: CORS });
});
