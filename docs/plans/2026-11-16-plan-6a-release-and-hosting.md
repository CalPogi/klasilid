# Klasilid Plan 6a: Release and hosting

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klasilid goes live. The backend runs on Supabase. The landing page and web app are on Cloudflare Pages. GitHub Actions builds a Windows installer and an Android APK on each version tag and publishes them to the public downloads repo, and both apps learn about new versions.

**Architecture:**
- **Tauri project:** `apps/desktop/src-tauri` wraps the existing `apps/web` build. One Vite build with `base: './'` serves both Tauri and Pages, where the app lives at `/app/`.
- **Pages site:** a static landing page in `apps/landing`, merged with the web build into one site folder.
- **Release helpers:** pure functions in `scripts/release.mjs`, tested with Vitest, called by the workflows.
- **Native-only code** sits behind `apps/web/src/lib/native.ts`, so the website never loads Tauri modules.

**Tech Stack:** Tauri 2 (`@tauri-apps/cli` ^2, crates `tauri` 2, `tauri-plugin-updater` 2, `tauri-plugin-process` 2, `tauri-plugin-http` 2, `tauri-plugin-opener` 2), GitHub Actions, Cloudflare Pages via `wrangler` 4, Supabase CLI via `npx supabase`, Vitest 5.

**Spec:** `docs/2026-11-16-apps-and-release-design.md` §1–5 (this plan), with `docs/2026-11-15-klasilid-design.md` §5, §7.11, §12.

## Global Constraints

- **No secret in the repo, in a release file or in a workflow log.**
  - Signing keys and the deploy token live only in GitHub Actions secrets, plus the owner's backup folder `C:\Users\titus\Klasilid-keys\` (outside the repo).
  - Never print the Supabase service-role key. When reading API keys, filter to `anon` before anything is shown.
- **Nothing is created, pushed, deployed or published without the owner's "yes" in chat at that step.** That covers creating either GitHub repo, the first push, the Supabase project, the first Pages deploy and the first release tag.
- **The owner types every password himself**: the Supabase database password, the teacher's first password, and the value of each `gh secret set` he runs. The builder never handles the owner's credentials.
- **Repos:** code in private `CalPogi/klasilid`; downloads in public `CalPogi/klasilid-releases`.
- **Release file names never change:** `Klasilid-Setup.exe`, `Klasilid.apk`, `latest.json`. The stable link base is `https://github.com/CalPogi/klasilid-releases/releases/latest/download/`.
- **Targets:**
  - Windows 10/11 x64, NSIS installer, per-user install (no admin rights needed on a school laptop).
  - Android 7+ (`minSdk 24`), one universal APK with arm64, armv7 and x86_64.
- **Supabase:** project `klasilid`, region `ap-southeast-1`, free plan now. Upgrade to Pro before real learner data goes in. A weekly keep-alive request stops the project pausing.
- **Builds run only on GitHub Actions.** Local checks are `npx.cmd vitest run` (233 tests today, all must keep passing) and running the scripts.
- **New UI** uses only the mockup's existing classes and parts (owner's rule: match the mockup exactly).

## Review Focus

1. **Offline at start-up.** The update check fails quietly and never blocks or breaks start-up. Test in Task 2.
2. **The website loads no Tauri code.** On the web platform, the update check returns nothing without calling any native function. Test in Task 2.
3. **The privacy page still has placeholders.** The Pages deploy refuses to publish. Test in Task 1.
4. **Version compare edge cases:** `0.10.0` is newer than `0.9.0`; equal versions mean no update; a malformed version means no update. Test in Task 2.
5. **A bad release tag or a second run of the Android signing patch.** A tag like `0.6` or `v0.6` is refused with a clear message, and the patch applied twice changes nothing the second time. Test in Task 1.

---

## File structure

