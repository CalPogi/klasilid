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
const UID = /^[0-9A-F]{8}([0-9A-F]{6})?$/;
const EARLIEST = Date.parse('2026-01-01T00:00:00Z');
const FUTURE_SLACK_MS = 5 * 60_000;

export async function sha256Hex(s: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison of two hex strings. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const bad = (error: string): TapResult => ({ status: 400, body: { error } });
const unauthorized: TapResult = { status: 401, body: { error: 'unauthorized' } };
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

export async function handleTap(headers: Headers, body: unknown, deps: TapDeps): Promise<TapResult> {
  if (typeof body !== 'object' || body === null) return bad('body must be a JSON object');
  const { deviceId, taps } = body as { deviceId?: unknown; taps?: unknown };
  if (typeof deviceId !== 'string' || !Array.isArray(taps)) return bad('deviceId and taps are required');
  if (taps.length > MAX_TAPS) return bad(`at most ${MAX_TAPS} taps per request`);

  const key = headers.get('x-device-key');
  const device = key ? await deps.findDevice(deviceId) : null;
  if (!key || !device || !sameHash(await sha256Hex(key), device.keyHash)) return unauthorized;

  const latest = deps.now().getTime() + FUTURE_SLACK_MS;
  const rows: TapRow[] = [];
  for (const t of taps as Record<string, unknown>[]) {
    if (typeof t !== 'object' || t === null) return bad('each tap must be an object');
    const { seq, cardUid, tappedAt, clockSyncedAt } = t;
    if (!Number.isInteger(seq) || (seq as number) < 0) return bad('seq must be a non-negative integer');
    const uid = typeof cardUid === 'string' ? cardUid.toUpperCase() : '';
    if (!UID.test(uid)) return bad(`invalid cardUid for seq ${seq}`);
    if (!isIso(tappedAt)) return bad(`invalid tappedAt for seq ${seq}`);
    if (clockSyncedAt != null && !isIso(clockSyncedAt)) return bad(`invalid clockSyncedAt for seq ${seq}`);
    const at = Date.parse(tappedAt);
    rows.push({
      id: `${deviceId}-${seq}`,
      device_id: deviceId,
      card_uid: uid,
      tapped_at: new Date(at).toISOString(),
      clock_synced_at: clockSyncedAt == null ? null : new Date(Date.parse(clockSyncedAt)).toISOString(),
      // Never drop a tap over a bad clock: store it and flag it for the teacher (spec §8).
      clock_suspect: at < EARLIEST || at > latest,
    });
  }
  await deps.insertTaps(rows);
  return { status: 200, body: { acked: rows.map((_, i) => (taps[i] as { seq: number }).seq) } };
}
