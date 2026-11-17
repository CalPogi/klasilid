import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, DEMO_TEACHER_ID, seedDemo } from '../src/lib/demo';
import HomePhone from '../src/pages/phone/HomePhone.svelte';
import { mockMatchMedia } from './phone-helpers';

const MORNING = new Date('2026-11-13T00:30:00Z'); // 8:30 AM Manila, Fri Nov 13
const open = async (now = MORNING, onregister = vi.fn()) => {
  mockMatchMedia(true);
  const db = openDb('t-' + crypto.randomUUID());
  await seedDemo(db, MORNING);
  render(HomePhone, { db, classId: DEMO_CLASS_ID, teacherId: DEMO_TEACHER_ID, displayName: "Ma'am", now: () => now, onregister });
  return { db, onregister };
};

it('shows the big count, the attention list with short names, and the To do list', async () => {
  await open();
  expect(await screen.findByText('of 38 in class')).toBeTruthy();
  const rows = [...document.querySelectorAll('.rows .rowi .txt b')].map(b => b.textContent);
  expect(rows.length).toBeGreaterThan(0);
  for (const n of rows) expect(n).toMatch(/^[A-Z][a-z]+ [A-Z]\.$/);
  expect(screen.getByText('Pair your door reader')).toBeTruthy();
});

it('each To do tick is a 44 px button with a pressed state', async () => {
  await open();
  await screen.findByText('Pair your door reader');
  const ticks = [...document.querySelectorAll('.todo button.tickhit')];
  expect(ticks.length).toBeGreaterThan(0);
  expect(ticks[0].getAttribute('aria-pressed')).toBe('false');
  await fireEvent.click(ticks[0]);
  expect(ticks[0].getAttribute('aria-pressed')).toBe('true');
});

it('tapping a learner who needs attention opens the correction sheet', async () => {
  await open();
  await screen.findByText('of 38 in class');
  await fireEvent.click(document.querySelector('.rows .rowi')!);
  expect(await screen.findByRole('dialog')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Save change' })).toBeTruthy();
});

it('the bell lists the same notices as the laptop', async () => {
  await open();
  await screen.findByText('of 38 in class');
  await fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
  expect(await screen.findByRole('heading', { name: 'Notifications' })).toBeTruthy();
});

it('on a weekend it says there are no classes', async () => {
  await open(new Date('2026-11-14T00:30:00Z'));
  expect(await screen.findByText('No classes today')).toBeTruthy();
});
