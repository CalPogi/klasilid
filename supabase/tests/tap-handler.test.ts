import { beforeEach, describe, expect, it } from 'vitest';
import { handleTap, sha256Hex, type TapDeps, type TapRow } from '../functions/tap/handler';

const KEY = 'reader-secret-key';
let stored: Map<string, TapRow>;
let deps: TapDeps;
const NOW = new Date('2026-11-13T00:00:00Z');

beforeEach(async () => {
  stored = new Map();
  const keyHash = await sha256Hex(KEY);
  deps = {
    findDevice: async id => (id === 'KD-0001' ? { keyHash } : null),
    insertTaps: async rows => { for (const r of rows) if (!stored.has(r.id)) stored.set(r.id, r); },
    now: () => NOW,
  };
});

const headers = (key = KEY) => new Headers({ 'x-device-key': key });
const tap = (seq: number, over: Record<string, unknown> = {}) =>
  ({ seq, cardUid: '04A1B2C3', tappedAt: '2026-11-12T23:10:02Z', clockSyncedAt: '2026-11-12T21:00:00Z', ...over });
const body = (taps: unknown[], deviceId = 'KD-0001') => ({ deviceId, taps });
/** id = deviceId-seq-tappedAtMillis, so a reused seq (wiped reader) never collides with an old tap */
const ID = (seq: number, at = '2026-11-12T23:10:02Z') => `KD-0001-${seq}-${Date.parse(at)}`;

describe('handleTap', () => {
  it('stores taps with id deviceId-seq and acks them', async () => {
    const r = await handleTap(headers(), body([tap(41), tap(42)]), deps);
    expect(r).toEqual({ status: 200, body: { acked: [41, 42], rejected: [] } });
    expect(stored.get(ID(41))).toEqual({
      id: ID(41), device_id: 'KD-0001', card_uid: '04A1B2C3',
      tapped_at: '2026-11-12T23:10:02.000Z', clock_synced_at: '2026-11-12T21:00:00.000Z', clock_suspect: false,
    });
  });

  it('wrong key → 401, nothing stored', async () => {
    const r = await handleTap(headers('nope'), body([tap(1)]), deps);
    expect(r.status).toBe(401);
    expect(stored.size).toBe(0);
  });

  it('missing key → 401', async () => {
    expect((await handleTap(new Headers(), body([tap(1)]), deps)).status).toBe(401);
  });

  it('unknown device → 401', async () => {
    expect((await handleTap(headers(), body([tap(1)], 'KD-9999'), deps)).status).toBe(401);
  });

  it('same batch sent twice → one row each, both acked', async () => {
    const first = await handleTap(headers(), body([tap(7)]), deps);
    const second = await handleTap(headers(), body([tap(7)]), deps);
    expect(first.body).toEqual({ acked: [7], rejected: [] });
    expect(second.body).toEqual({ acked: [7], rejected: [] });
    expect(stored.size).toBe(1);
  });

  it('clock reset (tappedAt 2000-01-01) is stored with clock_suspect true and acked', async () => {
    const r = await handleTap(headers(), body([tap(3, { tappedAt: '2000-01-01T00:00:05Z', clockSyncedAt: null })]), deps);
    expect(r.body).toEqual({ acked: [3], rejected: [] });
    expect(stored.get(ID(3, '2000-01-01T00:00:05Z'))).toMatchObject({ clock_suspect: true, clock_synced_at: null });
  });

  it('tappedAt more than 5 minutes ahead of now() → clock_suspect true', async () => {
    await handleTap(headers(), body([tap(4, { tappedAt: '2026-11-13T00:05:01Z' }), tap(5, { tappedAt: '2026-11-13T00:05:00Z' })]), deps);
    expect(stored.get(ID(4, '2026-11-13T00:05:01Z'))!.clock_suspect).toBe(true);
    expect(stored.get(ID(5, '2026-11-13T00:05:00Z'))!.clock_suspect).toBe(false);
  });

  it('unregistered card uid is stored', async () => {
    await handleTap(headers(), body([tap(8, { cardUid: 'DEADBEEF' })]), deps);
    expect(stored.get(ID(8))!.card_uid).toBe('DEADBEEF');
  });

  it('lowercase uid is normalised to uppercase; 10-byte uids are accepted', async () => {
    await handleTap(headers(), body([tap(9, { cardUid: '04a1b2c3d4e5f6' }), tap(11, { cardUid: '04A1B2C3D4E5F6A7B8C9' })]), deps);
    expect(stored.get(ID(9))!.card_uid).toBe('04A1B2C3D4E5F6');
    expect(stored.get(ID(11))!.card_uid).toBe('04A1B2C3D4E5F6A7B8C9');
  });

  it('a garbage uid is rejected for that tap only; the rest are stored', async () => {
    const r = await handleTap(headers(), body([tap(10, { cardUid: 'ZZZZZZZZ' }), tap(12)]), deps);
    expect(r).toEqual({ status: 200, body: { acked: [12], rejected: [10] } });
    expect([...stored.keys()]).toEqual([ID(12)]);
  });

  it('an unreadable or timezone-less tappedAt is stored with server time and clock_suspect', async () => {
    const r = await handleTap(headers(), body([
      tap(20, { tappedAt: '2026-13-45T99:00:00Z' }), tap(21, { tappedAt: '2026-11-13 07:10:02' }), tap(22, { tappedAt: 'yesterday' }),
    ]), deps);
    expect(r.body).toEqual({ acked: [20, 21, 22], rejected: [] });
    const rows = [...stored.values()];
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).toMatchObject({ tapped_at: NOW.toISOString(), clock_suspect: true });
  });

  it('a reused seq with a different time (wiped reader) is stored as a new tap', async () => {
    await handleTap(headers(), body([tap(1)]), deps);
    await handleTap(headers(), body([tap(1, { tappedAt: '2026-11-13T23:05:00Z' })]), deps);
    expect(stored.size).toBe(2);
  });

  it('malformed body → 400', async () => {
    for (const bad of [null, 'x', {}, { deviceId: 'KD-0001' }, body([tap(1, { seq: -1 })]), body(['not a tap'])]) {
      expect((await handleTap(headers(), bad, deps)).status).toBe(400);
    }
  });

  it('more than 500 taps → 400', async () => {
    const many = Array.from({ length: 501 }, (_, i) => tap(i));
    expect((await handleTap(headers(), body(many), deps)).status).toBe(400);
  });
});
