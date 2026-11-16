import { beforeEach, expect, it } from 'vitest';
import { handleRoster, type RosterDeps } from '../functions/roster/handler';
import { sha256Hex } from '../functions/tap/handler';

const KEY = 'reader-secret-key';
let deps: RosterDeps;
let askedToday: string | undefined;
// 2026-11-12T23:10Z is 07:10 on Nov 13 in Manila
const NOW = new Date('2026-11-12T23:10:00Z');

beforeEach(async () => {
  const keyHash = await sha256Hex(KEY);
  askedToday = undefined;
  deps = {
    findDevice: async id => (id === 'KD-0001' ? { keyHash, classId: 'c1' } : null),
    activeCards: async (classId, today) => {
      askedToday = today;
      return classId === 'c1' ? [{ uid: '04A1B2C3', firstName: 'Ana', lastName: 'abad' }, { uid: '04B2C3D4E5F601', firstName: 'Ben', lastName: 'Bautista' }] : [];
    },
    windows: async () => [
      { session: 'am', kind: 'in', opens: 390, late_after: 420, closes: 480, effective_from: '2026-06-01' }, // superseded
      { session: 'am', kind: 'in', opens: 390, late_after: 435, closes: 480, effective_from: '2026-11-13' }, // in effect today
      { session: 'am', kind: 'in', opens: 400, late_after: 450, closes: 480, effective_from: '2026-11-14' }, // tomorrow
      { session: 'pm', kind: 'out', opens: 960, late_after: null, closes: 1050, effective_from: '2026-06-01' },
    ],
    ignoreRepeat: async () => 3,
    now: () => NOW,
  };
});

const headers = (key = KEY) => new Headers({ 'x-device-key': key });
const url = (q = '?deviceId=KD-0001') => new URL('https://x.supabase.co/functions/v1/roster' + q);

it('returns short names for active cards of enrolled learners and today’s windows', async () => {
  const r = await handleRoster(headers(), url(), deps);
  expect(askedToday).toBe('2026-11-13');
  expect(r).toEqual({
    status: 200,
    body: {
      cards: [{ uid: '04A1B2C3', name: 'Ana A.' }, { uid: '04B2C3D4E5F601', name: 'Ben B.' }],
      windows: [
        { session: 'am', kind: 'in', opens: 390, lateAfter: 435, closes: 480 },
        { session: 'pm', kind: 'out', opens: 960, lateAfter: null, closes: 1050 },
      ],
      ignoreRepeatMinutes: 3,
    },
  });
});

it('wrong key or unknown device → 401', async () => {
  expect((await handleRoster(headers('nope'), url(), deps)).status).toBe(401);
  expect((await handleRoster(headers(), url('?deviceId=KD-9999'), deps)).status).toBe(401);
  expect((await handleRoster(new Headers(), url(), deps)).status).toBe(401);
});

it('missing deviceId → 400', async () => {
  expect((await handleRoster(headers(), url(''), deps)).status).toBe(400);
});
