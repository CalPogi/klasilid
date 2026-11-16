# Klasilid apps, hosting and the reader relay: design

Date: 2026-11-16. Extends the main spec, `docs/2026-11-15-klasilid-design.md` (§5 packaging, §7.11 landing page, §8 reader, §9 offline, §12 distribution). Where this document and the main spec disagree, this document is newer.

## Why

The owner (who builds and supports Klasilid) wants his mother, the adviser of Gr. 6 Diamond, to have Klasilid as a **Windows app and an Android app**, plus a website, all downloadable from **a landing page**. The apps matter beyond convenience. They are the only way the teacher sees the morning's taps when the school internet is down: a browser can't reach the door reader's local address, and a Tauri app can (main spec §9). Today the web app runs only in demo mode on this PC, and nothing is deployed.

Success: the teacher installs the app from the landing page on her laptop and phone and signs in. On a day with no internet, Today still fills up as learners tap, and everything reaches the server once the internet is back. New versions reach her without the owner touching her devices.

## Goals

1. **Hosting.** Deploy the backend to Supabase (migrations, `tap` and `roster` functions). Put the web app and the landing page on Cloudflare Pages.
2. **Apps.** Package the existing web app with Tauri 2 as a Windows installer and an Android APK, built by GitHub Actions on each version tag.
3. **Downloads and updates.**
   - Each release goes to a public downloads repo.
   - The landing page's buttons point at the latest release.
   - Windows updates itself.
   - Android shows "Update available" with a download link.
4. **Reader relay.** In the apps, find the paired reader on the local network and read new taps from it (`GET /taps?since=`). Show them in Today right away and send them to the server through the teacher's own login. Set the reader's clock when it's wrong.
5. **Door reader page.** Replace the "Soon" page with the mockup's Door reader page. It shows status, taps today, cards registered, taps waiting to sync, firmware version and a test beep, plus pairing.

## Non-goals

- Microsoft Store, Google Play, code-signing certificates (main spec §12: after the pilot).
- iPhone app (website only).
- The mockup's "Want one for your class? / Request a door reader" section: phase 3. Leave it out.
- SF2 (plan 3), parent/student accounts (plan 4), grades (plan 7).
- Over-the-air reader firmware updates (still USB).

## Anti-goals (a failure even if it works)

- Any key, token or password in the repo, in a release file, or in a log. Signing keys and deploy tokens live only in GitHub Actions secrets and on the owner's machine.
- Learner data on the landing page or in the public downloads repo.
- The teacher having to type an IP address in the normal case.
- An app update that silently loses offline changes (the outbox must survive updates; it lives in IndexedDB, which Tauri keeps across updates).
- The relay posting taps that the reader's own upload then duplicates as separate taps. Both paths must produce the same tap id.

## Decisions already made by the owner

- **Tauri 2** for Windows and Android (main spec §5).
- **Code repo:** private GitHub repo, account `CalPogi`.
- **Builds:** GitHub Actions. This PC has no Rust, C++ build tools, NDK or Java, and the connection is slow, so nothing native is built locally.
- **Downloads:** a separate **public** repo `CalPogi/klasilid-releases`, holding only release files (installer, APK, `latest.json`). It was picked over Cloudflare R2, which needs a payment card, and over Pages file hosting (25 MB limit).
- **Web hosting:** Cloudflare Pages for the landing page and the web app. Vercel was dropped because its free plan bars commercial use.
- **Backend:** Supabase. The owner's account already has other projects; Klasilid gets its own.
- **Sign-ins:** the owner signs in on this PC (gh, wrangler and the Supabase CLI are all signed in as of 2026-11-16); the builder runs the commands. The builder never handles the owner's tokens. When a secret value is needed, the owner types it into `gh secret set <NAME>`.

## Approaches considered

