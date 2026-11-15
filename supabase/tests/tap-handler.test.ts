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

describe('handleTap', () => {
  it('stores taps with id deviceId-seq and acks them', async () => {
    const r = await handleTap(headers(), body([tap(41), tap(42)]), deps);
    expect(r).toEqual({ status: 200, body: { acked: [41, 42] } });
    expect(stored.get('KD-0001-41')).toEqual({
      id: 'KD-0001-41', device_id: 'KD-0001', card_uid: '04A1B2C3',
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
    expect(first.body).toEqual({ acked: [7] });
    expect(second.body).toEqual({ acked: [7] });
    expect(stored.size).toBe(1);
  });

  it('clock reset (tappedAt 2000-01-01) is stored with clock_suspect true and acked', async () => {
    const r = await handleTap(headers(), body([tap(3, { tappedAt: '2000-01-01T00:00:05Z', clockSyncedAt: null })]), deps);
    expect(r.body).toEqual({ acked: [3] });
    expect(stored.get('KD-0001-3')).toMatchObject({ clock_suspect: true, clock_synced_at: null });
  });

  it('tappedAt more than 5 minutes ahead of now() → clock_suspect true', async () => {
    await handleTap(headers(), body([tap(4, { tappedAt: '2026-11-13T00:05:01Z' }), tap(5, { tappedAt: '2026-11-13T00:05:00Z' })]), deps);
    expect(stored.get('KD-0001-4')!.clock_suspect).toBe(true);
    expect(stored.get('KD-0001-5')!.clock_suspect).toBe(false);
  });

  it('unregistered card uid is stored', async () => {
    await handleTap(headers(), body([tap(8, { cardUid: 'DEADBEEF' })]), deps);
    expect(stored.get('KD-0001-8')!.card_uid).toBe('DEADBEEF');
  });

  it('lowercase uid is normalised to uppercase; non-hex uid → 400', async () => {
    await handleTap(headers(), body([tap(9, { cardUid: '04a1b2c3d4e5f6' })]), deps);
    expect(stored.get('KD-0001-9')!.card_uid).toBe('04A1B2C3D4E5F6');
    expect((await handleTap(headers(), body([tap(10, { cardUid: 'ZZZZZZZZ' })]), deps)).status).toBe(400);
  });

  it('malformed body → 400', async () => {
    for (const bad of [null, 'x', {}, { deviceId: 'KD-0001' }, body([tap(1, { seq: -1 })]), body([tap(1, { tappedAt: 'yesterday' })])]) {
      expect((await handleTap(headers(), bad, deps)).status).toBe(400);
    }
  });

  it('more than 500 taps → 400', async () => {
    const many = Array.from({ length: 501 }, (_, i) => tap(i));
    expect((await handleTap(headers(), body(many), deps)).status).toBe(400);
  });
});
