# Klasilid Plan 6c: Brand and school-code sign-up

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the approved canvas into the product (Ribbon K logo, new landing page, Instagram-style sign-in and sign-up) and make sign-up real: an SIWCS adviser creates her own account with the school code and lands in a setup wizard that already knows her school.

**Architecture:**
- **Front end:**
  - a `Logo.svelte` component replaces the orange "k" tile everywhere;
  - `SignIn.svelte` is rebuilt to the canvas, and a new `SignUp.svelte` sits at route `#/signup`;
  - the setup wizard gains a "join an existing school" mode.
- **Backend:**
  - a new `signup` Edge Function with a pure, tested handler (like `tap` and `roster`);
  - a migration adding the code table, an attempt log, and the one-adviser-per-section rule.
- **Landing page:** `apps/landing` rebuilt to the canvas, with sample-data screenshots stored in the repo.

**Tech Stack:** Svelte 5, Vite, Dexie, Supabase (Postgres, Deno Edge Functions), Vitest 5, PGlite tests, Tauri icon CLI.

**Spec:** `docs/2026-11-16-brand-and-signup-design.md`. Its "Approved canvas" and "Decisions after the builder check" sections are binding. The visual reference is the canvas https://claude.ai/artifact/LQUuLx898BG7FU4tqW7bvq (boards Logo concepts → Ribbon K, Landing, Sign in, Sign up). Read a board's source with the Artifact tool `read` action when porting it.

## Global Constraints

- **Match the canvas exactly** (owner rule): its markup structure, spacing, sizes, copy and colours. Tokens stay the app's: #FF7A1A, #16161A, the greys, Plus Jakarta Sans, radii 10/14/20/28. Do not re-theme.
- **No real information** anywhere in code, tests, screenshots or copy:
  - no real learner names;
  - not "Diamond" as a section in new marketing material;
  - no school name on the landing page;
  - sample names come from `~/tools/shots/shoot.mjs`.
- **Accessibility floor:**
  - visible labels;
  - 48 px fields at 16 px text, 44 px minimum targets;
  - a show/hide password button with `aria-label` and `aria-pressed`;
  - autocomplete `username`, `current-password`, `new-password`;
  - errors next to their field (`aria-describedby`, `aria-invalid`) plus a linked summary on sign-up;
  - busy state on submit;
  - focus visible;
  - text contrast at least 4.5:1.
- **Security:**
  - the school code is stored only as a SHA-256 hash in a table no signed-in user can read;
  - comparisons are constant-time;
  - after 10 failed sign-up attempts from one address in 10 minutes, refuse for 10 minutes;
  - Supabase's public sign-up is turned off, so only the `signup` function creates teacher accounts.
- **Usernames:**
  - `^[a-z0-9][a-z0-9._-]{2,29}$` (3–30 characters);
  - reserved: `admin`, `administrator`, `klasilid`, `support`, `help`, `root`, `owner`, `teacher`;
  - stored as `<username>@login.klasilid.app` (existing scheme).
- **Passwords:** 8 or more characters.
- **No optional email field on sign-up** (deferred; see the design doc).
- **Release gates:** nothing is deployed, pushed or released without the owner's "yes" at that step. The owner types the database password himself.
- All existing tests (254) keep passing.

## Review Focus

1. **Two advisers claim the same section,** or one finishes setup while the other is mid-wizard. The second gets "Gr. 6 Sampaguita already has an adviser" and nothing half-created. Test in Task 4.
2. **The adviser signs up but closes the app before finishing the wizard.** Next sign-in opens the wizard in join mode again, not a blank-school wizard. Test in Task 3.
3. **Brute-forcing the school code.** The 11th wrong code from one address within 10 minutes gets 429, and a correct code from that address is refused too until the window passes. Test in Task 4.
4. **A username differing only in case or with spaces** ("Maria.Santos ", "maria.santos"). It is normalised to lowercase and trimmed before both the format check and the "already taken" check. Test in Task 4.
5. **Offline at sign-up.** The page says "You need internet to create an account" without losing what was typed. Test in Task 3.

---

## File structure

