// Reader upload endpoint logic (spec §8, §9). Pure: no Deno or Supabase imports, so it is tested in Node.

export interface TapRow {
  id: string;
  device_id: string;
  card_uid: string;
  tapped_at: string;
  clock_synced_at: string | null;
  clock_suspect: boolean;
}

export interface TapDeps {
  findDevice(id: string): Promise<{ keyHash: string } | null>;
  /** Must ignore rows whose id already exists (on conflict do nothing). */
  insertTaps(rows: TapRow[]): Promise<void>;
  now(): Date;
}

export type TapResult = { status: number; body: unknown };

const MAX_TAPS = 500;
const UID = /^[0-9A-F]{8}([0-9A-F]{6}([0-9A-F]{6})?)?$/; // 4, 7 or 10-byte UIDs
/** ISO 8601 with an explicit Z or offset; a bare wall-clock time would be stored 8 hours off. */
const ISO_TZ = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/;
const EARLIEST = Date.parse('2026-01-01T00:00:00Z');
const FUTURE_SLACK_MS = 5 * 60_000;

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const bad = (error: string): TapResult => ({ status: 400, body: { error } });
const unauthorized: TapResult = { status: 401, body: { error: 'unauthorized' } };
const readableTime = (v: unknown): number | null =>
  typeof v === 'string' && ISO_TZ.test(v) && !Number.isNaN(Date.parse(v)) ? Date.parse(v) : null;

export async function handleTap(headers: Headers, body: unknown, deps: TapDeps): Promise<TapResult> {
  if (typeof body !== 'object' || body === null) return bad('body must be a JSON object');
  const { deviceId, taps } = body as { deviceId?: unknown; taps?: unknown };
  if (typeof deviceId !== 'string' || !Array.isArray(taps)) return bad('deviceId and taps are required');
  if (taps.length > MAX_TAPS) return bad(`at most ${MAX_TAPS} taps per request`);

  const key = headers.get('x-device-key');
  const device = key ? await deps.findDevice(deviceId) : null;
  if (!key || !device || !sameHash(await sha256Hex(key), device.keyHash)) return unauthorized;

  const now = deps.now().getTime();
  const rows: TapRow[] = [];
  const acked: number[] = [];
  const rejected: number[] = [];
  // Each tap is handled on its own so one bad tap never blocks the reader's queue.
  for (const t of taps as unknown[]) {
    if (typeof t !== 'object' || t === null) return bad('each tap must be an object');
    const { seq, cardUid, tappedAt, clockSyncedAt } = t as Record<string, unknown>;
    if (!Number.isInteger(seq) || (seq as number) < 0) return bad('seq must be a non-negative integer');
    const uid = typeof cardUid === 'string' ? cardUid.toUpperCase() : '';
    if (!UID.test(uid)) {
      rejected.push(seq as number); // the reader can drop it; there is no card to attribute it to
      continue;
    }
    const at = readableTime(tappedAt);
    const synced = readableTime(clockSyncedAt);
    // The time is part of the id, so a wiped reader that restarts its sequence never collides with old taps,
    // while a retry of the same tap (same seq, same time) still deduplicates.
    const stamp = at !== null ? String(at) : `x${(await sha256Hex(String(tappedAt))).slice(0, 12)}`;
    rows.push({
      id: `${deviceId}-${seq}-${stamp}`,
      device_id: deviceId,
      card_uid: uid,
      // Never drop a tap over a bad clock: store it and flag it for the teacher (spec §8).
      tapped_at: new Date(at ?? now).toISOString(),
      clock_synced_at: synced === null ? null : new Date(synced).toISOString(),
      clock_suspect: at === null || at < EARLIEST || at > now + FUTURE_SLACK_MS,
    });
    acked.push(seq as number);
  }
  await deps.insertTaps(rows);
  return { status: 200, body: { acked, rejected } };
}
