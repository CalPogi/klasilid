import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, seedDemo } from '../src/lib/demo';
import SeatEditPhone from '../src/pages/phone/SeatEditPhone.svelte';
import { mockMatchMedia } from './phone-helpers';

const NOW = new Date('2026-11-13T00:30:00Z');
const open = async () => {
  mockMatchMedia(true);
  const db = openDb('t-' + crypto.randomUUID());
  await seedDemo(db, NOW);
  location.hash = '#/seat';
  location.hash = '#/seat-edit';
  render(SeatEditPhone, { db, classId: DEMO_CLASS_ID, now: () => NOW });
  await screen.findAllByRole('button', { name: /^Row 1 seat 1/ });
  return db;
};
const chips = () => document.querySelectorAll('.m-unseated .uchip');
const seatPlanOps = async (db: Awaited<ReturnType<typeof open>>) => (await db.outbox.toArray()).filter(i => 'table' in i.op && i.op.table === 'seat_plans');

afterEach(() => { location.hash = ''; });

it('the steppers change the room size', async () => {
  await open();
  const rows = () => document.querySelector('.stepper[data-k="rows"] b')!.textContent;
  const before = Number(rows());
  await fireEvent.click(screen.getByRole('button', { name: 'More rows' }));
  expect(Number(rows())).toBe(before + 1);
});

it('a learner taken off a seat can be tapped onto an empty seat', async () => {
  await open();
  await fireEvent.click(screen.getAllByRole('button', { name: /^Row 1 seat 1, / })[0]);
  await fireEvent.click(screen.getByRole('button', { name: 'Remove from seat' }));
  expect(chips()).toHaveLength(1);
  await fireEvent.click(chips()[0]);
  expect(screen.getByText(/^Now tap a seat for /)).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Row 1 seat 1, empty' }));
  expect(chips()).toHaveLength(0);
});

it('Fill A–Z seats everyone', async () => {
  await open();
  await fireEvent.click(screen.getAllByRole('button', { name: /^Row 1 seat 1, / })[0]);
  await fireEvent.click(screen.getByRole('button', { name: 'Remove from seat' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Fill A–Z' }));
  expect(chips()).toHaveLength(0);
});

it('Save writes a new seat plan and goes back', async () => {
  const db = await open();
  await fireEvent.click(screen.getByRole('button', { name: 'Save seat plan' }));
  await vi.waitFor(async () => expect(await seatPlanOps(db)).toHaveLength(1));
  await vi.waitFor(() => expect(location.hash).toBe('#/seat'));
});

it('Cancel goes back and writes nothing', async () => {
  const db = await open();
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await vi.waitFor(() => expect(location.hash).toBe('#/seat'));
  expect(await seatPlanOps(db)).toHaveLength(0);
});

it('the bottom bar is hidden while editing seats', async () => {
  mockMatchMedia(true);
  location.hash = '#/seat-edit';
  render(App, { deps: { db: openDb('t-' + crypto.randomUUID()), mode: 'demo', auth: null, remote: null } });
  await screen.findByText('Edit seat plan', {}, { timeout: 3000 });
  expect(document.querySelector('.fnav')).toBeNull();
});
