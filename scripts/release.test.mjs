import { expect, it } from 'vitest';
import { patchAndroidSigning, placeholdersIn, setVersion, updaterManifest, versionFromTag } from './release.mjs';

it('versionFromTag accepts vX.Y.Z only', () => {
  expect(versionFromTag('v0.6.0')).toBe('0.6.0');
  expect(versionFromTag('v0.10.12')).toBe('0.10.12');
  for (const bad of ['0.6.0', 'v0.6', 'v0.6.0-beta', 'release'])
    expect(() => versionFromTag(bad)).toThrow('Release tags look like v1.2.3'); // Review Focus 5
});

it('setVersion changes only the version', () => {
  const out = JSON.parse(setVersion('{"productName":"Klasilid","version":"0.0.0","identifier":"app.klasilid.teacher"}', '0.6.0'));
  expect(out).toEqual({ productName: 'Klasilid', version: '0.6.0', identifier: 'app.klasilid.teacher' });
});

it('updaterManifest has the Tauri shape', () => {
  expect(updaterManifest({ version: '0.6.0', notes: 'Klasilid 0.6.0', pubDate: '2026-11-20T00:00:00Z', signature: 'SIG', url: 'U' })).toEqual({
    version: '0.6.0',
    notes: 'Klasilid 0.6.0',
    pub_date: '2026-11-20T00:00:00Z',
    platforms: { 'windows-x86_64': { signature: 'SIG', url: 'U' } },
  });
});

it('placeholdersIn finds unfilled [ALLCAPS] tokens once each', () => {
  // Review Focus 3
  expect(placeholdersIn('<p>[RESPONSIBLE] — write to [CONTACT]. Again [CONTACT]. [a] [1]</p>')).toEqual(['[RESPONSIBLE]', '[CONTACT]']);
  expect(placeholdersIn('<p>All filled in.</p>')).toEqual([]);
  // spaces allowed; the photo placeholder (lowercase, colon) does not block a deploy
  expect(placeholdersIn('By [YOUR NAME], <a href="mailto:[YOUR EMAIL]">. [PHOTO: the reader] [ A]')).toEqual(['[YOUR NAME]', '[YOUR EMAIL]']);
});

it('patchAndroidSigning adds release signing once', () => {
  // Review Focus 5
  const g = 'android {\n    namespace = "app.klasilid.teacher"\n    buildTypes {\n        getByName("release") {\n            isMinifyEnabled = true\n        }\n    }\n}\n';
  const once = patchAndroidSigning(g);
  expect(once).toContain('create("release")');
  expect(once).toContain('System.getenv("KL_KEYSTORE")');
  expect(once).toContain('storeType = "pkcs12"');
  expect(once).toContain('signingConfig = signingConfigs.getByName("release")');
  expect(patchAndroidSigning(once)).toBe(once);
  expect(() => patchAndroidSigning('plugins {}')).toThrow('Unexpected build.gradle.kts layout');
});
