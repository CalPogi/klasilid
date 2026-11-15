import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { saveSeatPlan } from '../src/lib/seats';
import SeatPlan from '../src/pages/SeatPlan.svelte';
import { at, classDb } from './fixture';

const NOW = new Date(at('09:00'));
async function show() {
  const db = await classDb();
  await saveSeatPlan(db, 'c1', { rows: 2, cols: 2, seats: ['a', 'b', 'c', null] }, new Date(at('06:00', '2026-11-02')));
  render(SeatPlan, { db, classId: 'c1', teacherId: 't', now: () => NOW });
  await screen.findByRole('button', { name: /^Ana Abad,/ });
  return db;
}

it('shows a desk per seat with each learner status for the chosen session', async () => {
  await show();
  expect(await screen.findByRole('button', { name: 'Ana Abad, Present at 7:00 AM' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ben Bautista, Late at 7:20 AM' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Carla Castro, Absent' })).toBeTruthy();
  expect(screen.getByText('2 rows × 2 seats · 3 seated')).toBeTruthy();
});

it('the Late filter dims everyone who is not late', async () => {
  await show();
  await screen.findByRole('button', { name: /^Ana Abad/ });
  await fireEvent.click(screen.getByRole('button', { name: /^Late/ }));
  expect(screen.getByRole('button', { name: /^Ana Abad/ }).classList.contains('dim')).toBe(true);
  expect(screen.getByRole('button', { name: /^Ben Bautista/ }).classList.contains('dim')).toBe(false);
});

it('clicking a desk opens the correction modal for that learner', async () => {
  await show();
  await fireEvent.click(await screen.findByRole('button', { name: /^Carla Castro/ }));
  expect(screen.getByRole('dialog', { name: 'Carla Castro' })).toBeTruthy();
});

it('editor: click a chip then an empty seat places the learner; Save writes a new plan', async () => {
  const db = await show();
  await fireEvent.click(screen.getByRole('button', { name: 'Edit seat plan' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Clear seats' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Ana Abad' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Row 2 seat 2, empty' }));
  expect(screen.getByRole('button', { name: 'Row 2 seat 2, Ana Abad' })).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Save seat plan' }));
  await vi.waitFor(async () => expect(await db.seatPlans.count()).toBe(2));
});

it('editor: rows and seats steppers stop at 1 and 10', async () => {
  await show();
  await fireEvent.click(screen.getByRole('button', { name: 'Edit seat plan' }));
  const fewer = screen.getByRole('button', { name: 'Fewer rows' }) as HTMLButtonElement;
  await fireEvent.click(fewer);
  expect(fewer.disabled).toBe(true);
  expect(screen.getByText(/1 learner moved to Not seated|learners moved to Not seated/)).toBeTruthy();
  const more = screen.getByRole('button', { name: 'More seats per row' }) as HTMLButtonElement;
  for (let i = 0; i < 9; i++) await fireEvent.click(more);
  expect(more.disabled).toBe(true);
});
