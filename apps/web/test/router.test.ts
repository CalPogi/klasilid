import { get } from 'svelte/store';
import { expect, it } from 'vitest';
import { go, route } from '../src/lib/router';

it('maps hashes to routes, unknown → today', () => {
  location.hash = '#/attendance';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(get(route)).toBe('attendance');
  location.hash = '#/nope';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  expect(get(route)).toBe('today');
});

it('go() sets the hash', () => {
  go('setup');
  expect(location.hash).toBe('#/setup');
});