```
scripts/release.mjs                 versionFromTag, setVersion, updaterManifest, placeholdersIn, patchAndroidSigning + CLI
scripts/release.test.mjs
scripts/build-site.mjs              landing + web build → site/ (with _redirects, _headers)
scripts/make-keystore.py            one-off: PKCS12 Android signing key into the owner's key folder
apps/web/src/lib/native.ts          platform(): 'web' | 'windows' | 'android'
apps/web/src/lib/updates.ts         isNewer, findUpdate, RELEASES, APK_URL, LATEST_JSON
apps/web/src/components/UpdateBanner.svelte
apps/web/test/updates.test.ts
apps/desktop/package.json           @tauri-apps/cli
apps/desktop/app-icon.svg           orange "k" mark, text drawn as a path
apps/desktop/src-tauri/{Cargo.toml, build.rs, tauri.conf.json, capabilities/default.json, src/main.rs, src/lib.rs, icons/}
apps/desktop/test/config.test.ts    pins tauri.conf.json decisions
apps/landing/{index.html, privacy.html, styles.css}
.github/workflows/{pages.yml, release.yml, keepalive.yml}
docs/release.md                     owner runbook: releasing, keys, Pro upgrade, install help
```

---

### Task 1: Release helpers

**Files:**
- Create: `scripts/release.mjs`, `scripts/release.test.mjs` (the node Vitest project already includes `scripts/**/*.test.mjs`)

**Interfaces:**
- Produces, exported from `scripts/release.mjs`:
  - `versionFromTag(tag: string): string` — `'v0.6.0'` → `'0.6.0'`. Anything not `vX.Y.Z` (digits only) throws `Error('Release tags look like v1.2.3')`.
  - `setVersion(confText: string, version: string): string` — returns `tauri.conf.json` text with `"version"` set, other keys and order untouched (JSON parse/stringify with 2-space indent and a final newline).
  - `updaterManifest({ version, notes, pubDate, signature, url }): object` → `{ version, notes, pub_date: pubDate, platforms: { 'windows-x86_64': { signature, url } } }`.
  - `placeholdersIn(html: string): string[]` — every distinct `[ALLCAPS]` token (regex `\[[A-Z][A-Z_]+\]`), in order of first appearance.
  - `patchAndroidSigning(gradle: string): string` — adds a `signingConfigs { create("release") { … } }` block inside `android {` and `signingConfig = signingConfigs.getByName("release")` inside `getByName("release") {`. Values come from env vars `KL_KEYSTORE` (file), `KL_KEYSTORE_PASSWORD` (store and key password) and `KL_KEY_ALIAS`, with `storeType = "pkcs12"`. It is idempotent (marker comment `// klasilid-signing`) and throws `Error('Unexpected build.gradle.kts layout')` if either anchor is missing.
  - CLI: `node scripts/release.mjs <command>`:
    - `set-version <tag> <conf>` (rewrites the file);
    - `manifest <tag> <sigFile> <outFile>` (url = `https://github.com/CalPogi/klasilid-releases/releases/download/<tag>/Klasilid-Setup.exe`, notes = `Klasilid <version>`, pubDate = now ISO);
    - `check-landing <dir>` (exits 1 and lists placeholders found in any `.html` under `<dir>`);
    - `patch-android <file>`.

- [ ] **Step 1: Write the failing tests** in `scripts/release.test.mjs`:

```js
it('versionFromTag accepts vX.Y.Z only', () => {
  expect(versionFromTag('v0.6.0')).toBe('0.6.0');
  expect(versionFromTag('v0.10.12')).toBe('0.10.12');
  for (const bad of ['0.6.0', 'v0.6', 'v0.6.0-beta', 'release'])
    expect(() => versionFromTag(bad)).toThrow('Release tags look like v1.2.3');   // Review Focus 5
});
it('setVersion changes only the version', () => {
  const out = JSON.parse(setVersion('{"productName":"Klasilid","version":"0.0.0","identifier":"app.klasilid.teacher"}', '0.6.0'));
  expect(out).toEqual({ productName: 'Klasilid', version: '0.6.0', identifier: 'app.klasilid.teacher' });
});
it('updaterManifest has the Tauri shape', () => {
  expect(updaterManifest({ version: '0.6.0', notes: 'Klasilid 0.6.0', pubDate: '2026-11-20T00:00:00Z', signature: 'SIG', url: 'U' }))
    .toEqual({ version: '0.6.0', notes: 'Klasilid 0.6.0', pub_date: '2026-11-20T00:00:00Z', platforms: { 'windows-x86_64': { signature: 'SIG', url: 'U' } } });
});
it('placeholdersIn finds unfilled [ALLCAPS] tokens once each', () => {   // Review Focus 3
  expect(placeholdersIn('<p>[RESPONSIBLE] — write to [CONTACT]. Again [CONTACT]. [a] [1]</p>')).toEqual(['[RESPONSIBLE]', '[CONTACT]']);
  expect(placeholdersIn('<p>All filled in.</p>')).toEqual([]);
});
it('patchAndroidSigning adds release signing once', () => {   // Review Focus 5
  const g = 'android {\n    namespace = "app.klasilid.teacher"\n    buildTypes {\n        getByName("release") {\n            isMinifyEnabled = true\n        }\n    }\n}\n';
  const once = patchAndroidSigning(g);
  expect(once).toContain('create("release")');
  expect(once).toContain('System.getenv("KL_KEYSTORE")');
  expect(once).toContain('storeType = "pkcs12"');
  expect(once).toContain('signingConfig = signingConfigs.getByName("release")');
  expect(patchAndroidSigning(once)).toBe(once);
  expect(() => patchAndroidSigning('plugins {}')).toThrow('Unexpected build.gradle.kts layout');
});
```

