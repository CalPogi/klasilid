// Final-review fixes for the phone app (plan 6d): each test reproduces a reviewer finding.
import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';
import { historyIdle } from '../src/lib/back';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, DEMO_TEACHER_ID, seedDemo } from '../src/lib/demo';
import PhoneApp from '../src/pages/phone/PhoneApp.svelte';
import SeatPlanPhone from '../src/pages/phone/SeatPlanPhone.svelte';
import StudentPhone from '../src/pages/phone/StudentPhone.svelte';
import { existsSync, readFileSync } from 'node:fs';
import { mockMatchMedia } from './phone-helpers';

const NOW = new Date('2026-11-13T00:30:00Z');
const demo = async () => { const db = openDb('t-' + crypto.randomUUID()); await seedDemo(db, NOW); return db; };
const demoApp = () => render(App, { deps: { db: openDb('t-' + crypto.randomUUID()), mode: 'demo', auth: null, remote: null } });

beforeEach(async () => { mockMatchMedia(true); await historyIdle(); });
afterEach(() => { location.hash = ''; });

it('C1: the phone app shows the update banner on its screens', async () => {
  const fallback = createRawSnippet(() => ({ render: () => '<p>fallback</p>' }));
  render(PhoneApp, {
    current: 'today', fallback,
    ctx: { db: await demo(), classId: DEMO_CLASS_ID, className: 'Gr. 6 Sampaguita', schoolYearId: '', session: { mode: 'demo', userId: DEMO_TEACHER_ID, displayName: "Ma'am" },
      mode: 'demo', auth: null, now: () => NOW, register: vi.fn(), pageKey: 0, rename: vi.fn(), update: { kind: 'android', version: '0.8.0', url: 'https://example.invalid/a.apk' } },
  } as never);
  const banner = await screen.findByText('A new version of Klasilid is ready (version 0.8.0).');
  expect(banner.closest('.scr')).toBeTruthy();
});

it('I1: closing the setup wizard on a phone keeps what was entered', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
  const auth = { signIn: async () => ({ userId: 'u-1', displayName: '' }), signOut: async () => {} };
  render(App, { deps: { db, mode: 'online', auth, remote: null } as never });
  const section = await screen.findByLabelText('Section', {}, { timeout: 3000 }) as HTMLSelectElement;
  await fireEvent.change(section, { target: { value: 'Ruby' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Finish later' }));
  await vi.waitFor(() => expect(location.hash).toBe('#/today'));
  await new Promise(r => setTimeout(r, 100));
  expect((screen.getByLabelText('Section') as HTMLSelectElement).value).toBe('Ruby');
});

it('I2: a tab tapped while the Menu is open closes the Menu and leaves no stray history step', async () => {
  demoApp();
  await fireEvent.click(await screen.findByRole('button', { name: 'Menu' }, { timeout: 3000 }));
  await fireEvent.click(screen.getByRole('button', { name: 'Advisory' }));
  await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Menu' }).getAttribute('aria-expanded')).toBe('false'));
  await historyIdle();
  history.back(); // one back from Advisory returns to Home, not to a dead menu entry
  await vi.waitFor(() => expect(location.hash).not.toBe('#/seat'));
  expect(history.state?.klSheet).toBeFalsy();
});

it('I3: the closed Menu is inert; opening it focuses its first item and closing returns focus', async () => {
  demoApp();
  const button = await screen.findByRole('button', { name: 'Menu' }, { timeout: 3000 });
  const menu = document.querySelector('.mdrop')!;
  // browsers reflect `inert` as an attribute; jsdom only keeps the property Svelte sets
  const inert = () => menu.hasAttribute('inert') || (menu as HTMLElement & { inert?: boolean }).inert === true;
  expect(inert()).toBe(true);
  await fireEvent.click(button);
  expect(inert()).toBe(false);
  await vi.waitFor(() => expect(document.activeElement?.textContent).toBe('Profile'));
  await fireEvent.click(button);
  await vi.waitFor(() => expect(document.activeElement).toBe(button));
  expect(inert()).toBe(true);
});

it('M1: a bad past-day link or unknown learner replaces itself instead of trapping back', async () => {
  const db = await demo();
  const before = history.length;
  render(SeatPlanPhone, { db, classId: DEMO_CLASS_ID, teacherId: DEMO_TEACHER_ID, now: () => NOW, date: 'nonsense' });
  await vi.waitFor(() => expect(location.hash).toBe('#/attendance'));
  render(StudentPhone, { db, classId: DEMO_CLASS_ID, teacherId: DEMO_TEACHER_ID, now: () => NOW, mode: 'demo', id: 'nobody', onregister: vi.fn() });
  await vi.waitFor(() => expect(location.hash).toBe('#/students'));
  expect(history.length).toBe(before);
});

it('M4: full-screen heights fall back to vh on WebViews without dvh', () => {
  const css = readFileSync(['apps/web/src/styles/phone.css', 'src/styles/phone.css'].find(p => existsSync(p))!, 'utf8');
  expect(css).toMatch(/height:100vh;height:100dvh/);
  expect(css).toMatch(/max-height:86vh;max-height:86dvh/);
});
