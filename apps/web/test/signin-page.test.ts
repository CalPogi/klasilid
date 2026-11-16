import { fireEvent, render, screen } from '@testing-library/svelte';
import { expect, it, vi } from 'vitest';
import { openDb } from '../src/lib/db';
import { WRONG_LOGIN, type AuthPort } from '../src/lib/session';
import SignIn from '../src/pages/SignIn.svelte';

const fresh = () => openDb('t-' + crypto.randomUUID());
const auth = (signIn: AuthPort['signIn']): AuthPort => ({ signIn, async signOut() {} });
const type = async (u: string, p: string) => {
  await fireEvent.input(screen.getByLabelText('Username'), { target: { value: u } });
  await fireEvent.input(screen.getByLabelText('Password'), { target: { value: p } });
};

it('labels both fields and toggles password visibility', async () => {
  render(SignIn, { db: fresh(), auth: auth(async () => { throw new Error(WRONG_LOGIN); }), onsignedin: vi.fn() });
  expect(screen.getByLabelText('Username').getAttribute('autocomplete')).toBe('username');
  const pass = screen.getByLabelText('Password') as HTMLInputElement;
  expect(pass.type).toBe('password');
  expect(pass.getAttribute('autocomplete')).toBe('current-password');
  const eye = screen.getByRole('button', { name: 'Show password' });
  expect(eye.getAttribute('aria-pressed')).toBe('false');
  await fireEvent.click(eye);
  expect(pass.type).toBe('text');
  expect(screen.getByRole('button', { name: 'Hide password' }).getAttribute('aria-pressed')).toBe('true');
});

it('shows the generic error and keeps the username after a failed sign-in', async () => {
  const onsignedin = vi.fn();
  render(SignIn, { db: fresh(), auth: auth(async () => { throw new Error(WRONG_LOGIN); }), onsignedin });
  await type('lou.test', 'wrong');
  await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect((await screen.findByRole('alert')).textContent).toContain('That username or password isn’t right. Check both and try again.');
  expect((screen.getByLabelText('Username') as HTMLInputElement).value).toBe('lou.test');
  expect(screen.getByLabelText('Username').getAttribute('aria-invalid')).toBe('true');
  expect(onsignedin).not.toHaveBeenCalled();
});

it('shows Signing in… and disables the button while waiting', async () => {
  render(SignIn, { db: fresh(), auth: auth(() => new Promise(() => {})), onsignedin: vi.fn() });
  await type('lou.test', 'right');
  await fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  const btn = await screen.findByRole('button', { name: 'Signing in…' });
  expect((btn as HTMLButtonElement).disabled).toBe(true);
  expect(btn.getAttribute('aria-busy')).toBe('true');
});

it('links new advisers to #/signup', () => {
  render(SignIn, { db: fresh(), auth: auth(async () => { throw new Error(WRONG_LOGIN); }), onsignedin: vi.fn() });
  expect(screen.getByRole('link', { name: 'Create an account' }).getAttribute('href')).toBe('#/signup');
});

it('Forgot password? tells advisers and parents who resets it', async () => {
  render(SignIn, { db: fresh(), auth: auth(async () => { throw new Error(WRONG_LOGIN); }), onsignedin: vi.fn() });
  await fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
  expect(screen.getByText('Ask the Klasilid admin to reset it.', { exact: false })).toBeTruthy();
  expect(screen.getByText('Ask the adviser for a new login slip.', { exact: false })).toBeTruthy();
});
