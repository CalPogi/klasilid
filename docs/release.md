# Releasing Klasilid

For the owner. How new versions get built and reach the teacher, where the keys are, and what to do before real learner data goes in.

## Where things live

| What | Where |
|---|---|
| Code (private) | `github.com/CalPogi/klasilid` |
| Downloads (public) | `github.com/CalPogi/klasilid-releases`, one GitHub Release per version with `Klasilid-Setup.exe`, `Klasilid.apk`, `latest.json` |
| Landing page and web app | Cloudflare Pages project `klasilid` (`klasilid.pages.dev`; the app is at `/app/`) |
| Backend | Supabase project `klasilid` (Singapore) |
| Signing keys | `C:\Users\titus\Klasilid-keys\` on your PC, and as GitHub Actions secrets. **Never in the repo.** |

## Releasing a new version

1. Start from the latest `main`, and make sure the tests pass:
   ```bash
   git checkout main
   ```
   ```bash
   git pull
   ```
   ```bash
   npx.cmd vitest run
   ```
2. Pick the next version number. Use three numbers, `v0.6.1`; bump the last one for fixes and the middle one for new features.
3. Tag and push:
   ```bash
   git tag v0.6.1
   ```
   ```bash
   git push origin v0.6.1
   ```
4. Watch it on GitHub → Actions → **release**. It takes about 20–30 minutes. `test`, `windows`, `android` and `publish` should all go green.
5. Check `https://github.com/CalPogi/klasilid-releases/releases/latest`. It should show the new version with three files.

To try a build without publishing, run the workflow by hand: Actions → release → Run workflow, type a tag, and keep **Build only** ticked.

**If a release fails:** open the failed run and use **Re-run failed jobs**. If it failed during **publish** after the release was half made, delete that release on `klasilid-releases` first, then re-run. Never reuse a version number that reached phones or laptops; use the next one.

The website updates by itself on every push to `main`; it doesn't need a tag.

## The admin section

Schools, sign-up codes, teachers and door readers are managed in the app itself, signed in as the **owner** (design: `docs/2026-11-19-admin-design.md`). It works on the website and the apps, on a laptop or a phone. Signing in as the owner on a teacher's device leaves her data and her saved login alone.

**Owner account (once):**
1. Supabase → Authentication → **Add user**. Email: `<your username>@login.klasilid.app` (pick a username that isn't a teacher's), a password you type yourself, and tick **Auto confirm user**. Copy the new user's **User UID**.
2. Supabase → SQL editor, with your UID and name:
   ```sql
   insert into profiles (id, role, display_name) values ('<User UID>', 'owner', '<your name>');
   ```
3. Sign in to Klasilid with that username and password. The first time, it asks you to turn on two-step sign-in: scan the QR code with an authenticator app (Google Authenticator or similar) and type its 6-digit code. After that, every sign-in asks for the code.

**Lost your phone:** Supabase → Authentication → your owner user → remove its MFA factor. Then sign in again and set it up on the new phone.

**Deploying the admin section** (once per change to these parts; the website deploys itself on push):
```bash
npx.cmd supabase db push
```
```bash
npx.cmd supabase functions deploy admin --remote=wfcidrghcrpzdekckseg --use-api --yes
```
```bash
npx.cmd supabase functions deploy tap --no-verify-jwt --remote=wfcidrghcrpzdekckseg --use-api --yes
```
```bash
npx.cmd supabase functions deploy roster --no-verify-jwt --remote=wfcidrghcrpzdekckseg --use-api --yes
```
`admin` keeps JWT verification on (no `--no-verify-jwt`): only a signed-in owner who passed two-step sign-in gets through. `tap` and `roster` now also record when each reader last connected.

The scripts `scripts/school-code.mjs` and `scripts/new-reader.mjs` still work as a fallback.

## How the teacher gets updates

- **Windows:** the app checks at start-up and once a day. When a new version exists, a banner says "A new version of Klasilid is ready". **Restart to update** downloads it, installs it quietly and reopens the app. Her saved data and unsynced changes stay.
- **Android:** the same banner, with **Download**. It downloads the new APK; she opens it and taps **Update**.

## The keys: back them up

`C:\Users\titus\Klasilid-keys\` holds:
- `updater.key` (+ `.pub`): signs Windows updates;
- `klasilid-release.p12`: signs the Android app;
- `README.txt`: their passwords.

**If either key is lost, the installed apps can never update themselves again.** On Windows she could still install a new `Klasilid-Setup.exe` over the old one and keep her data. On Android she would have to uninstall and reinstall, and changes on that phone that hadn't synced would be lost. Copy the folder to a USB drive and keep the passwords in a password manager. Don't email it or put it in a chat or a repo.

## Tokens you control

- **`RELEASES_TOKEN`** lets the build publish to `klasilid-releases`. It's a GitHub fine-grained token with access to that one repo, Contents read and write. When it expires (GitHub shows the date), make a new one the same way, then run `gh secret set RELEASES_TOKEN` in the project folder and paste it when asked.
- **`CLOUDFLARE_API_TOKEN`** lets the website deploy. It's a Cloudflare token from the "Edit Cloudflare Pages" template. To replace it, make a new one, then run `gh secret set CLOUDFLARE_API_TOKEN`.

## Before real learner data goes in

- **Upgrade Supabase to Pro** (US$25 a month): dashboard → Organization → Billing. Pro has daily backups; the free plan has none, and the design requires them. After upgrading, you can delete `.github/workflows/keepalive.yml` (it only stops the free plan pausing the project).
- **Publish the privacy notice:** fill in `docs/privacy-notice-draft.html` (who is responsible, the contact for removal requests), move it back to `apps/landing/privacy.html`, and add the "Privacy notice" link to the landing page footer. The website won't deploy while it still has `[PLACEHOLDERS]`.
- Have the principal's written approval (main design §11).

## What the teacher sees when installing

- **Windows:** "Windows protected your PC" (SmartScreen), because Klasilid isn't signed or in the Microsoft Store yet. **More info → Run anyway**. It installs for her user only, so no admin password is needed.
- **Android:** the browser asks to allow **Install unknown apps**. Allow it for the browser, then **Install**. Google Play Protect may warn about an unrecognized app; choose **Install anyway**. Android 7 or newer.

The landing page explains both.
