// Supabase Edge Function: POST /functions/v1/tap. Thin Deno wrapper; all logic lives in handler.ts.
// Deploy with --no-verify-jwt: readers authenticate with x-device-key, not a user login.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { handleTap } from './handler.ts';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  const result = await handleTap(req.headers, body, {
    findDevice: async id => {
      const { data, error } = await db.from('devices').select('key_hash').eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? { keyHash: data.key_hash } : null;
    },
    insertTaps: async rows => {
      if (rows.length === 0) return;
      const { error } = await db.from('taps').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    },
    now: () => new Date(),
  });
  return Response.json(result.body, { status: result.status });
});
