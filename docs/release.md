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

1. Make sure `main` is what you want to ship and the tests pass (`npx vitest run`).
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

To try a build without publishing, run the workflow by hand: Actions → release → Run workflow, keep **Build only** ticked.

The website updates by itself on every push to `main`; it doesn't need a tag.

## How the teacher gets updates

- **Windows:** the app checks at start-up and once a day. When a new version exists, a banner says "A new version of Klasilid is ready". **Restart to update** downloads it, installs it quietly and reopens the app. Her saved data and unsynced changes stay.
- **Android:** the same banner, with **Download**. It downloads the new APK; she opens it and taps **Update**.

## The keys: back them up

`C:\Users\titus\Klasilid-keys\` holds:
- `updater.key` (+ `.pub`): signs Windows updates;
- `klasilid-release.p12`: signs the Android app;
- `README.txt`: their passwords.

**If either key is lost, the installed apps can never update again.** She would have to uninstall and reinstall, and unsynced changes on that device would be lost. Copy the folder to a USB drive and keep the passwords in a password manager. Don't email it or put it in a chat or a repo.

## Tokens you control

- **`RELEASES_TOKEN`** lets the build publish to `klasilid-releases`. It's a GitHub fine-grained token with access to that one repo, Contents read and write. When it expires (GitHub shows the date), make a new one the same way, then run `gh secret set RELEASES_TOKEN` in the project folder and paste it when asked.
- **`CLOUDFLARE_API_TOKEN`** lets the website deploy. It's a Cloudflare token from the "Edit Cloudflare Pages" template. To replace it, make a new one, then run `gh secret set CLOUDFLARE_API_TOKEN`.

## Before real learner data goes in

- **Upgrade Supabase to Pro** (US$25 a month): dashboard → Organization → Billing. Pro has daily backups; the free plan has none, and the design requires them. After upgrading, you can delete `.github/workflows/keepalive.yml` (it only stops the free plan pausing the project).
- **Fill in the privacy notice** (`apps/landing/privacy.html`): who is responsible for the data, and the contact for removal requests. The website won't deploy while the placeholders are there.
- Have the principal's written approval (main design §11).

## What the teacher sees when installing

- **Windows:** "Windows protected your PC" (SmartScreen), because Klasilid isn't signed or in the Microsoft Store yet. **More info → Run anyway**. It installs for her user only, so no admin password is needed.
- **Android:** the browser asks to allow **Install unknown apps**. Allow it for the browser, then **Install**. Android 7 or newer.

The landing page explains both.
