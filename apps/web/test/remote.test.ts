import { expect, it, vi } from 'vitest';
import { supabaseRemote, RejectedError } from '../src/lib/remote-supabase';
import { supabaseAuth } from '../src/lib/session';

/** A stand-in for supabase-js that records which filters each table query used. */
function fakeClient(opts: { pushError?: { message: string; code?: string; status?: number }; uploadError?: { message: string; statusCode?: string } } = {}) {
  const filters: Record<string, string[]> = {};
  const query = (table: string) => {
    filters[table] = [];
    const q: any = {
      gt: (col: string) => { filters[table].push(`gt:${col}`); return q; },
      then: (res: (v: unknown) => void) => res({ data: [], error: null }),
    };
    return q;
  };
  const calls: unknown[] = [];
  const sb: any = {
    from: (table: string) => ({
      select: () => query(table),
      upsert: async (row: unknown, o: unknown) => { calls.push(['upsert', table, row, o]); return { error: opts.pushError ?? null }; },
      update: (values: unknown) => ({ match: async (m: unknown) => { calls.push(['update', table, values, m]); return { error: null }; } }),
      delete: () => ({ match: async (m: unknown) => { calls.push(['delete', table, m]); return { error: null }; } }),
    }),
    storage: { from: (bucket: string) => ({ upload: async (path: string, blob: unknown, o: unknown) => { calls.push(['upload', bucket, path, o]); return { error: opts.uploadError ?? null }; } }) },
    rpc: async () => ({ error: opts.pushError ?? null }),
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  };
  return { sb, filters, calls };
}

it('pull asks for every correction, whatever the last pull time (device clocks stamp created_at)', async () => {
  const { sb, filters } = fakeClient();
  await supabaseRemote(sb).pull('2026-11-13T04:00:00.000Z');
  expect(filters.attendance_corrections).toEqual([]);
  expect(filters.taps).toEqual(['gt:received_at']);
});

it('a server refusal (permission, constraint, bad input) is a RejectedError; a network failure is not', async () => {
  const refused = fakeClient({ pushError: { message: 'new row violates row-level security policy', code: '42501' } });
  await expect(supabaseRemote(refused.sb).push({ kind: 'rpc', fn: 'add_learner', args: {} })).rejects.toBeInstanceOf(RejectedError);
  const offline = fakeClient({ pushError: { message: 'TypeError: Failed to fetch', code: '' } });
  const e = await supabaseRemote(offline.sb).push({ kind: 'rpc', fn: 'add_learner', args: {} }).catch(x => x);
  expect(e).toBeInstanceOf(Error);
  expect(e).not.toBeInstanceOf(RejectedError);
});

it('sign-out clears the login on this device even with no internet', async () => {
  const { sb } = fakeClient();
  await supabaseAuth(sb).signOut();
  expect(sb.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
});

it('update and delete use match filters; upsert passes onConflict', async () => {
  const { sb, calls } = fakeClient();
  const r = supabaseRemote(sb);
  await r.push({ kind: 'update', table: 'enrollments', match: { id: 'e1' }, values: { left_on: '2026-11-14' } });
  await r.push({ kind: 'delete', table: 'calendar_days', match: { school_year_id: 'sy', date: '2026-11-20' } });
  await r.push({ kind: 'upsert', table: 'calendar_days', row: { date: '2026-11-20' }, onConflict: 'school_year_id,date' });
  expect(calls).toEqual([
    ['update', 'enrollments', { left_on: '2026-11-14' }, { id: 'e1' }],
    ['delete', 'calendar_days', { school_year_id: 'sy', date: '2026-11-20' }],
    ['upsert', 'calendar_days', { date: '2026-11-20' }, { onConflict: 'school_year_id,date' }],
  ]);
});

it('an upload reads the photo from this device; with no local photo it is a RejectedError', async () => {
  const { openDb } = await import('../src/lib/db');
  const db = openDb('t-' + crypto.randomUUID());
  const { sb, calls } = fakeClient();
  const r = supabaseRemote(sb, db);
  await expect(r.push({ kind: 'upload', bucket: 'excuse-letters', path: 'c1/x.jpg', correctionId: 'x' })).rejects.toBeInstanceOf(RejectedError);
  await db.photos.put({ correctionId: 'x', blob: new Blob(['jpg']), name: 'x.jpg' });
  await r.push({ kind: 'upload', bucket: 'excuse-letters', path: 'c1/x.jpg', correctionId: 'x' });
  expect(calls).toEqual([['upload', 'excuse-letters', 'c1/x.jpg', { upsert: false, contentType: 'image/jpeg' }]]);
});

it('a retried upload that finds the letter already stored (409) counts as done', async () => {
  const { openDb } = await import('../src/lib/db');
  const db = openDb('t-' + crypto.randomUUID());
  await db.photos.put({ correctionId: 'x', blob: new Blob(['jpg']), name: 'x.jpg' });
  const { sb } = fakeClient({ uploadError: { message: 'The resource already exists', statusCode: '409' } });
  await expect(supabaseRemote(sb, db).push({ kind: 'upload', bucket: 'excuse-letters', path: 'c1/x.jpg', correctionId: 'x' })).resolves.toBeUndefined();
});