- [ ] **Step 2: Run** `npx.cmd vitest run scripts/release.test.mjs`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement** `scripts/release.mjs` with the exports and CLI above (Node built-ins only; the CLI runs only when the file is the entry point, as in `scripts/new-reader.mjs`).
- [ ] **Step 4: Run** `npx.cmd vitest run scripts`. Expected: all pass.
- [ ] **Step 5: Commit.** `git add scripts/release.mjs scripts/release.test.mjs && git commit -m "feat: release helpers (version, updater manifest, landing check, android signing patch)"`

---

### Task 2: Update check in the app

**Files:**
- Create: `apps/web/src/lib/native.ts`, `apps/web/src/lib/updates.ts`, `apps/web/src/components/UpdateBanner.svelte`, `apps/web/test/updates.test.ts`
- Modify: `apps/web/src/components/Shell.svelte` (banner at the top of the main area), `apps/web/src/App.svelte` (run the check), `apps/web/package.json` (add `@tauri-apps/api`, `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`, `@tauri-apps/plugin-http`, `@tauri-apps/plugin-opener`, all ^2)

**Interfaces:**
- Produces:
  - `native.ts`:
    - `export type Platform = 'web' | 'windows' | 'android'`;
    - `export function platform(): Platform` — `'web'` unless `'__TAURI_INTERNALS__' in window`; then `'android'` if `/Android/i.test(navigator.userAgent)`, otherwise `'windows'`.
  - `updates.ts`:
    - `export const RELEASES = 'https://github.com/CalPogi/klasilid-releases/releases/latest/download'`, `APK_URL = RELEASES + '/Klasilid.apk'`, `LATEST_JSON = RELEASES + '/latest.json'`;
    - `export function isNewer(latest: string, current: string): boolean` — numeric `X.Y.Z` compare. Anything malformed returns false.
    - `export type Update = { kind: 'windows'; version: string; install(): Promise<void> } | { kind: 'android'; version: string; url: string }`;
    - `export interface UpdateDeps { platform: Platform; current(): Promise<string>; fetchLatest(): Promise<{ version: string }>; windowsCheck(): Promise<{ version: string; install(): Promise<void> } | null> }`;
    - `export async function findUpdate(d: UpdateDeps): Promise<Update | null>` — `'web'` returns null without calling any dep. `'windows'` uses `windowsCheck()`. `'android'` compares `fetchLatest().version` with `current()` and returns `{ kind: 'android', version, url: APK_URL }`. Any thrown error returns null.
    - `export function tauriUpdateDeps(): UpdateDeps` — real deps through **dynamic** `import()` of the Tauri packages:
      - `current` = `getVersion()`;
      - `fetchLatest` = plugin-http `fetch(LATEST_JSON)`;
      - `windowsCheck` = plugin-updater `check()`, whose `install` runs `downloadAndInstall()` then plugin-process `relaunch()`.
  - `UpdateBanner.svelte`:
    - props `{ update: Update }`;
    - uses the mockup's `.warn` banner markup;
    - text "A new version of Klasilid is ready (version X.Y.Z).";
    - button "Restart to update" (windows, calls `install`) or "Download" (android, plugin-opener `openUrl(url)`).
  - `App.svelte` runs `findUpdate` at start and every 24 h while open, only when `platform() !== 'web'`.

