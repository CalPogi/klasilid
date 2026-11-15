import { expect, it, vi } from 'vitest';
import { supabaseRemote, RejectedError } from '../src/lib/remote-supabase';
import { supabaseAuth } from '../src/lib/session';

/** A stand-in for supabase-js that records which filters each table query used. */
function fakeClient(opts: { pushError?: { message: string; code?: string; status?: number } } = {}) {
  const filters: Record<string, string[]> = {};
  const query = (table: string) => {
    filters[table] = [];
    const q: any = {
      gt: (col: string) => { filters[table].push(`gt:${col}`); return q; },
      then: (res: (v: unknown) => void) => res({ data: [], error: null }),
    };
    return q;
  };
  const sb: any = {
    from: (table: string) => ({
      select: () => query(table),
      upsert: async () => ({ error: opts.pushError ?? null }),
    }),
    rpc: async () => ({ error: opts.pushError ?? null }),
    auth: { signOut: vi.fn(async () => ({ error: null })) },
  };
  return { sb, filters };
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
