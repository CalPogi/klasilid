import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.svelte';
import Modal from '../src/components/Modal.svelte';
import { openDb } from '../src/lib/db';
import { PHONE_QUERY } from '../src/lib/layout';
import { laptopRoute, param, routeOf } from '../src/lib/router';
import { mockMatchMedia } from './phone-helpers';

const demoApp = () => render(App, { deps: { db: openDb('t-' + crypto.randomUUID()), mode: 'demo', auth: null, remote: null } });

afterEach(() => { location.hash = ''; });

describe('routes and layout', () => {
  it('PHONE_QUERY treats a sideways phone as a phone', () => {
    expect(PHONE_QUERY).toBe('(max-width: 760px), (max-height: 500px)');
  });
  it('param and routeOf read #/student?id=…', () => {
    expect(routeOf('#/student?id=l1')).toBe('student');
    expect(param('id', '#/student?id=l1')).toBe('l1');
    expect(param('id', '#/student')).toBe('');
  });
  it('laptopRoute sends phone-only routes to their laptop page', () => {
    expect(laptopRoute('student')).toBe('students');
    expect(laptopRoute('day')).toBe('attendance');
    expect(laptopRoute('seat-edit')).toBe('seat');
    expect(laptopRoute('settings')).toBe('settings');
  });
});

describe('the app on a phone and on a laptop', () => {
  it('on a phone the app shows the bottom bar and no sidebar', async () => {
    mockMatchMedia(true);
    demoApp();
    const nav = await screen.findByRole('navigation', { name: 'Main' }, { timeout: 3000 });
    expect(nav.classList.contains('fnav')).toBe(true);
    expect(document.querySelector('aside.side')).toBeNull();
  });

  it('on a laptop the sidebar shows and no bottom bar', async () => {
    mockMatchMedia(false);
    demoApp();
    await screen.findByRole('navigation', { name: 'Main' }, { timeout: 3000 });
    expect(document.querySelector('aside.side')).toBeTruthy();
    expect(document.querySelector('.fnav')).toBeNull();
  });

  it('a phone-only link opened on a laptop shows the laptop page', async () => {
    mockMatchMedia(false);
    location.hash = '#/student?id=x';
    demoApp();
    expect(await screen.findByRole('heading', { name: 'Students' }, { timeout: 3000 })).toBeTruthy();
  });

  it('on a phone Classes and Reports say coming in the next update', async () => {
    mockMatchMedia(true);
    demoApp();
    await fireEvent.click(await screen.findByRole('button', { name: 'Classes' }, { timeout: 3000 }));
    expect(await screen.findByText('Coming in the next update')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Reports' }));
    expect(await screen.findByText('Coming in the next update')).toBeTruthy();
  });

  it('on a phone the Menu opens Profile, Settings, School calendar, Help and feedback', async () => {
    mockMatchMedia(true);
    demoApp();
    await fireEvent.click(await screen.findByRole('button', { name: 'Menu' }, { timeout: 3000 }));
    for (const name of ['Profile', 'Settings', 'School calendar', 'Help and feedback'])
      expect(screen.getByRole('menuitem', { name })).toBeTruthy();
  });
});

describe('Modal on a phone', () => {
  const body = createRawSnippet(() => ({ render: () => '<h4 id="tm">Title</h4>' }));

  it('is a bottom sheet, and back closes it', async () => {
    mockMatchMedia(true);
    const onclose = vi.fn();
    render(Modal, { labelledby: 'tm', onclose, children: body });
    expect(document.querySelector('.sheet.open')).toBeTruthy();
    expect(document.querySelector('.scrim.open')).toBeTruthy();
    history.back();
    await vi.waitFor(() => expect(onclose).toHaveBeenCalledOnce());
  });

  it('closing it another way pops its history entry', async () => {
    mockMatchMedia(true);
    history.replaceState({ marker: 'before' }, '');
    const { unmount } = render(Modal, { labelledby: 'tm', onclose: vi.fn(), children: body });
    expect(history.state?.klSheet).toBe(true);
    unmount();
    await vi.waitFor(() => expect(history.state).toEqual({ marker: 'before' }));
  });

  it('stays the laptop modal on a laptop', () => {
    mockMatchMedia(false);
    render(Modal, { labelledby: 'tm', onclose: vi.fn(), children: body });
    expect(document.querySelector('.modal.open')).toBeTruthy();
    expect(document.querySelector('.sheet')).toBeNull();
  });
});
