import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { LATEST_JSON } from '../../web/src/lib/updates';

const conf = JSON.parse(readFileSync('apps/desktop/src-tauri/tauri.conf.json', 'utf8'));

it('pins the release decisions', () => {
  expect(conf.identifier).toBe('app.klasilid.teacher');
  expect(conf.bundle.targets).toEqual(['nsis']);
  expect(conf.bundle.windows.nsis.installMode).toBe('currentUser');
  expect(conf.bundle.android.minSdkVersion).toBe(24);
  expect(conf.bundle.createUpdaterArtifacts).toBe(true);
  expect(conf.plugins.updater.endpoints).toEqual([LATEST_JSON]);
  expect(conf.plugins.updater.pubkey.length).toBeGreaterThan(40);
  expect(conf.app.security.csp).toContain('https://*.supabase.co');
  expect(conf.build.frontendDist).toBe('../../web/dist');
});

it('keeps every key and password out of the repo', () => {
  const tracked = execSync('git ls-files', { encoding: 'utf8' });
  expect(tracked).not.toMatch(/\.p12|\.jks|updater\.key(?!\.pub)|Klasilid-keys/);
});
