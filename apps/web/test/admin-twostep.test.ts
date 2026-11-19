import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { startSetup, twoStepNeed } from '../src/lib/admin';
import TwoStep from '../src/pages/admin/TwoStep.svelte';
import { fakeMfa } from './admin-helpers';

it('twoStepNeed maps the assurance levels', async () => {
  expect(await twoStepNeed(fakeMfa({ levels: ['aal2', 'aal2'] }).sb)).toBe('done');
  expect(await twoStepNeed(fakeMfa({ levels: ['aal1', 'aal2'] }).sb)).toBe('code');
  expect(await twoStepNeed(fakeMfa({ levels: ['aal1', 'aal1'] }).sb)).toBe('setup');
});

it('removes an unverified factor before enrolling again', async () => {
  const { sb, calls } = fakeMfa({ factors: [{ id: 'f-old', status: 'unverified' }] });
  const s = await startSetup(sb);
  expect(calls).toEqual(['unenroll f-old', 'enroll']);
  expect(s).toEqual({ factorId: 'f-new', qr: 'data:image/svg+xml;utf-8,<svg></svg>', secret: 'JBSWY3DPEHPK3PXP' });
});

it('setup shows the QR and the key, then calls ondone after a right code', async () => {
  const { sb, calls } = fakeMfa();
  const ondone = vi.fn();
  render(TwoStep, { sb, need: 'setup', ondone, onsignout: vi.fn() });
  expect(screen.getByRole('heading', { name: 'Turn on two-step sign-in' })).toBeTruthy();
  await waitFor(() => expect(screen.getByAltText('QR code to scan with the authenticator app')).toBeTruthy());
  expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeTruthy();
  const input = screen.getByLabelText('6-digit code') as HTMLInputElement;
  expect(input.getAttribute('inputmode')).toBe('numeric');
  expect(input.getAttribute('autocomplete')).toBe('one-time-code');
  await fireEvent.input(input, { target: { value: '123456' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Turn on two-step sign-in' }));
  await waitFor(() => expect(ondone).toHaveBeenCalled());
  expect(calls).toContain('verify f-new 123456');
});

it('a wrong code shows the message and keeps the screen', async () => {
  const { sb } = fakeMfa({ levels: ['aal1', 'aal2'], factors: [{ id: 'f-1', status: 'verified' }] });
  const ondone = vi.fn();
  render(TwoStep, { sb, need: 'code', ondone, onsignout: vi.fn() });
  await fireEvent.input(screen.getByLabelText('6-digit code'), { target: { value: '000000' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', expect.stringContaining('That code isn’t right, or it changed. Type the code the app shows now.'));
  expect(ondone).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Enter your code' })).toBeTruthy();
});

it('the code screen offers Lost your phone? and Sign out', async () => {
  const { sb } = fakeMfa({ levels: ['aal1', 'aal2'], factors: [{ id: 'f-1', status: 'verified' }] });
  const onsignout = vi.fn();
  render(TwoStep, { sb, need: 'code', ondone: vi.fn(), onsignout });
  expect(screen.getByText('Lost your phone?')).toBeTruthy();
  expect(screen.queryByText(/Can’t scan/)).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
  expect(onsignout).toHaveBeenCalled();
});
