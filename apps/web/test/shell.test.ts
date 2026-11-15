import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { expect, it } from 'vitest';
import Shell from '../src/components/Shell.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>page</p>' }));
const props = (over = {}) => ({ current: 'attendance' as const, className: 'Gr. 6 Diamond', pendingChanges: 0, children, ...over });

it('shows Today and Attendance as links and marks the current one', () => {
  render(Shell, props());
  const side = screen.getByRole('navigation', { name: 'Main' });
  const att = [...side.querySelectorAll('a')].find(a => a.textContent?.includes('Attendance'))!;
  expect(att.getAttribute('aria-current')).toBe('page');
  const today = [...side.querySelectorAll('a')].find(a => a.textContent?.includes('Today'))!;
  expect(today.getAttribute('aria-current')).toBeNull();
  expect(screen.getByText('Advisory · Gr. 6 Diamond')).toBeTruthy();
});

it('shows plan-2b pages as disabled with "Coming soon"', () => {
  render(Shell, props());
  const seat = screen.getAllByRole('button', { name: /Seat plan/ })[0] as HTMLButtonElement;
  expect(seat.disabled).toBe(true);
  expect(seat.title).toBe('Coming soon');
});

it('phone Menu toggles a dropdown and the icon state', async () => {
  render(Shell, props());
  const menu = screen.getByRole('button', { name: 'Menu' });
  expect(menu.getAttribute('aria-expanded')).toBe('false');
  await fireEvent.click(menu);
  expect(menu.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByRole('menu')).toBeTruthy();
  await fireEvent.click(menu);
  expect(screen.queryByRole('menu')).toBeNull();
});

it('shows "N changes waiting to sync" only when pendingChanges > 0', () => {
  const { unmount } = render(Shell, props());
  expect(screen.queryByText(/waiting to sync/)).toBeNull();
  unmount();
  render(Shell, props({ pendingChanges: 3 }));
  expect(screen.getByText('3 changes waiting to sync')).toBeTruthy();
});
