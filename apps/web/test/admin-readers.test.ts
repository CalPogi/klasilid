import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, expect, it, vi } from 'vitest';
import type { Overview } from '../src/lib/admin';
import AdminApp from '../src/pages/admin/AdminApp.svelte';
import { fakeAdmin, OVERVIEW } from './admin-helpers';
import { mockMatchMedia } from './phone-helpers';

const NOW = () => new Date('2026-11-19T00:02:00Z');
afterEach(() => mockMatchMedia(false));

const open = async (over: Parameters<typeof fakeAdmin>[0] = {}) => {
  const f = fakeAdmin(over);
  const onsignout = vi.fn();
  render(AdminApp, { sb: f.sb, onsignout, now: NOW });
  await screen.findByRole('heading', { name: 'Readers' });
  return { ...f, onsignout };
};

it('lists readers with class, school and last connected; retired ones greyed with "taps kept"', async () => {
  await open();
  const rows = screen.getAllByRole('row').slice(1);
  expect(rows[0].textContent).toContain('KD-0417');
  expect(rows[0].textContent).toContain('Gr. 6 Diamond · Maria Santos');
  expect(rows[0].textContent).toContain('San Isidro West Central School');
  expect(rows[0].textContent).toContain('2 min ago');
  expect(rows[1].textContent).toContain('Never connected');
  expect(rows[2].className).toContain('retired');
  expect(rows[2].textContent).toContain('Retired Nov 19 · taps kept');
  expect(within(rows[2]).queryByRole('button')).toBeNull();
});

it('Add reader shows the ID, key and pairing code once and they are gone after Done', async () => {
  const { calls } = await open();
  await fireEvent.click(screen.getByRole('button', { name: 'Add reader' }));
  const dialog = screen.getByRole('dialog', { name: 'Add a reader' });
  await fireEvent.change(within(dialog).getByLabelText('Class'), { target: { value: 'class-test' } });
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Add reader' }));
  const shown = await screen.findByRole('dialog', { name: 'Reader KD-0002 is ready' });
  expect(calls.find(c => c.action === 'addReader')).toMatchObject({ classId: 'class-test' });
  expect(shown.textContent).toContain('k3y-value');
  expect(shown.textContent).toContain('4802 7136');
  await fireEvent.click(within(shown).getByRole('button', { name: 'Done, I’ve copied them' }));
  await waitFor(() => expect(screen.queryByText('k3y-value')).toBeNull());
  expect(calls.filter(c => c.action === 'overview').length).toBe(2); // the list reloads
});

it('the add button is disabled while the request runs', async () => {
  let release!: () => void;
  const { calls } = await open({ hold: new Promise<void>(r => (release = r)) });
  await fireEvent.click(screen.getByRole('button', { name: 'Add reader' }));
  const dialog = screen.getByRole('dialog', { name: 'Add a reader' });
  const go = within(dialog).getByRole('button', { name: 'Add reader' });
  await fireEvent.click(go);
  await fireEvent.click(go);
  expect((go as HTMLButtonElement).disabled).toBe(true);
  release();
  await screen.findByRole('dialog', { name: /is ready/ });
  expect(calls.filter(c => c.action === 'addReader').length).toBe(1);
});

it('New key asks first, then shows the new key once', async () => {
  const { calls } = await open();
  await fireEvent.click(screen.getAllByRole('button', { name: 'New key' })[0]);
  const ask = screen.getByRole('dialog', { name: 'Make a new key for KD-0417?' });
  expect(calls.some(c => c.action === 'newReaderKey')).toBe(false);
  await fireEvent.click(within(ask).getByRole('button', { name: 'Make new key' }));
  const shown = await screen.findByRole('dialog', { name: 'New key for KD-0417' });
  expect(calls.find(c => c.action === 'newReaderKey')).toMatchObject({ readerId: 'KD-0417' });
  expect(shown.textContent).toContain('k3y-value');
});

it('Retire stays disabled until the reader id is typed exactly, then calls retireReader', async () => {
  const { calls } = await open();
  await fireEvent.click(screen.getAllByRole('button', { name: 'Retire' })[1]);
  const dialog = screen.getByRole('dialog', { name: 'Retire reader KD-0002?' });
  const go = within(dialog).getByRole('button', { name: 'Retire reader' }) as HTMLButtonElement;
  expect(go.disabled).toBe(true);
  await fireEvent.input(within(dialog).getByLabelText('Type KD-0002 to confirm'), { target: { value: 'kd-0002' } });
  expect(go.disabled).toBe(true);
  await fireEvent.input(within(dialog).getByLabelText('Type KD-0002 to confirm'), { target: { value: 'KD-0002' } });
  await fireEvent.click(go);
  await waitFor(() => expect(calls.find(c => c.action === 'retireReader')).toEqual({ action: 'retireReader', readerId: 'KD-0002', confirm: 'KD-0002' }));
});

it('a 403 sends the owner back to two-step', async () => {
  const f = fakeAdmin({ fail: { overview: [403, 'Two-step sign-in needed'] } });
  render(AdminApp, { sb: f.sb, onsignout: vi.fn(), now: NOW });
  expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeTruthy();
});

it('an account that is not the owner is signed out', async () => {
  const f = fakeAdmin({ fail: { overview: [403, 'Owner only'] } });
  const onsignout = vi.fn();
  render(AdminApp, { sb: f.sb, onsignout, now: NOW });
  await waitFor(() => expect(onsignout).toHaveBeenCalled());
});

it('offline shows the message and Retry reloads', async () => {
  const f = fakeAdmin({ fail: { overview: [0, ''] }, failOnce: true });
  render(AdminApp, { sb: f.sb, onsignout: vi.fn(), now: NOW });
  expect(await screen.findByText('Can’t reach Klasilid right now. Check the internet and try again.')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(await screen.findByRole('heading', { name: 'Readers' })).toBeTruthy();
});

it('on a phone the same section uses rows and the bottom bar', async () => {
  mockMatchMedia(true);
  await open();
  expect(screen.queryByRole('table')).toBeNull();
  const nav = screen.getByRole('navigation', { name: 'Admin' });
  expect(within(nav).getAllByRole('button').map(b => b.textContent?.trim())).toEqual(['Schools', 'Teachers', 'Readers', 'Menu']);
  expect(screen.getByText('Gr. 6 Diamond · 2 min ago')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Add reader' })).toBeTruthy();
});

it('shows nothing of the lists before two-step is done', async () => {
  const f = fakeAdmin({ levels: ['aal1', 'aal2'] });
  render(AdminApp, { sb: f.sb, onsignout: vi.fn(), now: NOW });
  expect(await screen.findByRole('heading', { name: 'Enter your code' })).toBeTruthy();
  expect(f.calls).toEqual([]);
  expect((OVERVIEW as Overview).readers.length).toBe(3);
});
