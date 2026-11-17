import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it } from 'vitest';
import App from '../src/App.svelte';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, DEMO_TEACHER_ID, seedDemo } from '../src/lib/demo';
import AttendancePhone from '../src/pages/phone/AttendancePhone.svelte';
import SeatPlanPhone from '../src/pages/phone/SeatPlanPhone.svelte';
import { mockMatchMedia } from './phone-helpers';

const NOW = new Date('2026-11-13T00:30:00Z'); // 8:30 AM Manila, Fri Nov 13
const demo = async () => { mockMatchMedia(true); const db = openDb('t-' + crypto.randomUUID()); await seedDemo(db, NOW); return db; };
const seat = async (date?: string) => render(SeatPlanPhone, { db: await demo(), classId: DEMO_CLASS_ID, teacherId: DEMO_TEACHER_ID, now: () => NOW, date });

afterEach(() => { location.hash = ''; });

it('the seat plan shows the mockup desks with short names, and a late desk hides the "Late ·" prefix', async () => {
  await seat();
  await screen.findAllByRole('button', { name: /, (Present|Late|Absent|Not yet)/ });
  const grid = document.getElementById('mDesks')!;
  const desks = [...grid.querySelectorAll('button.desk')];
  expect(desks.length).toBeGreaterThan(0);
  expect(desks.every(d => /^[A-Z][a-z]+ [A-Z]\.$/.test(d.querySelector('b')!.textContent!))).toBe(true);
  expect(grid.querySelector('button.desk.late .lt')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Edit seat plan' })).toBeTruthy();
});

it('tapping a desk opens the correction sheet', async () => {
  await seat();
  const [first] = await screen.findAllByRole('button', { name: /, (Present|Late|Absent|Not yet)/ });
  await fireEvent.click(first);
  expect(await screen.findByRole('button', { name: 'Save change' })).toBeTruthy();
});

it('a past school day shows that day with no edit button', async () => {
  await seat('2026-11-12');
  expect(await screen.findByText(/past school day/)).toBeTruthy();
  expect(screen.getByText('Thursday, November 12')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit seat plan' })).toBeNull();
  expect(await screen.findByText('Tap a seat to correct this day. A reason is required.')).toBeTruthy();
});

it('a day in an earlier month works too', async () => {
  await seat('2026-10-30');
  expect(await screen.findByText(/past school day/)).toBeTruthy();
});

it('a weekend or holiday says there were no classes', async () => {
  await seat('2026-11-08'); // a Sunday before "today"
  expect(await screen.findByText('No classes on this day')).toBeTruthy();
});

it('a broken or future date goes back to Attendance', async () => {
  await seat('nonsense');
  await vi_waitHash('#/attendance');
  location.hash = '';
  await seat('2026-12-01');
  await vi_waitHash('#/attendance');
});

it('attendance lists school days; tapping one opens that day', async () => {
  render(AttendancePhone, { db: await demo(), classId: DEMO_CLASS_ID, now: () => NOW });
  expect(await screen.findByText('School days')).toBeTruthy();
  const rows = await screen.findAllByRole('button', { name: /present/ });
  await fireEvent.click(rows[0]);
  expect(location.hash).toBe('#/day?date=2026-11-13');
});

it('the Report card tab says coming in the next update under the Advisory tabs', async () => {
  mockMatchMedia(true);
  location.hash = '#/grades';
  render(App, { deps: { db: openDb('t-' + crypto.randomUUID()), mode: 'demo', auth: null, remote: null } });
  expect(await screen.findByText('Coming in the next update', {}, { timeout: 3000 })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Report card' }).getAttribute('aria-current')).toBe('page');
});

async function vi_waitHash(h: string) {
  const { vi } = await import('vitest');
  await vi.waitFor(() => expect(location.hash).toBe(h));
}
