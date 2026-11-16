// Guards on the release and Pages workflows (plan 6a final review).
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { missingVars } from './release.mjs';

const release = readFileSync('.github/workflows/release.yml', 'utf8');
const pages = readFileSync('.github/workflows/pages.yml', 'utf8');
const cargo = readFileSync('apps/desktop/src-tauri/Cargo.toml', 'utf8');
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

it('secrets reach steps only through env entries, never pasted into a script (review I2)', () => {
  const lines = release.split('\n').filter(l => l.includes('secrets.'));
  expect(lines.length).toBeGreaterThan(0);
  for (const l of lines) expect(l, l).toMatch(/^\s+[A-Z0-9_]+: \$\{\{ secrets\.[A-Z0-9_]+ \}\}\s*$/);
});

it('the key alias is a plain variable, so logs keep the word klasilid readable (review M1)', () => {
  expect(release).not.toContain('secrets.ANDROID_KEY_ALIAS');
  expect(release).toContain('vars.ANDROID_KEY_ALIAS');
});

it('copies the signed universal APK by its exact path (review M6)', () => {
  expect(release).toContain('outputs/apk/universal/release/app-universal-release.apk');
  expect(release).not.toMatch(/\*universal-release\*/);
});

it('a hand-run release needs an explicit tag (review M3)', () => {
  expect(release).not.toMatch(/default: v0\.0\.1/);
  expect(release).toMatch(/tag:\n\s+description: [^\n]+\n\s+required: true/);
});

it('real releases and Pages deploys refuse to build without the Supabase settings (review M2)', () => {
  expect(release).toContain('node scripts/release.mjs require-vars VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY');
  expect(pages).toContain('node scripts/release.mjs require-vars VITE_SUPABASE_URL VITE_SUPABASE_ANON_KEY');
});

it('missingVars lists empty or unset names', () => {
  expect(missingVars({ A: 'x', B: '', C: '  ' }, ['A', 'B', 'C', 'D'])).toEqual(['B', 'C', 'D']);
  expect(missingVars({ A: 'x' }, ['A'])).toEqual([]);
});

it('Rust Tauri crates are pinned to the same minor as their locked npm packages (review I1)', () => {
  const minor = (pkg) => lock.packages[`node_modules/${pkg}`].version.split('.').slice(0, 2).join('.');
  const pairs = {
    tauri: '@tauri-apps/api',
    'tauri-plugin-http': '@tauri-apps/plugin-http',
    'tauri-plugin-opener': '@tauri-apps/plugin-opener',
    'tauri-plugin-process': '@tauri-apps/plugin-process',
    'tauri-plugin-updater': '@tauri-apps/plugin-updater',
  };
  for (const [crate, pkg] of Object.entries(pairs)) {
    const m = new RegExp(`^${crate} = (?:\\{ version = )?"~(\\d+\\.\\d+)(?:\\.\\d+)?"`, 'm').exec(cargo);
    expect(m?.[1], crate).toBe(minor(pkg));
  }
});