- [ ] **Step 1: Write the failing tests** in `apps/web/test/updates.test.ts`:

```ts
it('isNewer compares numerically and refuses malformed versions', () => {   // Review Focus 4
  expect(isNewer('0.10.0', '0.9.0')).toBe(true);
  expect(isNewer('1.0.0', '0.99.99')).toBe(true);
  expect(isNewer('0.6.0', '0.6.0')).toBe(false);
  expect(isNewer('0.5.9', '0.6.0')).toBe(false);
  expect(isNewer('0.7', '0.6.0')).toBe(false);
  expect(isNewer('v0.7.0', '0.6.0')).toBe(false);
});
const deps = (over: Partial<UpdateDeps>): UpdateDeps => ({
  platform: 'android', current: async () => '0.6.0', fetchLatest: async () => ({ version: '0.7.0' }), windowsCheck: async () => null, ...over,
});
it('web never touches native deps', async () => {   // Review Focus 2
  const boom = async () => { throw new Error('native called'); };
  expect(await findUpdate(deps({ platform: 'web', current: boom, fetchLatest: boom, windowsCheck: boom }))).toBeNull();
});
it('android offers the APK when latest.json is newer', async () => {
  expect(await findUpdate(deps({}))).toEqual({ kind: 'android', version: '0.7.0', url: APK_URL });
  expect(await findUpdate(deps({ fetchLatest: async () => ({ version: '0.6.0' }) }))).toBeNull();
});
it('windows uses the Tauri updater result', async () => {
  const install = async () => {};
  expect(await findUpdate(deps({ platform: 'windows', windowsCheck: async () => ({ version: '0.7.0', install }) })))
    .toEqual({ kind: 'windows', version: '0.7.0', install });
});
it('offline: a failing check returns null instead of throwing', async () => {   // Review Focus 1
  expect(await findUpdate(deps({ fetchLatest: async () => { throw new TypeError('Failed to fetch'); } }))).toBeNull();
  expect(await findUpdate(deps({ platform: 'windows', windowsCheck: async () => { throw new Error('offline'); } }))).toBeNull();
});
it('the banner names the version and offers Download on Android', async () => {
  render(UpdateBanner, { update: { kind: 'android', version: '0.7.0', url: APK_URL } });
  expect(screen.getByText(/A new version of Klasilid is ready \(version 0\.7\.0\)/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download' })).toBeTruthy();
});
it('platform() is web in a browser', () => expect(platform()).toBe('web'));
```

- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/updates.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Install** the five Tauri JS packages into `apps/web` (`npm.cmd install -w @klasilid/web …`). **Implement** `native.ts`, `updates.ts` and `UpdateBanner.svelte`, and wire them into `App.svelte` and `Shell.svelte`.
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: everything passes, 233 earlier tests plus the new ones. Then run `npm.cmd run build -w @klasilid/web`. Expected: the build succeeds, and the main chunk contains no `@tauri-apps/plugin-updater` code (the Tauri modules are separate dynamic chunks).
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(web): update check and banner for the Windows and Android apps"`

---

### Task 3: Tauri project and signing keys

**Files:**
- Create:
  - `apps/desktop/package.json` (name `@klasilid/desktop`, private, scripts `tauri`, devDependency `@tauri-apps/cli` ^2);
  - `apps/desktop/app-icon.svg`;
  - `apps/desktop/src-tauri/` — `Cargo.toml`, `build.rs`, `tauri.conf.json`, `capabilities/default.json`, `src/main.rs`, `src/lib.rs`, and `icons/` generated by `npx tauri icon`;
  - `apps/desktop/test/config.test.ts`;
  - `scripts/make-keystore.py`.
- Modify:
  - root `package.json` workspaces stay `apps/*` (desktop joins automatically);
  - `vitest.config.ts` (node project includes `apps/desktop/test/**/*.test.ts`);
  - `apps/web/vite.config.ts` (`base: './'`);
  - `.gitignore` (`apps/desktop/src-tauri/target/`, `apps/desktop/src-tauri/gen/`).

