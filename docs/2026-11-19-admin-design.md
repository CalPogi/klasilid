# Admin section for the owner

Date: 2026-11-19 Â· Status: approved by the owner on 2026-11-19

Marks: **(decided)** = the owner chose it. **(builder's call, proposed)** = filled in during design, can be changed.

## 1. Why

Today the owner (who builds and runs Klasilid) does every setup step as SQL in the Supabase SQL editor:
- adding a school and making its sign-up code (`scripts/school-code.mjs` prints the SQL);
- adding a door reader (`scripts/new-reader.mjs` prints the SQL); replacing a reader's key means deleting its row and inserting a new one;
- looking up a class id to make reader credentials;
- removing a test account.

He wants to do these by clicking instead of writing SQL, **from anywhere, including his phone** **(decided)**. He is the only admin **(decided)**. The first use is his own test teacher account and a test class on the first reader. When he later moves the reader to his mother's class, the test account is removed.

Success: after a one-time setup, he never needs the SQL editor for these tasks again.

## 2. Approaches considered

- **A. Local admin page on the owner's PC**, using the project's service-role key from a file. Safest (no admin login on the internet) and the least code, but it only works at that PC.
- **B. Admin section inside the Klasilid web app**, behind an owner account. Works anywhere. Costs: a real admin login on the public site, new server code and more testing.
- **C. Saved SQL snippets in the Supabase dashboard.** Almost no work, but it is still SQL.

The owner picked **B** **(decided)**: being able to manage it from anywhere matters more than the extra work. The main risk of B, a stolen password, is handled by two-step sign-in (Â§4).

## 3. Goals, non-goals, anti-goals

Goals:
- **Schools:** list; add a school (name) and get its sign-up code; make a new code (the old one stops working).
- **Teachers:** list (display name, username, school, their classes with a copyable class id); delete an account with all its data.
- **Readers:** list (id, class, school, when it last connected); add a reader for a class; make a new key and pairing code for a reader; retire a reader (Â§5).
- Codes, keys and pairing codes are **shown once** when made (with copy buttons, and the school's invite link ready to copy). They are never stored in plain text, the same as the scripts today.

Non-goals (not in this work):
- Any learner data: names, attendance, cards, corrections. The main design (Â§2, Â§11 of `2026-11-15-klasilid-design.md`) already says the owner reads nothing learner-related; the admin section keeps that. **(decided by the main design)**
- The owner-only list of reader requests (main design Â§10). It waits until the request form exists.
- Moving a reader to another class. Retire it and add it again for the new class, then re-run the reader's hotspot setup (bring-up guide step 6).
- More than one admin, or school-level admins (principal, ICT coordinator).
- Editing teachers (renaming, resetting passwords).

Anti-goals (a failure even if everything else works):
- An owner session signed in with **only a password** being able to do anything in the admin section.
- The admin section (or the owner account through the normal API) being able to read learner data.
- The owner account ending up with the teacher experience: an offline class database on the device, sync, the bottom bar.
- A delete that happens with one click, or that leaves half an account behind.

## 4. The owner account and two-step sign-in

- **A separate owner account** **(decided)**. An account is either a teacher or the owner, never both. The owner's own test-teacher account is an ordinary teacher account made with the invite link.
- **One-time setup, the last SQL the owner runs** (written into `docs/release.md`):
  1. In the Supabase dashboard (Authentication â†’ Add user) create the user `<username>@login.klasilid.app` with a password, email confirmed. He chooses the username and types the password himself.
  2. Run one SQL line: `insert into profiles (id, role, display_name) values ('<that user's id>', 'owner', '<name>');`
- **Two-step sign-in for the owner only** **(decided)**: password, then a 6-digit code from an authenticator app (Supabase Auth TOTP; free on every plan).
  - First sign-in: after the password, the app shows a QR code to scan with the authenticator app, then asks for the first code to confirm. Until that is done, the admin section shows nothing else.
  - Later sign-ins: after the password, the app asks for the 6-digit code.
  - Lost phone: the owner removes the factor in the Supabase dashboard (Authentication â†’ the user â†’ remove MFA factor) and sets it up again. Written into `docs/release.md`.
- Teachers are not affected: no second step for them.

## 5. How it works

### Server: one Edge Function, `admin`

- All admin actions go through a new Edge Function, `POST /functions/v1/admin`, with JWT verification **on** (the default; unlike `signup`).
- On every request, before anything else, it checks:
  1. the caller's token is valid and at **two-step level** (`aal2` in the token); otherwise 403;
  2. the caller's profile has `role = 'owner'`; otherwise 403.
- After those checks it uses the service-role client, so **no row-level-security policies change** for the owner: through the normal API the owner still reads nothing.
- Same structure as `signup`: a thin `index.ts` and a pure `handler.ts` with injected dependencies, tested in `supabase/tests/`.
- Actions (body `{ action, ... }`):
  - `overview`: schools (with whether a code exists and when it was made), teachers (id, display name, username, school, classes: id, grade, section, subject), readers (id, class, school, last seen, firmware).
  - `addSchool { name }` returns `{ schoolId, code }`.
  - `newSchoolCode { schoolId }` returns `{ code }`.
  - `addReader { classId }` returns `{ id, key, pairingCode }`.
  - `newReaderKey { readerId }` returns `{ key, pairingCode }`.
  - `retireReader { readerId, confirm }`.
  - `deleteTeacher { teacherId, confirm }`.
- Code and key formats stay exactly as the scripts make them: school code `XXXX-XXXX` from the no-0/O/1/I alphabet, stored as sha256 of the 8 characters; reader id `KD-NNNN` (picked so it doesn't collide with an existing one); reader key 32 random bytes base64url; pairing code 8 digits; both stored as sha256. A test keeps the function's formats equal to the scripts'.
- Every admin action that changes something writes one row to `audit_log` (table, row id, action, actor = the owner's id). Secrets never go into the log.

### Retiring a reader, deleting a teacher

The privacy notice promises schools that attendance records are kept for the school year plus one year. So **readers are retired, not deleted, and their taps stay** **(decided)**; deleting a teacher is a full delete meant for **test accounts, or a school's written request after the teacher has exported her data** **(decided)**.

- Both need the owner to **type the reader id** (reader) or **username** (teacher) to confirm; the function checks `confirm` matches. The screen says plainly what happens and that it can't be undone.
- **Retire a reader:** its key and pairing code are replaced with values nobody knows (so the reader stops being accepted at once), and it is marked retired (new column `devices.retired_at`). Its taps stay, so the class's attendance history survives a broken or replaced reader. Retired readers show greyed at the bottom of the Readers list. A retired reader can't be un-retired; add a new one instead.
- **Delete a teacher:** removes the login and everything under it, in one database transaction (if any step fails, nothing changes):
  - their classes, and each class's readers (retired or not), taps, tap windows, seat plans and seats, enrollments and corrections;
  - learners whose every enrollment, past or present, was in those classes, with their cards, login codes and guardian links (parent and student accounts linked only to those learners go too; none exist yet). A learner who was ever enrolled with another teacher is kept; only their links to the deleted classes go. **(builder's call, proposed)**
  - the `audit_log` rows for the deleted rows, so no learner data survives in the change log. The audit triggers are skipped during the delete, and one summary row records it ("teacher <username> deleted by the owner", with counts, no learner data). **(builder's call, proposed)**
  - School years they manage stay (other teachers may share them); their `admin_id` is cleared.
  - Excuse-letter photos (`excuse-letters/<class id>/â€¦` in Storage) are deleted right after the transaction commits. If that fails, the admin section says so and offers a retry; leftover photos are unreachable once the class is gone. **(builder's call, proposed)**
- Taps and corrections are append-only today (the `reject_change` trigger). The delete runs in a database function (`security definer`, callable only by the service role) that turns on a transaction-local switch the trigger respects. Nothing else can turn it on.

### Last seen

- The `tap` and `roster` functions set `devices.last_seen_at = now()` (and `firmware` when the reader reports it) when a reader with a valid key calls them. Today nothing sets it.

### App

- After the password, the app learns the account's role **before touching the device's local data**. An **owner** goes to the admin section; a teacher gets the app as today.
- The owner path never opens, clears or checks the device's offline database, so the owner can sign in on a teacher's laptop or phone (his mother's, say) without touching her data or her waiting changes. Signing out of the owner session returns to the sign-in page; the teacher signs in again as usual. **(builder's call, proposed)**
- The admin section is **online only**: no offline database, no sync, no class. Without internet it shows one message and a retry button.
- One page with three tabs: **Schools Â· Teachers Â· Readers**. Lists with an action button per row; "Add" buttons open the app's existing modal (a bottom sheet on phones).
- **Mockup first** **(decided)**: the admin screens (the three tabs, the "shown once" screen, the type-to-confirm screens, two-step setup and sign-in) are drawn in the existing mockup's style, on laptop and phone, and approved by the owner on 2026-11-19: `docs/mockup/admin/` (copies of the canvas boards Admin, AdminPhone, TwoStep, TwoStepPhone; they use the mockup stylesheet's classes). The build matches them exactly, like the rest of the app.
- Works on laptop and phone widths (the owner wants to use it from anywhere).

## 6. Constraints

- No real learner data in code, tests or screenshots.
- No secrets in the repo; the service-role key lives only in Supabase's function settings.
- `signup` keeps refusing the reserved usernames (`admin`, `owner`, â€¦), so a teacher can't name herself like the owner.
- The scripts `school-code.mjs` and `new-reader.mjs` stay as a fallback.
- Running costs stay at zero (one more Edge Function and Supabase Auth TOTP are within the free plan).

## 7. Left to the builder

- The wording of messages not fixed by the approved mockup (plain, sentence case, like the rest of the app).
- How the app learns the role (reading `profiles.role` after sign-in, or asking the `admin` function).
- How a reader id that collides is retried.
- Tests: handler logic (two-step check, owner check, each action, confirm mismatch), the delete function in SQL (nothing left behind, shared learners kept, one transaction), retiring (reader rejected at once, taps kept), the formats matching the scripts, and app routing (owner goes to admin without touching the local database, teacher doesn't).
