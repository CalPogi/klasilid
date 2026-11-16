#!/usr/bin/env node
// Release helpers used by .github/workflows (plan 6a). Pure functions are exported for tests; the CLI is below.
//   node scripts/release.mjs set-version <tag> <tauri.conf.json>
//   node scripts/release.mjs manifest <tag> <Klasilid-Setup.exe.sig> <latest.json>
//   node scripts/release.mjs check-landing <dir>
//   node scripts/release.mjs patch-android <build.gradle.kts>
//   node scripts/release.mjs require-vars NAME...   (fails if any env var is empty: no demo-mode releases)
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RELEASES_REPO = 'https://github.com/CalPogi/klasilid-releases';

export function versionFromTag(tag) {
  const m = /^v(\d+\.\d+\.\d+)$/.exec(tag ?? '');
  if (!m) throw new Error('Release tags look like v1.2.3');
  return m[1];
}

export function setVersion(confText, version) {
  return JSON.stringify({ ...JSON.parse(confText), version }, null, 2) + '\n';
}

export function updaterManifest({ version, notes, pubDate, signature, url }) {
  return { version, notes, pub_date: pubDate, platforms: { 'windows-x86_64': { signature, url } } };
}

export function placeholdersIn(html) {
  return [...new Set(html.match(/\[[A-Z][A-Z_]+\]/g) ?? [])];
}

const MARK = '// klasilid-signing';
const SIGNING = `    ${MARK}
    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KL_KEYSTORE") ?: "missing-keystore.p12")
            storePassword = System.getenv("KL_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("KL_KEY_ALIAS")
            keyPassword = System.getenv("KL_KEYSTORE_PASSWORD")
            storeType = "pkcs12"
        }
    }
`;

export function patchAndroidSigning(gradle) {
  if (gradle.includes(MARK)) return gradle;
  const android = gradle.indexOf('android {');
  const release = gradle.indexOf('getByName("release") {');
  if (android < 0 || release < 0) throw new Error('Unexpected build.gradle.kts layout');
  const afterRelease = release + 'getByName("release") {'.length;
  const withSigning =
    gradle.slice(0, afterRelease) + '\n            signingConfig = signingConfigs.getByName("release")' + gradle.slice(afterRelease);
  const afterAndroid = android + 'android {'.length;
  return withSigning.slice(0, afterAndroid) + '\n' + SIGNING + withSigning.slice(afterAndroid).replace(/^\n/, '');
}

export function missingVars(env, names) {
  return names.filter(n => !(env[n] ?? '').trim());
}

function htmlFiles(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? htmlFiles(p) : name.endsWith('.html') ? [p] : [];
  });
}

function main([cmd, ...args]) {
  if (cmd === 'set-version') {
    const [tag, conf] = args;
    writeFileSync(conf, setVersion(readFileSync(conf, 'utf8'), versionFromTag(tag)));
  } else if (cmd === 'manifest') {
    const [tag, sigFile, out] = args;
    const version = versionFromTag(tag);
    const m = updaterManifest({
      version,
      notes: `Klasilid ${version}`,
      pubDate: new Date().toISOString(),
      signature: readFileSync(sigFile, 'utf8').trim(),
      url: `${RELEASES_REPO}/releases/download/${tag}/Klasilid-Setup.exe`,
    });
    writeFileSync(out, JSON.stringify(m, null, 2) + '\n');
  } else if (cmd === 'check-landing') {
    const found = htmlFiles(args[0]).flatMap(f => placeholdersIn(readFileSync(f, 'utf8')).map(p => `${f}: ${p}`));
    if (found.length) {
      console.error(`Fill these in before deploying:\n${found.join('\n')}`);
      process.exit(1);
    }
  } else if (cmd === 'patch-android') {
    const [file] = args;
    writeFileSync(file, patchAndroidSigning(readFileSync(file, 'utf8')));
  } else if (cmd === 'require-vars') {
    const missing = missingVars(process.env, args);
    if (missing.length) {
      console.error(`Set these GitHub Actions variables first (a build without them is a demo-only app): ${missing.join(', ')}`);
      process.exit(1);
    }
  } else {
    console.error('Usage: node scripts/release.mjs set-version|manifest|check-landing|patch-android|require-vars …');
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