**Interfaces:**
- Consumes: `LATEST_JSON` (Task 2) as the updater endpoint.
- Produces: `tauri.conf.json` with these exact values, which Task 5's workflow relies on:
  - `productName "Klasilid"`, `identifier "app.klasilid.teacher"`, `version "0.0.0"` (set at release by `set-version`);
  - `build`:
    - `beforeDevCommand "npm run dev -w @klasilid/web"`, `devUrl "http://localhost:5173"`;
    - `beforeBuildCommand "npm run build -w @klasilid/web"`, `frontendDist "../../web/dist"`;
  - `app.windows[0]`: title "Klasilid", 1280×800, min 960×600;
  - `app.security.csp`: `"default-src 'self'; connect-src 'self' ipc: http://ipc.localhost https://*.supabase.co wss://*.supabase.co; img-src 'self' data: blob: https://*.supabase.co; style-src 'self' 'unsafe-inline'; font-src 'self' data:"`;
  - `bundle`:
    - `active true`, `targets ["nsis"]`, `createUpdaterArtifacts true`;
    - `windows.nsis.installMode "currentUser"`;
    - `android.minSdkVersion 24`;
    - icons from `icons/`;
  - `plugins.updater`: `endpoints [LATEST_JSON]`, `pubkey` (the generated public key), `windows.installMode "passive"`.
- Capabilities (`default.json`, windows `["main"]`):
  - `core:default`, `updater:default`, `process:allow-restart`;
  - `opener:allow-open-url` scoped to `https://github.com/CalPogi/klasilid-releases/*`;
  - `http:default` scoped to `https://github.com/CalPogi/klasilid-releases/*`, `https://objects.githubusercontent.com/*` and `https://release-assets.githubusercontent.com/*` (where GitHub redirects downloads).
- Rust:
  - `Cargo.toml`: package `klasilid`; `[lib] name = "klasilid_lib"`, `crate-type = ["staticlib", "cdylib", "rlib"]`; deps `tauri` 2, `tauri-plugin-process` 2, `tauri-plugin-http` 2, `tauri-plugin-opener` 2, and `tauri-plugin-updater` 2 under `[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]`; build-dep `tauri-build` 2.
  - `lib.rs`: `#[cfg_attr(mobile, tauri::mobile_entry_point)] pub fn run()` registers process, http and opener, plus updater under `#[cfg(desktop)]`. `main.rs` calls `klasilid_lib::run()` with `windows_subsystem = "windows"` in release.
- Keys, all written only to `C:\Users\titus\Klasilid-keys\`:
  - `updater.key` and `updater.key.pub` from `npx tauri signer generate --ci -w … -p <random 32 chars>`;
  - `klasilid-release.p12` from `scripts/make-keystore.py` (alias `klasilid`, RSA 2048, self-signed, 30 years, random 32-char password);
  - `README.txt` holding both passwords and the warning "Back these up. Losing them means installed apps can't be updated."
- `app-icon.svg`: 1024×1024, `#FF7A1A` rounded square (corner radius 31%, as in the mockup's `.logo`), a white lowercase "k" drawn as a **path** (the icon renderer has no fonts).

- [ ] **Step 1: Write the failing test** `apps/desktop/test/config.test.ts`:

```ts
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
```

- [ ] **Step 2: Run** `npx.cmd vitest run apps/desktop`. Expected: FAIL (no `tauri.conf.json`).
- [ ] **Step 3: Generate the keys.**
  1. `python -m pip install --user cryptography`.
  2. Write `scripts/make-keystore.py` (`cryptography.hazmat.primitives.serialization.pkcs12.serialize_key_and_certificates`).
  3. Run it and `npx tauri signer generate`, writing only to the key folder.
  4. Print only the public key.
- [ ] **Step 4: Create the Tauri project files** with the values above. Run `npx tauri icon apps/desktop/app-icon.svg` (from `apps/desktop`) to fill `src-tauri/icons/`. Set `base: './'` in `apps/web/vite.config.ts`.
- [ ] **Step 5: Run** `npx.cmd vitest run` and `npm.cmd run build -w @klasilid/web`. Expected: all tests pass and `apps/web/dist/index.html` references `./assets/…`. Rust can't compile here; Task 6's dry-run release is its first build.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat: Tauri project for Windows and Android, app icon, keystore script"`. Then run `git status` and confirm nothing from `Klasilid-keys` appears.

---

### Task 4: Landing page, privacy notice, site build, Pages and keep-alive workflows