| | Approach | Trade-off | |
|---|---|---|---|
| **A (picked)** | One Tauri project wrapping `apps/web`; Actions builds Windows on `windows-latest` and Android on `ubuntu-latest`; releases published to the public `klasilid-releases` repo; Pages for the web | One packaging tool. Free, no card, no size limits, every phone. One extra GitHub token for cross-repo publishing. | Owner picked |
| B | Same, with downloads on Cloudflare R2 | Cleanest single place for files, but R2 needs a card on file | Declined |
| C | Same, with downloads on Pages next to the landing page | No card, but 25 MB per file forces a 64-bit-only APK, leaving out some older phones | Declined |
| — | Capacitor for Android | A second packaging tool; the main spec already chose Tauri | Ruled out |

## Design

### 1. Repos and secrets

- **Private repo `CalPogi/klasilid`:** this project as it is, pushed with its history. The `.superpowers/` folder and `firmware/.pio/` are ignored.
- **Public repo `CalPogi/klasilid-releases`:** a README (what Klasilid is, the link to the landing page) and GitHub Releases. No source code.
- **GitHub Actions secrets in the private repo.** Names are fixed here; values are set by the owner with `gh secret set`, except the generated keys, which the builder generates and sets:

| Secret | What | Who sets it |
|---|---|---|
| `RELEASES_TOKEN` | Fine-grained token with Contents read/write on `klasilid-releases` only, so the build can publish there | Owner creates it on GitHub and runs `gh secret set` |
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Updater signing key (`tauri signer generate`) | Builder generates and sets; a backup copy goes to the owner outside the repo |
| `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` | APK signing key | Builder generates and sets; a backup goes to the owner |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Pages deploys from Actions | Owner creates the token (Pages edit only) and sets it; the account id is not secret |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Baked into the web build (public values; Actions **variables**, not secrets) | Builder, from the Supabase project |

**Losing either signing key means existing installs can't update.** The owner keeps the backups somewhere safe; the bring-up doc says so.

### 2. Supabase deploy

- **Plan (owner, 2026-11-16): free now, Pro later.** Klasilid is the account's second active project, which the free plan allows. The free plan has no automatic backups and pauses a project after a week with no activity. So 6a adds a weekly GitHub Actions job that makes one harmless request, keeping the project awake through school breaks. Upgrade to Pro (US$25/month, daily backups) before real learner data goes in. The bring-up doc and the app's setup notes say so.
- Create project **klasilid** in **ap-southeast-1** (Singapore, nearest the Philippines). It needs a strong database password, which the owner chooses and types in himself.
- Push all migrations. Deploy `tap` and `roster` with `--no-verify-jwt`.
- Add the new migration from §6 (relay RPC, device `local_ip`/`last_seen_at` updates).
- Teacher account. There is no sign-up flow (by design: parents and teachers get accounts from the owner).
  - The owner creates the teacher's auth user in the Supabase dashboard as `<username>@login.klasilid.app`, with a password the teacher changes on first sign-in (Account page).
  - The builder adds a small SQL script to insert her `profiles` row.
  - The first-time setup wizard (plan 2a) then creates her school year and class.

### 3. Web hosting (Cloudflare Pages)

- One Pages project **klasilid**.
  - The landing page is at `/`; the web app is at `/app/`. The app already uses hash routing, so `/app/#/today` works with no server rules.
  - The free `klasilid.pages.dev` address is used until a domain is bought. The domain isn't checked yet (main spec §12).
- The landing page is a new static folder `apps/landing`: plain HTML and CSS, no framework, no learner data. Its look follows the mockup's tokens and type (orange `--accent:#FF7A1A`, same fonts and radii) so it reads as the same product.
- Landing content (main spec §7.11):
  - what Klasilid is, in a few lines for teachers and parents;
  - buttons **Download for Android**, **Download for Windows**, **Open in browser**;
  - the **privacy notice** as its own page, `/privacy`.
  - The download buttons use GitHub's stable "latest release" links on `klasilid-releases` (`/releases/latest/download/<fixed-name>`), so the landing page never changes per release.
  - The door reader request link is left out (phase 3).
- Deploys: on every push to `main`, an Actions workflow builds `apps/web` (base `/app/`) and `apps/landing`, merges them into one folder and runs `wrangler pages deploy`.

### 4. Tauri apps

