import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import { openDb } from '../src/lib/db';
import type { AuthPort } from '../src/lib/session';
import Account from '../src/pages/Account.svelte';

const auth = (): AuthPort => ({
  signIn: async () => ({ userId: 'u-1', displayName: "Ma'am Test" }),
  signOut: async () => {},
  changePassword: async (current: string) => { if (current !== 'right-one') throw new Error('Current password is wrong'); },
  setEmail: async () => {},
});
const session = { mode: 'online' as const, userId: 'u-1', displayName: "Ma'am Test", username: 'test.teacher' };
afterEach(() => Object.defineProperty(navigator, 'onLine', { value: true, configurable: true }));

it('saving the display name updates the sidebar name and queues a profiles update', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
  const onrenamed = vi.fn();
  render(Account, { db, auth: auth(), session, school: 'Test School', onrenamed });
  await fireEvent.input(screen.getByLabelText('Display name'), { target: { value: "Ma'am Lou" } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await vi.waitFor(() => expect(onrenamed).toHaveBeenCalledWith("Ma'am Lou"));
  expect((await db.meta.get('user'))?.value).toMatchObject({ displayName: "Ma'am Lou" });
  expect((await db.outbox.toArray())[0].op).toEqual({ kind: 'update', table: 'profiles', match: { id: 'u-1' }, values: { display_name: "Ma'am Lou" } });
  expect((screen.getByLabelText('Username') as HTMLInputElement).readOnly).toBe(true);
});

it('change password checks the 8-character minimum and the current password', async () => {
  render(Account, { db: openDb('t-' + crypto.randomUUID()), auth: auth(), session, school: 'Test School', onrenamed: vi.fn() });
  await fireEvent.input(screen.getByLabelText('Current password'), { target: { value: 'wrong' } });
  await fireEvent.input(screen.getByLabelText('New password'), { target: { value: 'short' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('At least 8 characters')).toBeTruthy();
  await fireEvent.input(screen.getByLabelText('New password'), { target: { value: 'long-enough-pw' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('Current password is wrong')).toBeTruthy();
  await fireEvent.input(screen.getByLabelText('Current password'), { target: { value: 'right-one' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText('Password changed')).toBeTruthy();
});

it("offline password change shows \"Can't change the password offline\"", async () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  render(Account, { db: openDb('t-' + crypto.randomUUID()), auth: auth(), session, school: 'Test School', onrenamed: vi.fn() });
  await fireEvent.input(screen.getByLabelText('Current password'), { target: { value: 'right-one' } });
  await fireEvent.input(screen.getByLabelText('New password'), { target: { value: 'long-enough-pw' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByText("Can't change the password offline")).toBeTruthy();
});

it('demo mode disables both panels with the note', () => {
  render(Account, { db: openDb('t-' + crypto.randomUUID()), auth: null, session: { ...session, mode: 'demo' }, school: '', onrenamed: vi.fn() });
  expect(screen.getByText('Accounts work once Klasilid is online.')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Change password' }) as HTMLButtonElement).disabled).toBe(true);
});