**Files:**
- Create:
  - `apps/landing/index.html`, `apps/landing/privacy.html`, `apps/landing/styles.css`;
  - `scripts/build-site.mjs`;
  - `.github/workflows/pages.yml`, `.github/workflows/keepalive.yml`.

**Interfaces:**
- Consumes: `placeholdersIn` / `check-landing` (Task 1), `RELEASES` link base (Global Constraints).
- `styles.css`: copies the mockup's `:root` tokens (light and dark), fonts (Plus Jakarta Sans), radii and `.logo-lg`; there is no new palette.
- `index.html`:
  - logo and "Klasilid";
  - a few lines on what it is (attendance by tap at the classroom door, works without internet, for teachers and parents);
  - three buttons: **Download for Android** (`…/latest/download/Klasilid.apk`), **Download for Windows** (`…/latest/download/Klasilid-Setup.exe`), **Open in browser** (`/app/`);
  - install help: Windows "More info → Run anyway"; Android "allow Install unknown apps for your browser";
  - footer link "Privacy notice". No learner data.
- `privacy.html` covers:
  - what is collected: names, LRN, sex, attendance taps and times, corrections and reasons, excuse-letter photos, guardian name and phone, account usernames;
  - who sees it: the teacher; later the learner's own parent or guardian and the learner;
  - where it's stored: Supabase, Singapore region;
  - how long: "the current school year plus one year, then deleted";
  - who is responsible: `[RESPONSIBLE]`;
  - how to ask for a copy, a correction or removal: `[CONTACT]`.
  - The placeholders stay until the owner gives the facts (design "Still open").
- `build-site.mjs`: writes `site/` with:
  - the landing files at the root (and `privacy.html` also served at `/privacy` through `_redirects`);
  - the web build at `site/app/`;
  - `_redirects` (`/app /app/ 301`, `/privacy /privacy.html 200`);
  - `_headers` (`X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`).
  - Add `site/` to `.gitignore`.
- `pages.yml`:
  - triggers: push to `main` and `workflow_dispatch`;
  - steps: Node 22, `npm ci`, web build with `VITE_SUPABASE_URL: ${{ vars.SUPABASE_URL }}` and `VITE_SUPABASE_ANON_KEY: ${{ vars.SUPABASE_ANON_KEY }}`, `node scripts/build-site.mjs`, `node scripts/release.mjs check-landing site`, `npx wrangler@4 pages deploy site --project-name klasilid --branch main`;
  - env `CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}`, `CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}`.
- `keepalive.yml`:
  - `schedule: cron '0 1 * * 1'` (Mondays 09:00 Manila) and `workflow_dispatch`;
  - `curl -fsS "$SUPABASE_URL/rest/v1/profiles?select=id&limit=1" -H "apikey: $SUPABASE_ANON_KEY"` from vars. The response is an empty list under RLS.

- [ ] **Step 1: Write the pages.** Then run `node scripts/release.mjs check-landing apps/landing`. Expected: exit 1 listing `[RESPONSIBLE]` and `[CONTACT]`. That is the deploy guard working.
- [ ] **Step 2: Write `build-site.mjs`.** Run `npm.cmd run build -w @klasilid/web && node scripts/build-site.mjs`. Expected: `site/index.html`, `site/privacy.html`, `site/app/index.html`, `site/_redirects` and `site/_headers` exist.
- [ ] **Step 3: Preview** with `npx wrangler@4 pages dev site` (local only). Check `/`, `/privacy` and `/app/` (the demo app, since no env is set) at 1280 px and 375 px in the browser pane. Expected: the landing page uses the mockup's look and has no horizontal scroll at 375 px; `/app/#/today` opens the demo Today page.
- [ ] **Step 4: Write both workflows.** Then run `npx.cmd vitest run`. Expected: unchanged.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: landing page, privacy notice, Pages and keep-alive workflows"`

---

### Task 5: Release workflow and owner runbook

**Files:**
- Create: `.github/workflows/release.yml`, `docs/release.md`

**Interfaces:**
- Consumes: the `scripts/release.mjs` CLI (Task 1), `tauri.conf.json` (Task 3), and Actions secrets and variables:
  - secrets `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `RELEASES_TOKEN`;
  - vars `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
