import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { openDb } from '../src/lib/db';
import { DEMO_CLASS_ID, seedDemo } from '../src/lib/demo';
import type { AuthPort } from '../src/lib/session';
import CalendarPhone from '../src/pages/phone/CalendarPhone.svelte';
import ProfilePhone from '../src/pages/phone/ProfilePhone.svelte';
import SettingsPhone from '../src/pages/phone/SettingsPhone.svelte';
import { mockMatchMedia } from './phone-helpers';

const NOW = new Date('2026-11-13T00:30:00Z');
const demo = async () => { mockMatchMedia(true); const db = openDb('t-' + crypto.randomUUID()); await seedDemo(db, NOW); return db; };
const ops = async (db: Awaited<ReturnType<typeof demo>>, table: string) => (await db.outbox.toArray()).filter(i => 'table' in i.op && i.op.table === table);

it('Settings refuses tap times in the wrong order and saves good ones', async () => {
  const db = await demo();
  render(SettingsPhone, { db, classId: DEMO_CLASS_ID, userId: 'u-1', now: () => NOW, onregister: vi.fn() });
  const late = await screen.findByLabelText('Morning in late after') as HTMLSelectElement;
  await fireEvent.change(late, { target: { value: '05:00' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save tap times' }));
  await vi.waitFor(() => expect(document.querySelector('.win-err')!.textContent!.length).toBeGreaterThan(0));
  expect(await ops(db, 'tap_windows')).toHaveLength(0);
  const opens = screen.getByLabelText('Morning in opens') as HTMLSelectElement;
  await fireEvent.change(late, { target: { value: opens.value === '06:30' ? '07:30' : '07:15' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save tap times' }));
  await vi.waitFor(async () => expect((await ops(db, 'tap_windows')).length).toBeGreaterThan(0));
});

it('Settings: Register a card starts bulk registration, and Dark switches the theme', async () => {
  const onregister = vi.fn();
  render(SettingsPhone, { db: await demo(), classId: DEMO_CLASS_ID, userId: 'u-1', now: () => NOW, onregister });
  await fireEvent.click(await screen.findByRole('button', { name: /Register a card/ }));
  expect(onregister).toHaveBeenCalledOnce();
  await fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
  await fireEvent.click(screen.getByRole('button', { name: 'Light' }));
});

it('Profile saves the display name and checks a new password', async () => {
  const db = await demo();
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am", username: 'maria.santos' } });
  const onrenamed = vi.fn();
  const auth: AuthPort = { signIn: vi.fn(), signOut: vi.fn(), changePassword: vi.fn() };
  render(ProfilePhone, { db, auth, session: { mode: 'online', userId: 'u-1', displayName: "Ma'am", username: 'maria.santos' }, onrenamed });
  await fireEvent.input(screen.getByLabelText('Display name'), { target: { value: "Ma'am Santos" } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(onrenamed).toHaveBeenCalledWith("Ma'am Santos"));
  expect(((await db.meta.get('user'))?.value as { displayName: string }).displayName).toBe("Ma'am Santos");
  await fireEvent.click(screen.getByRole('button', { name: /Change password/ }));
  await fireEvent.input(await screen.findByLabelText('New password'), { target: { value: 'short' } });
  await fireEvent.click(screen.getAllByRole('button', { name: 'Change password' }).at(-1)!); // the sheet's button
  expect(await screen.findByText('At least 8 characters', { selector: '.win-err' })).toBeTruthy();
  expect(auth.changePassword).not.toHaveBeenCalled();
});

it('School calendar: tapping a school day and choosing Holiday saves it', async () => {
  const db = await demo();
  const cls = (await db.classes.get(DEMO_CLASS_ID))!;
  render(CalendarPhone, { db, classId: DEMO_CLASS_ID, schoolYearId: cls.schoolYearId, now: () => NOW });
  await fireEvent.click((await screen.findAllByRole('button', { name: /, school day/ }))[0]);
  await fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Holiday' }));
  await vi.waitFor(async () => expect((await ops(db, 'calendar_days')).length).toBeGreaterThan(0));
});
