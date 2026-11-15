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

it('the grid has a column for each school day of the month, skipping weekends and holidays', async () => {
  const db = await classDb();
  await db.calendarDays.put({ id: 'h', schoolYearId: 'sy', date: '2026-11-11', type: 'holiday', name: 'Test holiday' });
  render(Attendance, { db, classId: 'c1', teacherId: 't', displayName: 'T', now: () => NOW });
  await vi.waitFor(() => expect(document.querySelectorAll('#histTbl thead th').length).toBeGreaterThan(3));
  const heads = [...document.querySelectorAll('#histTbl thead th')].map(th => th.textContent);
  expect(heads.slice(0, 1)).toEqual(['Learner']);
  expect(heads.slice(1, -2)).toEqual(['M2', 'T3', 'W4', 'T5', 'F6', 'M9', 'T10', 'T12', 'F13']);
  expect(heads.slice(-2)).toEqual(['Absent', 'Late']);
  expect((screen.getByLabelText('Month') as HTMLSelectElement).tagName).toBe('SELECT');
});

it('a saved correction updates the cell and marks it corrected', async () => {
  const db = await classDb();
  render(Attendance, { db, classId: 'c1', teacherId: 't', displayName: 'T', now: () => NOW });
  const cell = await screen.findByRole('button', { name: /^Carla Castro, today/ });
  expect(cell.textContent).toBe('A');
  await fireEvent.click(cell);
  await fireEvent.click(screen.getByRole('radio', { name: 'Excused' }));
  await fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'sick' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save change' }));
  await vi.waitFor(() => expect(screen.getByRole('button', { name: /^Carla Castro, today.*corrected/ }).textContent).toBe('E'), { timeout: 5000 });
});