- New folder `apps/desktop` holding the Tauri 2 project (`src-tauri`). It points at the `apps/web` build (base `./` for the app bundle).
- App id `app.klasilid.teacher`, product name **Klasilid**, version from the git tag.
- Plugins: `http` (reader calls; allowed URLs limited to private-network addresses and the Supabase/releases hosts), `updater` (Windows), `opener` (Android: open the APK download link).
- **The web app must keep working as a plain website.** Tauri-only features sit behind one small module (`lib/native.ts`) that reports whether it runs in Tauri. In the browser, the relay and the Door reader's local status are simply absent, and the page says "Open the Klasilid app on the classroom laptop or phone to talk to the reader directly".
- **Windows:** NSIS `.exe` installer (the smaller, simpler of the two Tauri offers), named `Klasilid-Setup.exe` in each release. It keeps the "unknown publisher" warning until signing (main spec §12); the landing page tells the teacher how to get past SmartScreen ("More info → Run anyway").
- **Android:**
  - One universal signed APK (`Klasilid.apk`), so it works on old 32-bit phones too.
  - The Android project (`gen/android`) is generated on Actions, because this PC can't run the generator, and committed back to the repo by a one-off workflow. Release signing is then configured in its Gradle file.
  - The landing page explains "Install unknown apps".
- **Updates:**
  - Windows uses the Tauri updater against `https://github.com/CalPogi/klasilid-releases/releases/latest/download/latest.json`, signed with the updater key.
  - Android reads the same `latest.json` on start and once a day. If a newer version is listed, a banner says "A new version of Klasilid is ready" with **Download**.

### 5. Release pipeline

- Trigger: pushing a tag `v*`, e.g. `v0.6.0`.
- Jobs:
  1. Run the test suite.
  2. Build Windows on `windows-latest`.
  3. Build Android on `ubuntu-latest` (JDK 17, NDK, Rust Android targets).
  4. Publish: create the release `v0.6.0` on `klasilid-releases` with `Klasilid-Setup.exe`, `Klasilid.apk` and `latest.json` (version, notes, Windows signature and URL), using `RELEASES_TOKEN`.
- Free Actions minutes are 2,000 a month, and Windows counts double. A release is about 40–60 billed minutes, which is enough for dozens of releases a month.

### 6. Reader relay and clock (apps only)

- **Finding the reader.**
  - Firmware change: the reader sends its local IP to the server as a header on its roster fetch and tap uploads.
  - The `tap` and `roster` functions store it in `devices.local_ip`, with `last_seen_at` and `firmware` (`last_seen_at` exists today but nothing sets it).
  - The teacher can already read her own devices (RLS). Grant her `local_ip` too.
  - The app tries the saved address first, then `192.168.4.1` (the hotspot). It doesn't use a `.local` name, because Android can't resolve one.
  - **The reader rebooted during an internet outage and got a new address (builder's call):** if neither answers, the app sweeps the saved address's /24 for `GET /status` (300 ms timeout, 32 at a time, about 3 s in all) and accepts only the reply whose `deviceId` matches the paired reader. That needs no native code. The owner can also ask the school IT to reserve the reader's address, and the bring-up doc suggests it.
  - As a last resort, the Door reader page has a field for an address, shown on the reader's screen. To support that, the reader's idle screen shows its IP for a few seconds after connecting.
- **Android on the reader's hotspot (builder's call):** a phone joined to "Klasilid-Diamond" sees a network without internet, and Android then sends traffic over mobile data, so 192.168.4.1 is unreachable. 6b adds a small Kotlin piece that binds the reader calls to the Wi-Fi network (`ConnectivityManager.bindProcessToNetwork`, or a per-request network). It's verified at bring-up; until then the Door reader page tells a phone user on the hotspot to turn mobile data off if the reader isn't found.
- **Pairing.**
  - In **Settings → Reader**, where the mockup already has the "Pair reader" button, the teacher enters the reader's 8-digit pairing code once per device. The app stores it locally (IndexedDB meta, like the session) and sends it as `x-pairing-token`.
  - A wrong code shows "That pairing code isn't right". After 5 wrong codes the reader locks for a minute (plan 5's lockout), and the app says "Wait a minute, then try again".
- **Relay loop.** While the app is open and the reader answers:
  - Every 15 s it fetches `GET /taps?since=<last seq seen>` and stores the taps in the local `taps` table, with the same id the server would build (`deviceId-seq-tappedAtMillis`). Today recalculates.
  - It queues them for upload. New RPC `relay_taps(p_device_id text, p_taps jsonb)`, security definer:
    - checks the caller teaches the device's class;
    - inserts with the same id scheme and the same rules as the `tap` handler (UID format, clock-suspect flag, `on conflict do nothing`).
  - So a tap that arrives by both paths is stored once.
- **Clock.**
  - Firmware change: a new `POST /clock {unix}` on the local API (pairing token required). It sets the DS3231 and marks the time as synced from the app.
  - The app calls it when `/status` says `clockOk: false`, or when the reader is more than 2 minutes off the device's time.
  - It never does this if the device's own clock looks wrong: before 2026, or differing from the server's `Date` header when online.
- **Test beep.** Firmware change: `POST /beep` (pairing token required) runs the "ok" beep.

### 7. Door reader page

- The mockup's page (v37, `data-page="reader"`), ported verbatim like every other page (the owner's rule: match the mockup exactly). Changes:
  - The "Backup battery: About 8 hours in a brownout" row becomes "Power bank: keeps it running in a brownout" (main spec §8: no battery board).
  - Remove "Want one for your class?" (phase 3).
