# Klasilid brand redesign and school-code sign-up: design

Date: 2026-11-16. Extends `docs/2026-11-15-klasilid-design.md` and `docs/2026-11-16-apps-and-release-design.md`. Where they disagree, this document is newer.

## Why

The owner wants the **principal and the other advisers of San Isidro West Central School (SIWCS)** to see Klasilid and want door readers for their own sections. Today it looks home-made: a placeholder lowercase "k" logo, a plain landing page, and a sign-in screen copied from an early mockup. "Commercial grade" means it should look like software a school would trust and pay for.

**Scope decided by the owner:**
- **SIWCS only.** Not nationwide, at least for now. The data model already allows more schools later.
- **Accounts:** other SIWCS advisers create their own accounts on a **sign-up page with a school code** the owner gives out. Parents and students still get printed login slips (main spec §7).
- **Pricing:** no public price. The landing page's next step is "Request a door reader for your section", and the owner follows up in person. The ₱49/month idea is parked.
- **Design medium:** a **Claude Design canvas** on claude.ai. The owner reviews and comments there. The approved canvas becomes the new visual reference, replacing the v37 mockup for these screens, and the app is then made to match it exactly (the owner's standing rule).

## Goals

1. **Brand:** a real Klasilid logo (mark and wordmark), app icon, colour palette, and type. On the canvas the owner picks from two or three distinct logo directions. One of them evolves the current orange "k" mark; the others may depart from it.
2. **Landing page**, desktop and phone, written for SIWCS's principal first and advisers second:
   - the problem: attendance and paper forms take time, late and absent learners are hard to follow, the internet is unreliable;
   - what Klasilid does: attendance taken at the door by card tap, on time and late marked automatically, works without internet, seat plan, and SF2 (coming);
   - what the principal gets: every section's attendance at a glance, fewer paper forms;
   - what a section gets: the door reader, student cards, setup in the classroom;
   - real app screens as proof;
   - the next step: **Request a door reader** (a short form), plus Download for Android / Windows and Open in browser;
   - no learner data, no prices.
3. **Sign-in page** (web and app), desktop and phone, in the new brand. It keeps the current behaviour: username or email, password, "Forgot password?", the parents' login-slip note, and a link to sign up.
4. **Sign-up page**, desktop and phone:
   - fields: school code, the teacher's name (as shown in the app, e.g. "Ma'am Lou"), username, password (8+ characters), and password again;
   - after sign-up she lands in the first-time setup wizard, which already knows her school is SIWCS.
5. **Make it real in code** after the canvas is approved: new brand tokens, logo and icons; the landing page; the sign-in and sign-up screens; and the sign-up backend (below).

## Non-goals

- Redesigning the rest of the app (Today, Attendance, etc.). They keep the v37 look, recoloured only if the new palette changes the accent. A full app restyle would be its own project.
- Nationwide sign-up, school directory, principal dashboard, billing (all parked).
- A public price list.

## Anti-goals

- A brand that looks generic, like "AI template" SaaS: gradient blobs, stock illustrations, vague slogans. The owner has rejected "too AI-ish" designs before. It should feel specific to Philippine public-school teachers, with plain, confident wording.
- Anyone without the school code creating an account.
- The landing page promising features that don't exist yet. SF2 and the reader relay are marked "coming".
- Breaking the existing sign-in, offline start-up, or demo mode.

## How the sign-up works (backend)

- **School code:**
  - SIWCS gets a sign-up code, 8 characters from an unambiguous alphabet (no 0/O, 1/I), e.g. `SIWC-7KQ4`.
  - Only its SHA-256 hash is stored, on the school row.
  - The owner makes or replaces it with a small script, like `scripts/new-reader.mjs`; replacing it voids the old one.
- **New Edge Function `signup`** (Deno, deployed with `--no-verify-jwt`, logic in a tested pure handler like `tap` and `roster`). It:
  1. checks the code against the stored hash in constant time;
  2. checks the username format (the app's existing rules) and that it's free;
  3. creates the auth user `<username>@login.klasilid.app` with the admin API, already confirmed;
  4. creates the `profiles` row (role `teacher`, display name);
  5. returns the school's id and its current school year (if one exists), so the setup wizard joins SIWCS instead of creating a new school.
  - Wrong codes are slowed down: the reply waits ~1 s, and after 10 failures from one address within 10 minutes the function refuses for 10 minutes.
- **Supabase's own public sign-up is turned off,** so the function is the only way to make a teacher account. The owner flips the dashboard setting; the plan names it.
- **The setup wizard** uses the school and year from sign-up. If the year exists, she skips the school-year step and its calendar; `setup_class` already accepts existing ids. Other advisers must be able to read SIWCS's shared calendar (an RLS change to check in the plan).
- **"Request a door reader" form:** name, section, contact (phone or email), and a message. It's stored in a new `reader_requests` table: anyone can insert, nobody can read except the owner via the dashboard. The owner checks it in Supabase. Spam guard: a hidden honeypot field and a per-address rate limit in a small function. (Owner may choose another destination; see open questions.)

## Approach

| | Approach | Trade-off | |
|---|---|---|---|
| **A (picked)** | Claude Design canvas: brand sheet + landing + sign-in + sign-up (desktop and phone) → owner comments → approved canvas becomes the reference → port to code | Easy for the owner to react to visuals and comment in place; one approved reference | Owner picked |
| B | New HTML mockup v38 in the repo | Viewable only here in the browser pane; no in-place comments | |
| C | Straight into code | Fastest, but each change of mind costs code, and there's no single design to approve | |

## Constraints

- Keep the existing stack (Svelte app, static landing on Cloudflare Pages, Supabase). The new brand reaches the app through `mockup.css` tokens and overrides, the landing page's `styles.css`, and `apps/desktop/app-icon.svg`, from which the icons regenerate.
- Fonts must load offline in the apps, or fall back gracefully. A self-hosted font is preferred over Google Fonts if the new type allows it, which also removes the Google Fonts call from the privacy notice.
- Accessibility basics: text contrast at least WCAG AA, visible focus states, labels on every field. Works at 375 px.
- All existing tests keep passing. New logic (code check, username checks, rate limit, request validation) gets tests, in the same style as plan 5's `roster` handler.
- Nothing is deployed without the owner's go-ahead: the `signup` function, the auth setting, the new site.

## Decisions after the builder check (builder's calls unless marked)

- **The canvas:** Claude builds it with the Claude Design artifact type. Each artboard is HTML/CSS Claude writes, so the approved canvas carries exact tokens, spacing and the logo SVG for the port, and nothing is re-measured from screenshots.
- **Where this ships:** as an update after the live v0.6.0 (6a is deployed: Supabase, Pages and the v0.6.0 release). The landing page and sign-in are replaced in v0.7.0.
- **The SIWCS school row:**
  - The sign-up code script (`scripts/school-code.mjs`) creates SIWCS's school row with a fixed id if it's missing, and stores the code's hash in a **separate table `school_signup_codes`** that no signed-in user can read (`schools` is readable by all).
  - The owner's mother signs up through the same page, so no hand-made account or SQL line is needed.
  - The first adviser to complete setup creates the school year and becomes its calendar admin; the owner should have his mother sign up first. The other advisers join that year.
  - The "current" year is the one whose dates include today, else the latest by start date.
- **The calendar:** shared. Only the year's admin edits school-wide days (holidays, suspensions, half days); other advisers read it. Per-class exceptions stay out of scope.
- **One section, one adviser:** a unique constraint on (school year, grade, section) for advisory classes, so two advisers can't claim "Gr. 6 Diamond".
- **Password resets for advisers:** sign-up has an **optional** "Email for password resets" field.
  - With an email: "Forgot password?" sends a reset link through Supabase's built-in mailer, which has a low hourly limit but is enough for one school.
  - Without one: the sign-in page says "Ask the Klasilid admin to reset it", and a small owner script sets a temporary password.
  - The Account page already lets her add or change the email later.
- **If the code leaks:** the owner replaces it (the old one stops working). A script lists who signed up and when, and can disable an account (Supabase ban). There's no approval queue or use limit, which is enough for one school.
- **Usernames:** lowercase letters, digits, `.` `_` `-`, 3–30 characters, sharing the login-slip namespace. A reserved list blocks `admin`, `klasilid`, `support` and the like.
- **The code itself:** 8 random characters from an unambiguous alphabet, shown as `XXXX-XXXX`.

## Left to the builder (Claude) on the canvas

- The logo directions themselves, the palette, the type pairing, the layout and copy, within the anti-goals.
- Which real app screens to show as proof (from the running app or the v37 mockup).

## Owner's answers (2026-11-16)

1. **Door reader requests go to the owner's email.** Builder's call on how: a "Request a door reader" button opens the visitor's own email app with a prefilled subject and body (name, section, contact, message). There is no form backend, no `reader_requests` table and no spam to manage. This replaces the table described above.
2. **The landing page does not name the school.** Wording like "built with advisers at a public elementary school in Isabela" instead.
3. **The owner is named as the maker, with his email.** On the canvas both are visible placeholders, `[YOUR NAME]` and `[YOUR EMAIL]`, which the owner fills in during review. The privacy notice gets the same values and can then be published.
4. **No testimonial** from the owner's mother.

## Approved canvas (2026-11-16)

The owner approved the Claude Design canvas "Klasilid Brand Redesign" (https://claude.ai/artifact/LQUuLx898BG7FU4tqW7bvq). It is now the reference for these screens, and the app must match it exactly.
- **Tokens unchanged:** orange #FF7A1A, ink #16161A, the app's greys, Plus Jakarta Sans, radii 10/14/20/28. The owner rejected re-themes.
- **Logo: Ribbon K.** An ink tile (rx 19 on a 64 grid) with an orange vertical stroke and a white chevron woven over it, knocked out with an ink stroke. It replaces the orange "k" tile in the app sidebar, mobile top bar, favicon, app icon and the landing page.
- **Landing page:**
  - real screenshots of the app with sample data only (no real names, section or place);
  - sections: hero; one school morning; the month; the door reader (photo placeholder); for the principal; request band (mailto); get the app; questions; footer;
  - the phone screenshot overlays the laptop one at 22% of its width.
- **Sign-in and sign-up:** an Instagram-style layout (two phones with real screens beside a bordered form box, then a second box linking the other page, then "Get the app") with UI/UX rules applied:
  - visible labels and 48 px fields at 16 px text;
  - 44 px minimum targets;
  - a show/hide password button;
  - correct autocomplete hints;
  - errors next to their fields, plus a linked summary on sign-up;
  - a busy state on submit.
  - On narrow screens the phones are hidden and the box border dropped.
- **No role toggle on sign-in.** Everyone signs in the same way.
- **Optional reset email on sign-up: deferred (builder's call).** Changing the account email today switches sign-in from username to that email, and sending resets to a separate address needs an email service. Version 1 has no email field. Advisers who forget their password ask the Klasilid admin (the owner resets it in the Supabase dashboard). The existing Account-page email change is a backlog item.
- **Privacy notice:** still held back (owner skipped it). The landing footer has no privacy link until it is filled in.

## Change after release step 5 (2026-11-17): invite link instead of a typed code

The owner decided advisers should not type the school code. Chosen over open sign-up with owner approval, and over no check at all (anyone could claim a section).

- The admin sends each adviser a link: `https://klasilid.pages.dev/app/#/signup?invite=XXXX-XXXX`. The code travels in the link; the backend, the hash-only storage and the lockout are unchanged.
- The sign-up form has three fields: your name, username, password. Opened without a link, the page says "Ask for your sign-up link".
- Any problem with the code (refused by the server, or not a code at all) shows "This sign-up link doesn't work anymore. Ask the Klasilid admin for a new one."
- After a successful sign-up the code is removed from the address bar and history.
- Canvas boards "Sign up, laptop" and "Sign up, phone" were redrawn for this and approved.
