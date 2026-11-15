import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, seedDemo } from '../src/lib/demo';
import Attendance from '../src/pages/Attendance.svelte';
import { at, classDb } from './fixture';

const NOW = new Date(at('20:00'));

it('Attendance pages 38 learners as 12 per page', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await seedDemo(db, NOW);
  render(Attendance, { db, classId: DEMO_CLASS_ID, teacherId: 't', displayName: 'T', now: () => NOW });
  expect(await screen.findByText('Page 1 of 4')).toBeTruthy();
  const body = () => screen.getAllByRole('rowgroup')[1];
  expect(within(body()).getAllByRole('row')).toHaveLength(12);
  await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
  expect(screen.getByText('Page 4 of 4')).toBeTruthy();
  expect(within(body()).getAllByRole('row')).toHaveLength(2);
});

it('Attendance day select lists school days newest first, skipping weekends and holidays', async () => {
  const db = await classDb();
  await db.calendarDays.put({ id: 'h', schoolYearId: 'sy', date: '2026-11-11', type: 'holiday', name: 'Test holiday' });
  render(Attendance, { db, classId: 'c1', teacherId: 't', displayName: 'T', now: () => NOW });
  const day = (await screen.findByLabelText('Day')) as HTMLSelectElement;
  await vi.waitFor(() => expect(day.options.length).toBeGreaterThan(5));
  expect([...day.options].slice(0, 5).map(o => o.textContent)).toEqual(['Today · Fri, Nov 13', 'Thu, Nov 12', 'Tue, Nov 10', 'Mon, Nov 9', 'Fri, Nov 6']);
  expect((screen.getByLabelText('Month') as HTMLSelectElement).tagName).toBe('SELECT');
});

it('a saved correction updates the row status and shows "corrected"', async () => {
  const db = await classDb();
  render(Attendance, { db, classId: 'c1', teacherId: 't', displayName: 'T', now: () => NOW });
  await fireEvent.click(await screen.findByRole('button', { name: 'Change Carla Castro morning' }));
  await fireEvent.change(screen.getByLabelText('New status'), { target: { value: 'excused' } });
  await fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'sick' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
  const row = (await screen.findByText('corrected')).closest('tr')!;
  expect(within(row).getByText('Carla Castro')).toBeTruthy();
  expect(within(row).getByRole('button', { name: 'Change Carla Castro morning' }).textContent).toContain('Excused');
});