- Data comes from the local `/status` when reachable, otherwise from the server (`devices.last_seen_at`, firmware, unsent counts unknown):
  - Online/offline and last tap;
  - taps today (local);
  - cards registered (local);
  - taps waiting to sync (reader `unsent` when reachable, otherwise "—");
  - software version.
- Buttons: **Test beep** (local only), **Register cards** (opens the existing Students registration).
- **Screens the mockup doesn't have (builder's call):** the pairing dialog and its errors, the manual address field, the browser-only note, the Android update banner and the Windows update prompt are built from the mockup's existing parts: its modal, `.field`, `.warn`/`.banner-bad` banners and buttons, with the same CSS classes and no new visual style. The owner sees them in the running app before release.

## Constraints

- Builds only on Actions; local checks are the Vitest suite and the firmware compile, as in plan 5.
- The web app's existing tests (233) keep passing. New logic (relay merge, id building, `latest.json` version compare, reader address order, clock decision) gets Vitest tests. The new SQL RPC gets PGlite tests like plan 1's RPCs.
- Firmware changes (IP header, `/clock`, `/beep`, IP on screen) follow plan 5's testing constraint: Unity tests for any pure logic, compile-only until the board arrives.
- Nothing is published, pushed, created or deployed without the owner's go-ahead in chat at that step: creating the repos, the first push, creating the Supabase project, the first Pages deploy, the first release.

## Still open (defaults until the owner answers)

- **The teacher's devices.** The builds target Windows 10/11 64-bit (x64 NSIS installer) and Android 7+ (`minSdk 24`, universal APK with arm64, armv7, x86_64). If her laptop turns out to be 32-bit, a 32-bit Windows build is one more Actions target.
- **Privacy notice facts:** who is named as responsible for the data (the owner or the school), the removal contact, and how long records are kept. The draft uses visible placeholders, `[RESPONSIBLE]` and `[CONTACT]`, and "the current school year plus one year, then deleted". The first Pages deploy waits until the owner fills them in.

## Left to the builder

- Exact Tauri config, capability files, and how the web build is shared between Pages (`/app/`) and Tauri (`./`).
- The workflow file layout and caching.
- Wording on the landing page and privacy notice. The privacy notice must cover what's collected (names, LRN, attendance, taps, guardian contacts, letter photos), who sees it, where it's stored (Supabase, Singapore region), how long, and how to ask for removal. The owner reviews the text before the first deploy.
- How the one-off Android project generation commits back (a workflow with `contents: write`).

## Split into plans

This is two plans, built in order:
- **6a, Release and hosting:** §1–5. Repos, Supabase deploy, Pages, landing page and privacy notice, Tauri project, release workflow, updates. Ends with v0.6.0 installed from the landing page.
- **6b, Reader relay:** §6–7. The relay RPC and device fields, firmware endpoints, relay loop, clock, Door reader page.
