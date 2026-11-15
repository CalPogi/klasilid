import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { expect, it, vi } from 'vitest';
import Shell from '../src/components/Shell.svelte';

const children = createRawSnippet(() => ({ render: () => '<p>page</p>' }));
const props = (over = {}) => ({
  current: 'attendance' as const, className: 'Gr. 6 Diamond', userName: "Ma'am Lou", children,
  classes: [{ label: 'Advisory · Gr. 6 Diamond', advisory: true }], ...over,
});
const nav = () => screen.getByRole('navigation', { name: 'Main' });
const link = (name: string) => [...nav().querySelectorAll('a')].find(a => a.textContent?.trim() === name)!;

it('has every sidebar entry from the mockup and marks the current one', () => {
  render(Shell, props());
  for (const name of ['Today', 'Seat plan', 'Attendance', 'Students', 'Report card grades', 'Reports', 'School calendar', 'Door reader', 'Settings'])
    expect(link(name), name).toBeTruthy();
  expect(link('Attendance').getAttribute('aria-current')).toBe('page');
  expect(link('Today').getAttribute('aria-current')).toBeNull();
  expect(screen.getByText('Advisory · Gr. 6 Diamond', { selector: '.glabel' })).toBeTruthy();
});

it('My classes starts closed and opens', async () => {
  render(Shell, props());
  const toggle = screen.getByRole('button', { name: /My classes/ });
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.getElementById('clsList')!.hidden).toBe(true);
  await fireEvent.click(toggle);
  expect(document.getElementById('clsList')!.hidden).toBe(false);
});

it('the account button opens a menu with Sign out', async () => {
  const onsignout = vi.fn();
  render(Shell, props({ onsignout }));
  const me = screen.getByRole('button', { name: /Ma'am Lou/ });
  expect(screen.getByText('ML')).toBeTruthy();
  await fireEvent.click(me);
  expect(me.getAttribute('aria-expanded')).toBe('true');
  await fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(onsignout).toHaveBeenCalledOnce();
});

it('the menu button opens the sidebar on small screens', async () => {
  render(Shell, props());
  const btn = screen.getByRole('button', { name: 'Open menu' });
  await fireEvent.click(btn);
  expect(btn.getAttribute('aria-expanded')).toBe('true');
  expect(document.querySelector('.app')!.classList.contains('nav-open')).toBe(true);
});