```
apps/web/src/components/Logo.svelte          Ribbon K svg (size prop), aria-hidden
apps/web/public/favicon.svg                  Ribbon K
apps/web/public/auth/phone-today.png         sample-data screenshots for the sign-in/up pages (from the canvas)
apps/web/public/auth/phone-seats.png
apps/web/public/auth/phone-attendance.png
apps/web/src/pages/SignIn.svelte             rebuilt to the canvas
apps/web/src/pages/SignUp.svelte             new, route #/signup
apps/web/src/lib/signup.ts                   checkSignup(), signUpRemote(), SignupResult
apps/web/src/lib/setup.ts                    JoinSchool + applySetup join mode
apps/web/src/pages/Setup.svelte              join mode skips the school/year step
supabase/migrations/20261117000000_signup.sql
supabase/functions/signup/handler.ts         pure, tested
supabase/functions/signup/index.ts           Deno wrapper (service role)
supabase/tests/signup-handler.test.ts
supabase/tests/signup-sql.test.ts            PGlite: tables, RLS, unique section
scripts/school-code.mjs (+ .test.mjs)        makes a code + SQL (hash only)
apps/landing/index.html, styles.css, img/    rebuilt to the canvas
apps/desktop/app-icon.svg                    Ribbon K (icons regenerated)
```

---

### Task 1: Ribbon K logo everywhere

**Files:**
- Create: `apps/web/src/components/Logo.svelte`, `apps/web/public/favicon.svg`
- Modify:
  - `apps/web/src/components/Shell.svelte` (sidebar `.brand` and `.wtop` "k" spans);
  - `apps/web/index.html` (favicon link);
  - `apps/desktop/app-icon.svg` and `apps/desktop/src-tauri/icons/*` (regenerated);
  - `apps/web/test/shell.test.ts`.

**Interfaces:**
- Produces: `Logo.svelte` with props `{ size?: number = 36 }`. It renders the canvas's Ribbon K svg exactly (viewBox 0 0 64 64; ink tile rx 19; orange stroke `M22 12v40` width 10; ink chevron width 18 under a white chevron width 9, path `M45 13L25 32l20 19`, round caps and joins), with `aria-hidden="true"`.

- [ ] **Step 1: Write the failing test** in `shell.test.ts`: `it('shows the Ribbon K logo, hidden from screen readers, next to the name')`. It expects `.brand svg[aria-hidden="true"]` and no `.brand .logo` text "k".
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/shell.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Write `Logo.svelte`, use it in Shell at 36 px (sidebar) and 30 px (top bar), and add the favicon. Then run `node_modules/.bin/tauri.cmd icon app-icon.svg` in `apps/desktop` and delete `src-tauri/icons/ios`.
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. Open the 128 px icon PNG and check that it shows the Ribbon K.
- [ ] **Step 5: Commit** `feat: Ribbon K logo in the app, favicon and app icon`.

---

### Task 2: Sign-in page to the canvas

**Files:**
- Modify: `apps/web/src/pages/SignIn.svelte`, `apps/web/test/session.test.ts` (or a new `signin-page.test.ts`), `apps/web/src/app.css` (only if a mockup class conflicts)
- Create: `apps/web/public/auth/*.png`, copied from the canvas's sample-data screenshots (scratch `img2/phone-today.png`, `img3/phone-seats.png`, `img3/phone-attendance.png`; re-capture with `~/tools/shots/shoot.mjs` if missing)

**Interfaces:**
- Consumes: the existing `signIn(db, auth, username, password)` and `Logo.svelte` (Task 1).
- Port the canvas board **Sign in** with these behaviours:
  - visible labels Username and Password (the username field also accepts an email, as today);
  - "Forgot password?" sits beside the Password label and opens a short panel. Advisers: "Ask the Klasilid admin to reset it." Parents and learners: "Ask the adviser for a new login slip.";
  - any auth failure shows "That username or password isn’t right. Check both and try again." in the alert box;
  - the submit button shows a spinner and "Signing in…" while busy;
  - "New adviser? Create an account" links to `#/signup`;
  - "Get the app" buttons for Android and Windows, hidden inside the Tauri apps (`platform() !== 'web'`);
  - the phones are hidden below 760 px container width.

- [ ] **Step 1: Write failing tests:**
  - `it('labels both fields and toggles password visibility')`: `getByLabelText('Password')` has `type="password"`; clicking `Show password` makes it `text` and sets `aria-pressed="true"`.
  - `it('shows the generic error and keeps the username after a failed sign-in')`.
  - `it('shows Signing in… and disables the button while waiting')`.
  - `it('links new advisers to #/signup')`.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** to the canvas.
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. In the browser pane (`klasilid-web`), compare 1440 px and 390 px against the canvas boards **Sign in, laptop** and **Sign in, phone**.
- [ ] **Step 5: Commit** `feat(web): sign-in page to the approved design`.

---

### Task 3: Sign-up page, client, and the wizard's join mode

**Files:**
- Create: `apps/web/src/pages/SignUp.svelte`, `apps/web/src/lib/signup.ts`, `apps/web/test/signup.test.ts`
- Modify:
  - `apps/web/src/lib/router.ts` (route `signup`, reachable signed out);
  - `apps/web/src/App.svelte` (show SignUp when signed out and the route is `signup`; after sign-up, sign in and open Setup in join mode);
  - `apps/web/src/lib/setup.ts`, `apps/web/src/pages/Setup.svelte`;
  - `apps/web/test/setup.test.ts`.

