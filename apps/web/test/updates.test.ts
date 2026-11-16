import { render, screen } from '@testing-library/svelte';
import { expect, it } from 'vitest';
import UpdateBanner from '../src/components/UpdateBanner.svelte';
import { platform } from '../src/lib/native';
import { APK_URL, findUpdate, isNewer, type UpdateDeps } from '../src/lib/updates';

it('isNewer compares numerically and refuses malformed versions', () => {
  // Review Focus 4
  expect(isNewer('0.10.0', '0.9.0')).toBe(true);
  expect(isNewer('1.0.0', '0.99.99')).toBe(true);
  expect(isNewer('0.6.0', '0.6.0')).toBe(false);
  expect(isNewer('0.5.9', '0.6.0')).toBe(false);
  expect(isNewer('0.7', '0.6.0')).toBe(false);
  expect(isNewer('v0.7.0', '0.6.0')).toBe(false);
});

const deps = (over: Partial<UpdateDeps>): UpdateDeps => ({
  platform: 'android',
  current: async () => '0.6.0',
  fetchLatest: async () => ({ version: '0.7.0' }),
  windowsCheck: async () => null,
  ...over,
});

it('web never touches native deps', async () => {
  // Review Focus 2
  const boom = async (): Promise<never> => {
    throw new Error('native called');
  };
  expect(await findUpdate(deps({ platform: 'web', current: boom, fetchLatest: boom, windowsCheck: boom }))).toBeNull();
});

it('android offers the APK when latest.json is newer', async () => {
  expect(await findUpdate(deps({}))).toEqual({ kind: 'android', version: '0.7.0', url: APK_URL });
  expect(await findUpdate(deps({ fetchLatest: async () => ({ version: '0.6.0' }) }))).toBeNull();
});

it('windows uses the Tauri updater result', async () => {
  const install = async () => {};
  expect(await findUpdate(deps({ platform: 'windows', windowsCheck: async () => ({ version: '0.7.0', install }) }))).toEqual({
    kind: 'windows',
    version: '0.7.0',
    install,
  });
});

it('offline: a failing check returns null instead of throwing', async () => {
  // Review Focus 1
  expect(await findUpdate(deps({ fetchLatest: async () => { throw new TypeError('Failed to fetch'); } }))).toBeNull();
  expect(await findUpdate(deps({ platform: 'windows', windowsCheck: async () => { throw new Error('offline'); } }))).toBeNull();
});

it('the banner names the version and offers Download on Android', () => {
  render(UpdateBanner, { update: { kind: 'android', version: '0.7.0', url: APK_URL } });
  expect(screen.getByText(/A new version of Klasilid is ready \(version 0\.7\.0\)/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
});

it('platform() is web in a browser', () => expect(platform()).toBe('web'));
