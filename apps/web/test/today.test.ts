import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import { recordCorrection } from '../src/lib/db';
import Today from '../src/pages/Today.svelte';
import { at, classDb } from './fixture';

const NOW = new Date(at('09:00'));
const show = async (db = undefined as Awaited<ReturnType<typeof classDb>> | undefined) => {
  const d = db ?? (await classDb());
  render(Today, { db: d, classId: 'c1', teacherId: 't', displayName: "Ma'am Test", now: () => NOW });
  return d;
};
const kpi = (name: string) => within(screen.getByRole('group', { name })).getByTestId('value').textContent;

afterEach(() => Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }));

it('Today shows the greeting and the four counts from classDay', async () => {
  await show();
  expect(await screen.findByText("Good morning, Ma'am Test")).toBeTruthy();
  await screen.findByRole('group', { name: 'In class' });
  expect([kpi('In class'), kpi('Late'), kpi('Absent'), kpi('Not yet')]).toEqual(['2', '1', '1', '0']);
  expect(screen.getByText('of 3 learners')).toBeTruthy();
  expect(screen.getByText('after 7:15 AM')).toBeTruthy();
});

it('Today lists needs-attention learners and opens the correction modal on click', async () => {
  await show();
  const item = await screen.findByRole('button', { name: /Carla Castro/ });
  expect(item.textContent).toContain('No tap this morning');
  await fireEvent.click(item);
  expect(screen.getByRole('dialog', { name: /Carla Castro/ })).toBeTruthy();
});

it('Today shows "Set up tap times" instead of counts when needsSetup', async () => {
  const db = await classDb();
  await db.tapWindows.clear();
  await show(db);
  expect(await screen.findByRole('link', { name: 'Set up tap times' })).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'In class' })).toBeNull();
});

it('Today shows the offline banner with the pending count when offline', async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  const db = await classDb();
  const c = { learnerId: 'c', classId: 'c1', date: '2026-11-13', session: 'am' as const, status: 'excused' as const, reason: 'sick' as const, createdBy: 't' };
  await recordCorrection(db, c);
  await recordCorrection(db, { ...c, session: 'pm' });
  await show(db);
  expect(await screen.findByText(/No internet right now/)).toBeTruthy();
  expect(await screen.findByText('2 changes')).toBeTruthy();
});

it('Today lists taps from unregistered cards and warns about a wrong reader clock', async () => {
  const db = await classDb();
  await db.taps.bulkPut([
    { id: 'u1', deviceId: 'd', cardUid: 'DEADBEEF', at: at('07:05'), clockSuspect: false },
    { id: 's1', deviceId: 'd', cardUid: 'CCCCCCCC', at: at('07:06'), clockSuspect: true },
  ]);
  await show(db);
  expect(await screen.findByText('DEADBEEF')).toBeTruthy();
  expect(screen.getByText(/The reader's clock looked wrong for 1 tap/)).toBeTruthy();
});

it('Today on a weekend or holiday says there are no classes instead of showing counts', async () => {
  const db = await classDb();
  render(Today, { db, classId: 'c1', teacherId: 't', displayName: 'T', now: () => new Date(at('09:00', '2026-11-15')) });
  expect(await screen.findByText('No classes today')).toBeTruthy();
  expect(screen.queryByRole('group', { name: 'In class' })).toBeNull();
});
