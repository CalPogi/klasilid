// Reader roster endpoint logic (spec §8, §11): the class's own cards with short names, and today's tap windows.
// Pure: no Deno or Supabase imports, so it is tested in Node.
import { sameHash, sha256Hex } from '../tap/handler.ts';

export interface TapWindowRow {
  session: 'am' | 'pm';
  kind: 'in' | 'out';
  opens: number;
  late_after: number | null;
  closes: number;
  effective_from: string;
}

export interface RosterDeps {
  findDevice(id: string): Promise<{ keyHash: string; classId: string } | null>;
  /** Active cards of learners enrolled in the class on `today` (Manila date). */
  activeCards(classId: string, today: string): Promise<{ uid: string; firstName: string; lastName: string }[]>;
  windows(classId: string): Promise<TapWindowRow[]>;
  ignoreRepeat(classId: string): Promise<number>;
  now(): Date;
}

const manilaToday = (d: Date) => new Date(d.getTime() + 8 * 3600_000).toISOString().slice(0, 10);

/** Same rule as core's windowsForDate (copied: the Deno bundle can't import packages/core). */
function windowsFor(all: TapWindowRow[], date: string): TapWindowRow[] {
  const picked = new Map<string, TapWindowRow>();
  for (const w of all) {
    if (w.effective_from > date) continue;
    const cur = picked.get(`${w.session}-${w.kind}`);
    if (!cur || w.effective_from > cur.effective_from) picked.set(`${w.session}-${w.kind}`, w);
  }
  return [...picked.values()].sort((a, b) => a.opens - b.opens);
}

export async function handleRoster(headers: Headers, url: URL, deps: RosterDeps): Promise<{ status: number; body: unknown }> {
  const deviceId = url.searchParams.get('deviceId');
  if (!deviceId) return { status: 400, body: { error: 'deviceId is required' } };
  const key = headers.get('x-device-key');
  const device = key ? await deps.findDevice(deviceId) : null;
  if (!key || !device || !sameHash(await sha256Hex(key), device.keyHash)) return { status: 401, body: { error: 'unauthorized' } };

  const today = manilaToday(deps.now());
  const [cards, windows, ignoreRepeatMinutes] = await Promise.all([
    deps.activeCards(device.classId, today),
    deps.windows(device.classId),
    deps.ignoreRepeat(device.classId),
  ]);
  return {
    status: 200,
    body: {
      cards: cards.map(c => ({ uid: c.uid, name: `${c.firstName} ${c.lastName.charAt(0).toUpperCase()}.` })),
      windows: windowsFor(windows, today).map(w => ({ session: w.session, kind: w.kind, opens: w.opens, lateAfter: w.late_after, closes: w.closes })),
      ignoreRepeatMinutes,
    },
  };
}