**Interfaces:**
- Consumes: the `signup` function contract from Task 4.
- Produces:
  - `export interface SignupInput { code: string; displayName: string; username: string; password: string }`
  - `export type SignupField = 'code' | 'displayName' | 'username' | 'password'`
  - `export function checkSignup(i: SignupInput): Partial<Record<SignupField, string>>`: the same rules as the server, with messages:
    - code: "Enter the school code" or "The school code looks like XXXX-XXXX";
    - displayName: "Enter your name";
    - username: "Use 3–30 small letters, numbers, dots, dashes or underscores" or "That username can’t be used";
    - password: "Use at least 8 characters".
  - `export type SignupResult = { ok: true; schoolId: string; schoolName: string; yearId: string | null } | { ok: false; field?: SignupField; message: string }`
  - `export async function signUpRemote(fetchFn: typeof fetch, baseUrl: string, i: SignupInput): Promise<SignupResult>`: POSTs `/functions/v1/signup` with JSON `{code, displayName, username, password}`, where username is trimmed and lowercased. Maps 400/409/429 bodies `{field?, message}` to `ok: false`. A network failure gives `{ ok: false, message: 'You need internet to create an account.' }`.
  - `setup.ts`:
    - `export interface JoinSchool { schoolId: string; schoolName: string; yearId: string | null }`;
    - `applySetup(db, s, now, join?)`: with `join`, it reuses `join.schoolId`. With `join.yearId` it also reuses the year and queues **no** holidays (the year exists). Without `join.yearId` it creates the year as today.
  - The wizard with a `join` prop shows the school name read-only. It hides the school-year pickers when `join.yearId` is set.
  - `join` is stored in `db.meta` key `join` until setup finishes (Review Focus 2).
- Port the canvas board **Sign up**, without the optional email field (design doc). The error summary lists each server or client error as a link to its field (`href="#suCode"` etc.) and receives focus after a failed submit.

- [ ] **Step 1: Write failing tests:**
  - `checkSignup` table test, including Review Focus 4 (`' Maria.Santos '` is normalised and valid).
  - `signUpRemote` maps a 409 `{field:'username', message:'That username is taken'}`, a 429, and a fetch rejection (Review Focus 5) to the right results.
  - The page: a failed submit shows the summary with links and inline errors, and focus moves to the summary. Typed values stay after an error.
  - `applySetup` join mode with an existing year queues no `calendar_days` upserts and calls `setup_class` with the given school and year ids.
  - `it('reopens the wizard in join mode if the adviser left before finishing')`: `db.meta.join` is set, no class, sign-in opens Setup with the school name shown.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. Do the browser check against **Sign up, laptop** and **Sign up, phone**.
- [ ] **Step 5: Commit** `feat(web): sign-up with a school code and join-mode setup`.

---

### Task 4: Backend: school codes, sign-up function, one adviser per section

**Files:**
- Create:
  - `supabase/migrations/20261117000000_signup.sql`;
  - `supabase/functions/signup/handler.ts`, `supabase/functions/signup/index.ts`;
  - `supabase/tests/signup-handler.test.ts`, `supabase/tests/signup-sql.test.ts`;
  - `scripts/school-code.mjs`, `scripts/school-code.test.mjs`.

**Interfaces:**
- **Migration:**
  - `school_signup_codes (school_id uuid primary key references schools(id), code_hash text not null, created_at timestamptz not null default now())`: RLS on, no policies, all grants revoked from `anon` and `authenticated`.
  - `signup_attempts (id bigint generated always as identity primary key, ip text not null, at timestamptz not null default now(), ok boolean not null)`: same lockdown, indexed on `(ip, at)`.
  - `create unique index one_adviser_per_section on classes (school_year_id, grade, lower(section)) where is_advisory`.
  - `setup_class` raises `'section already has an adviser'` on that conflict (clean message, nothing else inserted: the whole function is one transaction).
- **Handler:**
  - `export interface SignupDeps { schoolForCodeHash(hash: string): Promise<{ schoolId: string; schoolName: string } | null>; currentYear(schoolId: string, today: string): Promise<string | null>; failuresSince(ip: string, since: Date): Promise<number>; recordAttempt(ip: string, ok: boolean): Promise<void>; createTeacher(u: { email: string; password: string; displayName: string }): Promise<{ userId: string } | { taken: true }>; now(): Date }`
  - `export async function handleSignup(body: unknown, ip: string, deps: SignupDeps): Promise<{ status: number; body: unknown }>`
  - Order:
    1. Lockout check: ≥10 failures in 10 min gives 429 `{message:'Too many tries. Wait 10 minutes and try again.'}`.
    2. Validate (same rules and messages as `checkSignup`), giving 400 `{field, message}`.
    3. Look up the code hash (normalise: uppercase, strip spaces and dashes); unknown gives 400 `{field:'code', message:'That school code isn’t right. Check it with the Klasilid admin.'}` and a failed attempt is recorded.
    4. Create the teacher; taken gives 409 `{field:'username', message:'That username is taken'}`.
    5. Return 200 `{schoolId, schoolName, yearId}`, where the current year is the one whose dates contain today (Manila), else the latest by `starts_on`, else null.
