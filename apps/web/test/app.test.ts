import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
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
