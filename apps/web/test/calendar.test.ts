import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import { classDay } from '../src/lib/attendance';
import { monthCells, PH_HOLIDAYS, setDayType } from '../src/lib/calendar';
import { openDb } from '../src/lib/db';
import { applySetup, DEFAULT_WINDOWS } from '../src/lib/setup';
import Calendar from '../src/pages/Calendar.svelte';
import { at, classDb } from './fixture';

const NOW = new Date(at('20:00'));

it('PH_HOLIDAYS has no weekend dates and includes Bonifacio Day 2026-11-30', () => {
  for (const h of PH_HOLIDAYS) expect([0, 6], h.date).not.toContain(new Date(h.date + 'T00:00:00Z').getUTCDay());
  expect(PH_HOLIDAYS).toContainEqual({ date: '2026-11-30', name: 'Bonifacio Day' });
  expect(PH_HOLIDAYS).toContainEqual({ date: '2027-04-09', name: 'Araw ng Kagitingan' });
});

it('setDayType holiday then school upserts then deletes, both queued', async () => {
  const db = await classDb();
  await setDayType(db, 'sy', '2026-11-20', 'holiday', 'Town fiesta');
  expect(await db.calendarDays.where('date').equals('2026-11-20').toArray()).toMatchObject([{ type: 'holiday', name: 'Town fiesta' }]);
  await setDayType(db, 'sy', '2026-11-20', 'school');
  expect(await db.calendarDays.where('date').equals('2026-11-20').count()).toBe(0);
  const ops = (await db.outbox.orderBy('seq').toArray()).map(i => i.op);
  expect(ops[0]).toMatchObject({ kind: 'upsert', table: 'calendar_days', onConflict: 'school_year_id,date', row: { school_year_id: 'sy', date: '2026-11-20', type: 'holiday', name: 'Town fiesta' } });
  expect(ops[1]).toMatchObject({ kind: 'delete', table: 'calendar_days', match: { school_year_id: 'sy', date: '2026-11-20' } });
});

it('marking a day with taps as a holiday makes nobody absent and keeps the taps; back to school restores', async () => {
  const db = await classDb();
  await setDayType(db, 'sy', '2026-11-13', 'holiday');
  const hol = await classDay(db, 'c1', '2026-11-13', NOW);
  expect(hol.counts.absent).toBe(0);
  expect(await db.taps.count()).toBe(2);
  await setDayType(db, 'sy', '2026-11-13', 'school');
  expect((await classDay(db, 'c1', '2026-11-13', NOW)).counts).toMatchObject({ in: 2, absent: 1 });
});

it('monthCells gives one cell per date and past school days an attendance %', async () => {
  const db = await classDb();
  await setDayType(db, 'sy', '2026-11-30', 'holiday', 'Bonifacio Day');
  const cells = await monthCells(db, 'c1', '2026-11', '2026-11-13', NOW);
  expect(cells).toHaveLength(30);
  expect(cells[0]).toMatchObject({ date: '2026-11-01', weekend: true });
  expect(cells.find(c => c.date === '2026-11-13')).toMatchObject({ isToday: true, kind: null });
  expect(cells.find(c => c.date === '2026-11-12')!.pct).toBe(0);        // nobody tapped on Nov 12 in the fixture
  expect(cells.find(c => c.date === '2026-11-30')).toMatchObject({ kind: 'holiday', name: 'Bonifacio Day', past: false });
});

it('the page groups Dec 21–23 Christmas break into one Special days row', async () => {
  const db = await classDb();
  for (const d of ['2026-12-21', '2026-12-22', '2026-12-23']) await setDayType(db, 'sy', d, 'holiday', 'Christmas break');
  render(Calendar, { db, classId: 'c1', schoolYearId: 'sy', now: () => new Date(at('09:00', '2026-12-01')) });
  expect(await screen.findByText('21–23')).toBeTruthy();
  expect(screen.getByText('Holiday · 3 days')).toBeTruthy();
});

it('clicking a day opens the day menu and choosing Half day updates the card', async () => {
  const db = await classDb();
  render(Calendar, { db, classId: 'c1', schoolYearId: 'sy', now: () => NOW });
  await fireEvent.click(await screen.findByRole('button', { name: 'November 20, school day' }));
  await fireEvent.click(screen.getByRole('menuitemradio', { name: 'Half day' }));
  expect(await screen.findByRole('button', { name: 'November 20, Half day' })).toBeTruthy();
});

it('applySetup queues the preloaded holidays for the new school year', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await applySetup(db, {
    schoolName: 'Test School', yearLabel: 'SY 2026–2027', startsOn: '2026-06-01', endsOn: '2027-04-30', grade: 6, section: 'Diamond',
    rows: 8, cols: 5, windows: DEFAULT_WINDOWS.map(w => ({ ...w })), learners: [{ lastName: 'Abad', firstName: 'Ana', sex: 'F' }],
  }, new Date('2026-11-13T00:00:00Z'));
  expect(await db.calendarDays.count()).toBe(PH_HOLIDAYS.length);
  const ups = (await db.outbox.toArray()).filter(i => i.op.kind === 'upsert' && i.op.table === 'calendar_days');
  expect(ups).toHaveLength(PH_HOLIDAYS.length);
});
