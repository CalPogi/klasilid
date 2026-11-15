import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import { classDay, type ClassDay } from '../src/lib/attendance';
import { applyTheme, attendanceCsv, saveTapWindows, setIgnoreRepeat, setReviewOutside } from '../src/lib/settings';
import { DEFAULT_WINDOWS, type SetupWindow } from '../src/lib/setup';
import Settings from '../src/pages/Settings.svelte';
import { at, classDb } from './fixture';

const NOW = new Date(at('09:00'));
const wins = (over: Partial<Record<string, Partial<SetupWindow>>> = {}): SetupWindow[] =>
  DEFAULT_WINDOWS.map(w => ({ ...w, ...(over[`${w.session}-${w.kind}`] ?? {}) }));

it('saveTapWindows rejects overlapping times with core messages and writes nothing', async () => {
  const db = await classDb();
  const errors = await saveTapWindows(db, 'c1', wins({ 'am-out': { opens: '07:45' } }), NOW);
  expect(errors).toContain('Morning out overlaps Morning in');
  expect(await db.outbox.count()).toBe(0);
});

it("saving twice today replaces today's windows; yesterday still uses the old ones", async () => {
  const db = await classDb();
  expect(await saveTapWindows(db, 'c1', wins({ 'am-in': { lateAfter: '07:30' } }), NOW)).toEqual([]);
  expect(await saveTapWindows(db, 'c1', wins({ 'am-in': { lateAfter: '07:45' } }), NOW)).toEqual([]);
  const today = (await db.tapWindows.toArray()).filter(w => w.effectiveFrom === '2026-11-13');
  expect(today).toHaveLength(4);
  expect(today.find(w => w.session === 'am' && w.kind === 'in')!.lateAfter).toBe(7 * 60 + 45);
  const ups = (await db.outbox.toArray()).filter(i => i.op.kind === 'upsert');
  expect(ups[0].op).toMatchObject({ table: 'tap_windows', onConflict: 'class_id,session,kind,effective_from' });
  const yesterday = await classDay(db, 'c1', '2026-11-12', new Date(at('20:00', '2026-11-12')));
  expect(yesterday.windows.find(w => w.session === 'am' && w.kind === 'in')!.lateAfter).toBe(7 * 60 + 15);
});

it('changing tap times during the day recalculates today', async () => {
  const db = await classDb();
  expect((await classDay(db, 'c1', '2026-11-13', NOW)).rows[1].am.status).toBe('late');      // Ben 07:20, late after 07:15
  await saveTapWindows(db, 'c1', wins({ 'am-in': { lateAfter: '07:30' } }), NOW);
  expect((await classDay(db, 'c1', '2026-11-13', NOW)).rows[1].am.status).toBe('on_time');
});

it('setIgnoreRepeat and setReviewOutside update the class and queue updates; classDay honours them', async () => {
  const db = await classDb();
  await db.taps.put({ id: 'x', deviceId: 'd', cardUid: 'AAAAAAAA', at: at('10:00'), clockSuspect: false });
  expect((await classDay(db, 'c1', '2026-11-13', NOW)).rows[0].review).toHaveLength(1);
  await setReviewOutside(db, 'c1', false);
  expect((await classDay(db, 'c1', '2026-11-13', NOW)).rows[0].review).toHaveLength(0);
  await setIgnoreRepeat(db, 'c1', 10);
  expect(await db.classes.get('c1')).toMatchObject({ ignoreRepeatMinutes: 10, reviewOutside: false });
  expect((await db.outbox.orderBy('seq').toArray()).map(i => i.op)).toEqual([
    { kind: 'update', table: 'classes', match: { id: 'c1' }, values: { review_outside: false } },
    { kind: 'update', table: 'classes', match: { id: 'c1' }, values: { ignore_repeat_minutes: 10 } },
  ]);
});

it('attendanceCsv quotes names with commas and uses grid letters', () => {
  const half = (status: string) => ({ status, flags: [] }) as never;
  const day = (date: string, rows: [string, string, string, string][]): ClassDay => ({
    date, dayType: 'school', needsSetup: false, windows: [], counts: { in: 0, late: 0, absent: 0, notYet: 0, total: 0 }, unknownTaps: [], suspectTaps: [],
    rows: rows.map(([id, first, am, pm]) => ({ learner: { id, firstName: first, lastName: 'Cruz, Jr.', sex: 'M' }, am: half(am), pm: half(pm), review: [], taps: [] })),
  });
  const csv = attendanceCsv([day('2026-11-12', [['a', 'Ana', 'on_time', 'on_time']]), day('2026-11-13', [['a', 'Ana', 'absent', 'absent']])]);
  expect(csv.split('\r\n')).toEqual(['Learner,2026-11-12,2026-11-13,Absent,Late', '"Cruz, Jr., Ana",P,A,1,0']);
});

it('applyTheme auto follows the device; the choice survives a reload', () => {
  applyTheme('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('kTheme')).toBe('dark');
  applyTheme('auto');
  expect(['light', 'dark']).toContain(document.documentElement.dataset.theme);
  expect(localStorage.getItem('kTheme')).toBe('auto');
});

it('the Tap times tab shows 10 time dropdowns and saving shows "Saved. Applies from today."', async () => {
  const db = await classDb();
  render(Settings, { db, classId: 'c1', userId: 't', now: () => NOW, onregister: () => {} });
  await screen.findByRole('tab', { name: 'Tap times' });
  expect(document.querySelectorAll('.win select').length).toBe(10);
  await fireEvent.click(screen.getByRole('button', { name: 'Save tap times' }));
  expect(await screen.findByText('Saved. Applies from today.')).toBeTruthy();
});

it('the Display tab switches the theme', async () => {
  const db = await classDb();
  render(Settings, { db, classId: 'c1', userId: 't', now: () => NOW, onregister: () => {} });
  await fireEvent.click(await screen.findByRole('tab', { name: 'Display and data' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  applyTheme('light');
});