- `release.yml`:
  - **Triggers:** `push: tags: ['v*']`, plus `workflow_dispatch` with inputs `tag` (default `v0.0.1`) and `dry_run` (boolean, default true). `TAG` = the pushed tag or the input.
  - **Job `test`** (ubuntu): Node 22, `npm ci`, `npx vitest run`.
  - **Job `windows`** (windows-latest, needs test):
    1. Rust stable (`dtolnay/rust-toolchain@stable`), Node 22, `npm ci`.
    2. `node scripts/release.mjs set-version $TAG apps/desktop/src-tauri/tauri.conf.json`.
    3. In `apps/desktop`: `npx tauri build --bundles nsis`, with the Supabase vars as `VITE_*` and the two Tauri signing secrets as env.
    4. Copy `target/release/bundle/nsis/*-setup.exe` to `Klasilid-Setup.exe` and its `.sig` to `Klasilid-Setup.exe.sig`.
    5. Upload both as artifact `windows`.
  - **Job `android`** (ubuntu-latest, needs test):
    1. Java 17 (temurin), `android-actions/setup-android@v3`, NDK via `sdkmanager "ndk;27.0.12077973"` with `NDK_HOME` set.
    2. Rust stable with targets `aarch64-linux-android armv7-linux-androideabi x86_64-linux-android`. Node 22, `npm ci`, `set-version`.
    3. In `apps/desktop`: `npx tauri android init --ci`, then `npx tauri icon app-icon.svg`.
    4. `node scripts/release.mjs patch-android apps/desktop/src-tauri/gen/android/app/build.gradle.kts`.
    5. Decode `ANDROID_KEYSTORE_B64` to `$RUNNER_TEMP/klasilid.p12` and export the `KL_*` env.
    6. `npx tauri android build --apk --target aarch64 armv7 x86_64`.
    7. Copy the universal release APK to `Klasilid.apk` and upload it as artifact `android`.
    - The Android project is **regenerated on every build**, not committed. Every change to it goes through `patch-android`, which replaces the design's "commit back once" idea and needs no write-back workflow.
  - **Job `publish`** (ubuntu, needs windows and android, `if: ${{ !inputs.dry_run }}`, i.e. tag pushes and non-dry dispatches):
    1. Download both artifacts.
    2. `node scripts/release.mjs manifest $TAG Klasilid-Setup.exe.sig latest.json`.
    3. `gh release create $TAG Klasilid-Setup.exe Klasilid.apk latest.json --repo CalPogi/klasilid-releases --title "Klasilid <version>" --notes "Klasilid <version>"`, with `GH_TOKEN: ${{ secrets.RELEASES_TOKEN }}`.
  - Least privilege: workflow `permissions: contents: read`.
- `docs/release.md`, for the owner, plain language:
  - how to release (`git tag v0.6.1 && git push origin v0.6.1`; watch the Actions tab);
  - where the keys are and that losing them blocks updates;
  - how to rotate `RELEASES_TOKEN` (fine-grained, `klasilid-releases` only, Contents read/write);
  - **upgrade Supabase to Pro before real learner data goes in**;
  - what the teacher sees on install (SmartScreen, unknown apps);
  - how the Windows update and the Android "Download" banner work.