- **`index.ts`:** service role. `createTeacher` = `auth.admin.createUser({ email, password, email_confirm: true })`, then insert `profiles (id, role 'teacher', display_name)`. If the profile insert fails, delete the user. The ip comes from `x-forwarded-for`'s first entry. Deploy with `--no-verify-jwt`.
- **`school-code.mjs <school-uuid> [--name "School name"]`:**
  - prints a fresh code `XXXX-XXXX` (alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, `crypto.randomInt`);
  - prints one SQL block:
    - `insert into schools (id, name) values (…) on conflict (id) do nothing`;
    - `insert into school_signup_codes (school_id, code_hash) values (…) on conflict (school_id) do update set code_hash = excluded.code_hash, created_at = now()`;
  - the plain code appears only in the printed message, never in the SQL;
  - exported `makeSchoolCode(schoolId, name?)` for tests.

- [ ] **Step 1: Write failing tests:**
  - Handler: success, bad code (records failure), taken username, validation (including Review Focus 4), lockout at the 11th failure that also blocks a correct code (Review Focus 3), current-year choice.
  - SQL (PGlite): signed-in teachers can't select from either new table; a second advisory class for the same year, grade and section fails through `setup_class` with the message (Review Focus 1).
  - Script: code format, the SQL holds only the hash, normalisation matches the handler.
- [ ] **Step 2: Run** `npx.cmd vitest run supabase scripts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass.
- [ ] **Step 5: Commit** `feat: school-code sign-up function, code table, one adviser per section`.

---

### Task 5: Landing page to the canvas

**Files:**
- Modify: `apps/landing/index.html`, `apps/landing/styles.css`, `scripts/build-site.mjs` (copies `apps/landing/img`)
- Create: `apps/landing/img/{today,seats,attendance,phone-today}.png`, the sample-data screenshots from the canvas (scratch `img2/`), plus `apps/landing/favicon.svg`

**Interfaces:**
- Port the canvas board **Landing page** section by section:
  - Ribbon K in the header;
  - the phone overlay at 22% width;
  - the `[PHOTO: …]` placeholder stays until a real photo exists;
  - the mailto request band;
  - no privacy link (held back).
- `[YOUR NAME]` and `[YOUR EMAIL]` stay as placeholders, so `check-landing` blocks the deploy until the owner gives the exact public name and email.

- [ ] **Step 1:** Port the page, then run `npm.cmd run build -w @klasilid/web && node scripts/build-site.mjs`. Expected: `site/img/*.png` exist.
- [ ] **Step 2:** Preview with `klasilid-site` at 1440 and 390 px. Compare against the canvas boards. Expected: no horizontal scroll at 390.
- [ ] **Step 3:** Run `node scripts/release.mjs check-landing site`. Expected: exit 1 listing `[YOUR NAME]` and `[YOUR EMAIL]` (correct until the owner fills them).
- [ ] **Step 4: Commit** `feat: landing page to the approved design`.

---

### Task 6: Release (owner present; each step needs his "yes")

- [ ] **Step 1:** The owner runs `npx supabase db push --remote` and types his database password.
- [ ] **Step 2:** Deploy the function: `npx supabase functions deploy signup --no-verify-jwt --remote=wfcidrghcrpzdekckseg --use-api --yes`.
- [ ] **Step 3:** The owner turns off public sign-ups: Supabase dashboard → Authentication → Sign In / Providers → "Allow new users to sign up" off. Check: a direct `auth.signUp` returns "Signups not allowed".
- [ ] **Step 4:** Run `node scripts/school-code.mjs <new uuid> --name "<school name the owner gives>"`. The owner runs the SQL in the SQL editor and keeps the printed code. His mother signs up first (design doc).
- [ ] **Step 5:**
  1. The owner fills `[YOUR NAME]` and `[YOUR EMAIL]`.
  2. Push to `main` (Pages deploys).
  3. Tag `v0.7.0` (apps update).
- [ ] **Step 6:** Do an end-to-end check on the live site:
  - sign up with the code;
  - the wizard shows the school;
  - finish setup;
  - sign out and in again.
