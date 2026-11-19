// Supabase Edge Function: GET /functions/v1/roster?deviceId=. Thin Deno wrapper; all logic lives in handler.ts.
// Deploy with --no-verify-jwt: readers authenticate with x-device-key, not a user login.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleRoster } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const must = <T>({ data, error }: { data: T; error: unknown }): T => {
  if (error) throw error;
  return data;
};

Deno.serve(async req => {
  if (req.method !== 'GET') return new Response('method not allowed', { status: 405 });
  const result = await handleRoster(req.headers, new URL(req.url), {
    findDevice: async id => {
      const d = must(await db.from('devices').select('key_hash, class_id').eq('id', id).maybeSingle());
      return d ? { keyHash: d.key_hash, classId: d.class_id } : null;
    },
    activeCards: async (classId, today) => {
      const enrolled = must(
        await db.from('enrollments').select('learner_id').eq('class_id', classId).lte('joined_on', today)
          .or(`left_on.is.null,left_on.gt.${today}`),
      );
      const ids = (enrolled ?? []).map(e => e.learner_id);
      if (ids.length === 0) return [];
      const cards = must(
        await db.from('cards').select('uid, learners(first_name, last_name)').eq('active', true).in('learner_id', ids),
      );
      return (cards ?? []).map((c: any) => ({ uid: c.uid, firstName: c.learners.first_name, lastName: c.learners.last_name }));
    },
    windows: async classId => must(await db.from('tap_windows').select('session, kind, opens, late_after, closes, effective_from').eq('class_id', classId)) ?? [],
    ignoreRepeat: async classId => must(await db.from('classes').select('ignore_repeat_minutes').eq('id', classId).single()).ignore_repeat_minutes,
    markSeen: async id => { must(await db.from('devices').update({ last_seen_at: new Date().toISOString() }).eq('id', id)); },
    now: () => new Date(),
  });
  return Response.json(result.body, { status: result.status });
});