- [ ] **Step 1: Write `release.yml`.** Check it parses: `npx --yes yaml-lint .github/workflows/release.yml` (or `python -c "import yaml,sys;yaml.safe_load(open(sys.argv[1]))" .github/workflows/release.yml` after `pip install pyyaml`). Expected: no error.
- [ ] **Step 2: Write `docs/release.md`.**
- [ ] **Step 3: Run** `npx.cmd vitest run`. Expected: unchanged.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "ci: release workflow (Windows + Android to klasilid-releases) and owner runbook"`

---

### Task 6: Go live (owner present; every outward step needs his "yes")

**Files:**
- Modify: `docs/plans/backlog.md` (mark what's live), `apps/landing/privacy.html` (the owner's facts, when given)

Each numbered step below is one ask-then-do. Write down every URL and project ref in the ledger (they aren't secret).

- [ ] **Step 1: GitHub repos.** Ask, then:
  - `gh repo create CalPogi/klasilid --private --source . --remote origin --push`;
  - `gh repo create CalPogi/klasilid-releases --public --description "Klasilid downloads"`, with a README (what Klasilid is, landing link) committed through `gh api` or a temp clone.
  - Expected: both repos exist, and the private one has all branches' history on `main`.
- [ ] **Step 2: Secrets the builder sets** from the key folder, through stdin redirection so the values never show:
  - `gh secret set TAURI_SIGNING_PRIVATE_KEY < updater.key`;
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `ANDROID_KEYSTORE_PASSWORD` and `ANDROID_KEY_ALIAS` from `README.txt` values via stdin;
  - `ANDROID_KEYSTORE_B64` from the base64 of the `.p12`.
  - Variable: `gh variable set CLOUDFLARE_ACCOUNT_ID` (from `wrangler whoami`).
- [ ] **Step 3: Secrets the owner sets.** Give him these two commands to run himself:
  - `gh secret set RELEASES_TOKEN`, after he creates a fine-grained token: resource owner CalPogi, repository `klasilid-releases` only, Contents read and write;
  - `gh secret set CLOUDFLARE_API_TOKEN`, after he creates a Cloudflare token from the "Edit Cloudflare Pages" template, or a custom token with Account → Cloudflare Pages → Edit.
- [ ] **Step 4: Dry-run release.** Run `gh workflow run release.yml -f tag=v0.0.1 -f dry_run=true`, then `gh run watch`. Expected: `test`, `windows` and `android` succeed, and `publish` is skipped. Fix CI until green, committing each fix as `ci: …`. Download both artifacts and check that `Klasilid-Setup.exe` and `Klasilid.apk` exist.
- [ ] **Step 5: Supabase.**
  1. The owner creates project **klasilid** in the dashboard: region Southeast Asia (Singapore), free plan, his own database password.
  2. The builder runs `npx supabase link --project-ref <ref>`.
  3. The owner runs `npx supabase db push` in the Terminal panel (it asks for his database password).
  4. The builder runs `npx supabase functions deploy tap --no-verify-jwt` and `… roster --no-verify-jwt`.
  5. Variables: `gh variable set SUPABASE_URL --body https://<ref>.supabase.co`. For `SUPABASE_ANON_KEY`, take `npx supabase projects api-keys --project-ref <ref> -o json` piped through a filter that keeps only the `anon` entry, so the service-role key never prints.
  6. Expected: the `tap` function answers `401` to a request with no key (`curl -s -o /dev/null -w "%{http_code}" -X POST https://<ref>.supabase.co/functions/v1/tap -d '{}'` prints `400` or `401`).
- [ ] **Step 6: Teacher account.**
  1. The owner adds the user in Authentication → Users: email `<username>@login.klasilid.app`, his chosen first password, auto-confirm on.
  2. Give him one line for the SQL editor: `insert into profiles (id, role, display_name) values ('<user id>', 'teacher', 'Ma''am <name>');`.
- [ ] **Step 7: Pages.**
  1. Ask, then `npx wrangler@4 pages project create klasilid --production-branch main`.
  2. Once the owner has given the privacy facts (responsible party, contact), fill in `privacy.html`, commit and push. `pages.yml` deploys.
  3. Expected: `https://klasilid.pages.dev/` shows the landing page, and `/app/` shows the sign-in page (online mode).
- [ ] **Step 8: First release.** Ask, then `git tag v0.6.0 && git push origin v0.6.0`, and watch until `publish` succeeds. Expected:
  - `https://github.com/CalPogi/klasilid-releases/releases/latest/download/latest.json` serves version `0.6.0`;
  - both landing download buttons download files;
  - the owner installs the Windows app and signs in with the teacher account;
  - the first-time setup wizard opens.
- [ ] **Step 9: Update path.** Tag `v0.6.1` with a one-line change (e.g. the About text in Settings), and check that the installed Windows app shows "A new version of Klasilid is ready (version 0.6.1)" and updates after "Restart to update". Android: the owner installs the 0.6.0 APK and sees the "Download" banner for 0.6.1.
- [ ] **Step 10: Commit** the backlog update: `git commit -am "docs: plan 6a live"` and push.

---

## After this plan

- **Plan 6b (reader relay):**
  - device `local_ip`/`last_seen_at` updates and the `relay_taps` RPC;
  - firmware `/clock`, `/beep` and the IP header;
  - pairing in Settings → Reader;
  - the relay loop and the Door reader page;
  - the Android Wi-Fi binding (design §6–7).
- **Before real learner data:** upgrade Supabase to Pro (`docs/release.md`).
