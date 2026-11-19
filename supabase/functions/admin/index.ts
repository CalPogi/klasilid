// Supabase Edge Function: POST /functions/v1/admin. Thin Deno wrapper; all logic lives in handler.ts.
// Deploy WITH JWT verification (no --no-verify-jwt). The token's signature is also checked here (auth.getClaims),
// so a wrong deploy flag can't open the admin section. handler.ts then requires aal2 and the owner role.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { callerOf, handleAdmin, type Overview } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type, authorization, apikey, x-client-info' };

/** Claims of a token whose signature checks out (signing keys, or Auth's own check for legacy secrets); else null. */
async function verify(token: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await db.auth.getClaims(token);
  return error || !data ? null : (data.claims as Record<string, unknown>);
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: CORS });
  const body = await req.json().catch(() => null);
  try {
    const result = await handleAdmin(await callerOf(req.headers.get('authorization'), verify), body, {
      roleOf: async id => must(await db.from('profiles').select('role').eq('id', id).maybeSingle())?.role ?? null,
      overview: async () => must(await db.rpc('admin_overview')) as Overview,
      addSchool: async name => must(await db.from('schools').insert({ name }).select('id').single()).id,
      schoolExists: async id => !!must(await db.from('schools').select('id').eq('id', id).maybeSingle()),
      setSchoolCode: async (schoolId, hash) => {
        must(await db.from('school_signup_codes')
          .upsert({ school_id: schoolId, code_hash: hash, created_at: new Date().toISOString() }, { onConflict: 'school_id' }));
      },
      classExists: async id => !!must(await db.from('classes').select('id').eq('id', id).maybeSingle()),
      readerExists: async id => !!must(await db.from('devices').select('id').eq('id', id).maybeSingle()),
      insertReader: async r => {
        must(await db.from('devices').insert({ id: r.id, class_id: r.classId, key_hash: r.keyHash, pairing_token_hash: r.tokenHash }));
      },
      setReaderSecrets: async (id, keyHash, tokenHash) =>
        (must(await db.from('devices').update({ key_hash: keyHash, pairing_token_hash: tokenHash })
          .eq('id', id).is('retired_at', null).select('id')) ?? []).length > 0,
      retireReader: async (id, actor) => must(await db.rpc('admin_retire_reader', { p_id: id, p_actor: actor })) as boolean,
      usernameOf: async id => {
        const p = must(await db.from('profiles').select('role').eq('id', id).maybeSingle());
        if (p?.role !== 'teacher') return null;
        const { data, error } = await db.auth.admin.getUserById(id);
        if (error) throw error;
        return data.user.email?.split('@')[0] ?? null;
      },
      deleteTeacher: async (id, actor) => {
        const r = must(await db.rpc('admin_delete_teacher', { p_teacher: id, p_actor: actor })) as { classIds: string[] };
        return { classIds: r.classIds };
      },
      removeClassPhotos: async classIds => {
        const left: string[] = [];
        for (const classId of classIds) {
          try {
            for (;;) {
              const files = must(await db.storage.from('excuse-letters').list(classId, { limit: 1000 })) ?? [];
              if (files.length === 0) break;
              const removed = must(await db.storage.from('excuse-letters').remove(files.map(f => `${classId}/${f.name}`))) ?? [];
              if (removed.length === 0) throw new Error('nothing removed'); // e.g. sub-folders: stop instead of looping
            }
          } catch {
            left.push(classId);
          }
        }
        return left;
      },
      audit: async (action, rowId, actor) => {
        must(await db.from('audit_log').insert({ table_name: 'admin', row_id: rowId, action, actor }));
      },
    });
    return Response.json(result.body, { status: result.status, headers: CORS });
  } catch (e) {
    console.error(e);
    return Response.json({ message: 'Something went wrong. Try again.' }, { status: 500, headers: CORS });
  }
});
