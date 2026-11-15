import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, seedDemo } from '../src/lib/demo';
import Students from '../src/pages/Students.svelte';
import { at, classDb } from './fixture';

const NOW = new Date(at('09:00'));
const show = async (db?: Awaited<ReturnType<typeof classDb>>) => {
  const d = db ?? (await classDb());
  render(Students, { db: d, classId: 'c1', teacherId: 't', now: () => NOW, mode: 'demo' });
  await screen.findByRole('button', { name: 'Carla Castro' });
  return d;
};

it('lists learners with status, card and attendance columns, 11 per page', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await seedDemo(db, NOW);
  render(Students, { db, classId: DEMO_CLASS_ID, teacherId: 't', now: () => NOW, mode: 'demo' });
  expect(await screen.findByText('Page 1 of 4')).toBeTruthy();
  const heads = [...document.querySelectorAll('#stuTbl thead th')].map(th => th.textContent);
  expect(heads).toEqual(['Learner', 'Status', 'RFID card', 'Parent account', 'Attendance', '']);
  expect(within(document.querySelector('#stuTbl tbody') as HTMLElement).getAllByRole('row')).toHaveLength(11);
});

it('the drawer opens from a row and its Correct button opens the correction modal', async () => {
  await show();
  await fireEvent.click(screen.getByRole('button', { name: 'Carla Castro' }));
  const drawer = screen.getByRole('dialog', { name: 'Carla Castro' });
  expect(within(drawer).getAllByText(/Not yet|Absent/).length).toBeGreaterThan(0);
  await fireEvent.click(within(drawer).getByRole('button', { name: 'Correct' }));
  expect(screen.getAllByRole('dialog').some(d => d.classList.contains('modal'))).toBe(true);
});

it('Add student saves the learner and lists them', async () => {
  const db = await show();
  await fireEvent.click(screen.getByRole('button', { name: /Add student/ }));
  await fireEvent.input(screen.getByLabelText('Full name'), { target: { value: 'Domingo, Dino R.' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Add and register card' }));
  expect(await screen.findByRole('button', { name: 'Dino Domingo' })).toBeTruthy();
  expect(await db.learners.count()).toBe(4);
});

it('Transferred out moves the learner to the Transferred out filter', async () => {
  await show();
  await fireEvent.click(screen.getByRole('button', { name: 'Carla Castro' }));
  await fireEvent.click(within(screen.getByRole('dialog', { name: 'Carla Castro' })).getByRole('button', { name: 'Transferred out' }));
  await fireEvent.input(screen.getByLabelText('New school'), { target: { value: 'Cauayan South CS' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'left' } });
  await vi.waitFor(() => expect([...document.querySelectorAll('#stuTbl tbody tr')].map(r => r.textContent)).toEqual([expect.stringContaining('Carla Castro')]));
});
