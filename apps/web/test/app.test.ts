import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { fakeAdmin } from './admin-helpers';
import App from '../src/App.svelte';
import { openDb } from '../src/lib/db';
import { seedDemo } from '../src/lib/demo';
import type { AuthPort } from '../src/lib/session';
import type { Remote } from '../src/lib/sync';

it('opens from local data without waiting for the network (a hotspot with no internet never answers)', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await seedDemo(db, new Date());
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
  const hanging: Remote = { push: () => new Promise(() => {}), pull: () => new Promise(() => {}) };
  const auth: AuthPort = { signIn: async () => ({ userId: 'u-1', displayName: '' }), signOut: async () => {} };
  render(App, { deps: { db, mode: 'online', auth, remote: hanging } });
  expect(await screen.findByText(/Good (morning|afternoon), Ma'am Test/, {}, { timeout: 3000 })).toBeTruthy();
});

describe('owner', () => {
  const signInAsOwner = async () => {
    const db = openDb('t-' + crypto.randomUUID());
    await seedDemo(db, new Date());
    await db.meta.put({ key: 'owner', value: 'u-teacher' });
    const before = await db.meta.toArray();
    const f = fakeAdmin();
    const remote = { push: vi.fn(async () => {}), pull: vi.fn(async () => false) } as unknown as Remote;
    const auth: AuthPort = { signIn: async () => ({ userId: 'u-owner', displayName: 'Owner', ownerClient: f.sb }), signOut: vi.fn(async () => {}) };
    render(App, { deps: { db, mode: 'online', auth, remote } });
    await fireEvent.input(await screen.findByLabelText('Username'), { target: { value: 'owner' } });
    await fireEvent.input(screen.getByLabelText('Password'), { target: { value: 'long-password' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Readers' });
    return { db, before, remote, auth };
  };

  it('an owner session shows the admin section and starts no sync', async () => {
    const { remote } = await signInAsOwner();
    await new Promise(r => setTimeout(r, 50));
    expect(remote.push).not.toHaveBeenCalled();
    expect(remote.pull).not.toHaveBeenCalled();
    expect(screen.queryByText('Your advisory class')).toBeNull();
  });

  it('signing out of the owner session returns to sign-in and leaves local data as it was', async () => {
    const { db, before } = await signInAsOwner();
    await fireEvent.click(screen.getByRole('button', { name: /Klasilid owner/ }));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
    expect(await db.meta.toArray()).toEqual(before);
    expect(await db.learners.count()).toBeGreaterThan(0);
  });
});

it('Finish later closes the setup wizard and leaves a way back to it', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
  const auth: AuthPort = { signIn: async () => ({ userId: 'u-1', displayName: '' }), signOut: async () => {} };
  render(App, { deps: { db, mode: 'online', auth, remote: null } });
  await screen.findByRole('dialog', {}, { timeout: 3000 });
  await fireEvent.click(screen.getByRole('button', { name: 'Finish later' }));
  expect(await screen.findByRole('heading', { name: 'Your class isn’t set up yet' })).toBeTruthy();
  expect(screen.queryByRole('dialog')).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Set up your class' }));
  expect(screen.getByRole('dialog')).toBeTruthy();
});

it('does not rerun the first-time wizard once a class exists (it would create a second class)', async () => {
  const db = openDb('t-' + crypto.randomUUID());
  await seedDemo(db, new Date());
  await db.meta.put({ key: 'user', value: { userId: 'u-1', displayName: "Ma'am Test" } });
  const remote: Remote = { push: async () => {}, pull: () => new Promise(() => {}) };
  const auth: AuthPort = { signIn: async () => ({ userId: 'u-1', displayName: '' }), signOut: async () => {} };
  location.hash = '#/setup';
  render(App, { deps: { db, mode: 'online', auth, remote } });
  expect(await screen.findByText('Your class is already set up')).toBeTruthy();
  expect(screen.queryByText('Your advisory class')).toBeNull();
  location.hash = '';
});
