# Klasilid Plan 2b: Teacher app pages (seat plan, students and cards, calendar, settings, account)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "coming in the next update" pages for the advisory class with working pages: Seat plan (view and editor), Students (list, drawer, add, transfer out, register cards), School calendar (with PH holidays preloaded), Settings and Account. Also upload excuse-letter photos.

**Architecture:**
- **Pattern:** the same one plan 2a set up. Every page reads and writes the local Dexie database, and every write is also queued in the outbox; `syncOnce` pushes, then pulls.
- **Outbox:** gains `upsert`, `update`, `delete` and `upload` operations. The server's row-level security and column grants decide what each is allowed to change.
- **UI fidelity:** pages use the mockup's markup, class names and stylesheet (`apps/web/src/styles/mockup.css`), as in plan 2a's fidelity pass.

**Tech Stack:** unchanged from plan 2a: Svelte 5, Vite 8, Dexie 4, supabase-js 2, Vitest 5, jsdom, fake-indexeddb and PGlite. No new dependencies.

**Spec:** `docs/2026-11-15-klasilid-design.md`, mainly §7.2, §7.3, §7.6, §7.10, §7.1 (excuse photos) and §11. Also read `docs/plans/backlog.md` and plan 2a (`docs/plans/2026-11-15-plan-2a-teacher-app-core.md`) for the existing interfaces.

**UI reference:** `docs/mockup/klasilid-mockup-v37.html`. Copy, don't restyle (owner rule).

| Page | Mockup lines |
|---|---|
| Seat plan view and editor | 2078–2122; scripts `renderSeats` 2499, `startEdit`/`renderEd` 2800–2900 |
| Students | 2134–2140; drawer 2375–2396; modals `addStuModal` 2397, `regModal` 2413, `bulkModal` 2450, `xferModal` 2456; script `renderStudents` 2752 |
| School calendar | 2221–2237; script `renderCal` 2996; day menu 2466 |
| Account | 2237–2257 |
| Settings | 2257 onward |

Serve the mockup with the `klasilid-mockup` launch config on port 5174 and compare every page side by side at 1440×950 and 390×844.

## Global Constraints

- **Copy the mockup.** Same markup, class names, wording and icons (`<Icon name>` uses the mockup's sprite). Override layout only in `app.css`. (owner rule)
- **Offline first.** Every action works offline: write locally, queue in the outbox, sync later. (spec §9)
- **Manila time** via `@klasilid/core` helpers. Never use the device's local time zone. (spec §4)
- **No real learner data** in code, demo data or tests. (spec §11)
- **Seat plan:** rows × seats per row, each 1–10, set by the teacher. Placement is by tap-then-tap or drag; "Fill A–Z" places alphabetically. Status colors: on time = ink, late = orange, absent = red. (spec §7.2)
- **Cards:** a card is identified by its UID and is never reassigned or deleted. Replacing a card deactivates the old one, which stops working at once. (spec §7.3, plan 1 RLS)
- **Tap windows:** changes apply from today forward, and past days keep their windows. (spec §7.1)
- **Calendar:** only the school year's admin edits it. Holidays and suspensions mean nobody is marked absent. (spec §7.6, plan 1 RLS)
- **Excuse photos** are stored privately: only the class's teacher can read them. (spec §7.1, §11)
- **Inputs:** every choosable input is a dropdown or the mockup's segmented control. Free text only for names, LRN, school and phone. Touch targets at least 44 px. (spec, mockup)

## Review Focus

1. **Registering a card that already belongs to another learner** (a classmate's card tapped by mistake). Refuse with "This card belongs to <name>", create no duplicate, and keep waiting for the next tap. Tested in Task 4.
2. **Saving a seat plan with fewer seats than learners, or shrinking rows or seats.** Learners in removed seats go back to "Not seated", and nobody disappears. Tested in Task 2.
3. **Changing tap times during the school day.** Today recalculates with the new times, yesterday is unchanged, and saving twice today replaces today's times instead of adding a second set. Tested in Task 6.
4. **A learner transferred out with a last day in the past.** They are absent from attendance, seat plan and counts after that day, and their history before it is kept. Tested in Task 3.
5. **Marking a day as a holiday after taps exist.** Nobody is absent that day and the taps are kept. Changing it back to a school day restores the statuses. Tested in Task 5.

---

## File structure

```
supabase/migrations/20261116000000_plan2b.sql   seat_plans.created_at; learners.guardian_name/guardian_phone; classes.review_outside;
                                                 add_learner v2 (guardian fields); storage bucket + policies for excuse letters
supabase/tests/shim.sql                          + minimal storage schema stand-in (test only)
supabase/tests/plan2b.test.ts
packages/core/src/status.ts                      DayInput.reviewOutside (default true)
apps/web/src/lib/db.ts                           OutboxOp += upsert/update/delete/upload; LSeat; Dexie v4 (seats, prefs)
apps/web/src/lib/sync.ts, remote-supabase.ts     new ops; pull seats; upload photos
apps/web/src/lib/seats.ts                        seatPlanFor(), fillAZ(), resize(), saveSeatPlan()
apps/web/src/lib/students.ts                     studentRows(), addStudent(), transferOut(), assignCard(), replaceCard()
apps/web/src/lib/calendar.ts                     PH_HOLIDAYS, setDayType(), monthCells()
apps/web/src/lib/settings.ts                     saveTapWindows(), setIgnoreRepeat(), setReviewOutside(), theme
apps/web/src/lib/export.ts                       attendanceCsv()
apps/web/src/pages/SeatPlan.svelte  Students.svelte  Calendar.svelte  Settings.svelte  Account.svelte
apps/web/src/components/StudentDrawer.svelte  AddStudentModal.svelte  RegisterCardModal.svelte  TransferModal.svelte  DayMenu.svelte
apps/web/test/*.test.ts                          one test file per lib module and per page
```

---

### Task 1: Data plumbing: new outbox operations, seats, server changes

**Files:**
- Create: `supabase/migrations/20261116000000_plan2b.sql`, `supabase/tests/plan2b.test.ts`
- Modify: `supabase/tests/shim.sql`, `packages/core/src/status.ts` (+ test), `apps/web/src/lib/db.ts`, `sync.ts`, `remote-supabase.ts` (+ `apps/web/test/sync.test.ts`, `remote.test.ts`)

**Interfaces:**
- Produces, in `db.ts`:

```ts
export interface LSeatPlan { id: string; classId: string; rows: number; cols: number; effectiveFrom: IsoDate; createdAt: string }  // createdAt added
export interface LSeat { id: string; planId: string; row: number; col: number; learnerId: string }
export interface LLearner { /* + */ lrn?: string; guardianName?: string; guardianPhone?: string }
export interface LClass { /* + */ reviewOutside: boolean }
export type OutboxOp =
  | { kind: 'insert'; table: Table; row: Row }                        // existing; Table widened below
  | { kind: 'upsert'; table: Table; row: Row; onConflict: string }    // e.g. calendar_days 'school_year_id,date'
  | { kind: 'update'; table: Table; match: Row; values: Row }         // column grants on the server limit `values`
  | { kind: 'delete'; table: Table; match: Row }
  | { kind: 'upload'; bucket: 'excuse-letters'; path: string; correctionId: string }   // blob read from db.photos at push time
  | { kind: 'rpc'; fn: 'setup_class' | 'add_learner'; args: Row };
type Table = 'attendance_corrections' | 'tap_windows' | 'seat_plans' | 'seats' | 'calendar_days' | 'cards' | 'enrollments' | 'learners' | 'classes' | 'profiles';
```

  - Dexie version 4 adds `seats: 'id, planId'` and `prefs: 'key'` (device-only preferences such as alerts and theme).
- In `sync.ts`, `Snapshot` gains `seats: LSeat[]` (a small table, fully replaced). `remote-supabase.ts` maps each new op to supabase-js:
  - `upsert(row, { onConflict })`;
  - `update(values).match(match)`;
  - `delete().match(match)`;
  - `storage.from(bucket).upload(path, blob, { upsert: true })`.
  - A missing local blob for an `upload` is a `RejectedError('photo missing on this device')`.
  - `update` and `delete` that match zero rows are not errors; RLS filters silently.
- In core, `DayInput.reviewOutside?: boolean` defaults to true. When false, `computeDay` returns `review: []`. Taps outside windows are then ignored, but after-closing late arrivals still count.
- The migration adds:
  - `seat_plans.created_at timestamptz not null default now()`.
  - `learners.guardian_name text`, `learners.guardian_phone text`. Grant update on both to `authenticated`; the policy is unchanged (teachers of the learner).
  - `classes.review_outside boolean not null default true`.
  - `add_learner` replaced by a version with three extra trailing parameters `p_lrn text default null, p_guardian_name text default null, p_guardian_phone text default null`. It stays idempotent; drop the old signature.
  - The storage bucket `excuse-letters`, private. Object policies:
    - insert and select only when the first path segment is a class the user teaches (`private.is_class_teacher((storage.foldername(name))[1]::uuid)`);
    - no update or delete.
- `shim.sql` gains test-only stand-ins: `storage.buckets(id text primary key, public boolean)`, `storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid)` with RLS enabled, and `storage.foldername(name text) returns text[]` (split on `/`, without the last element).

- [ ] **Step 1: Write the failing tests.**

```ts
// core status.test.ts
it('reviewOutside false drops stray taps but still counts after-closing arrivals', ...)
// supabase/tests/plan2b.test.ts
it('a teacher can save guardian name and phone on her learner; a parent cannot', ...)
it('add_learner v2 stores LRN and guardian fields and is still idempotent', ...)
it('seat_plans get created_at by default', ...)
it("the teacher can upload and read excuse letters under her class folder; another teacher can't read them; parents can't", ...)
it('nobody can update or delete an excuse letter object', ...)
// apps/web sync.test.ts
it('upsert, update, delete and upload ops are pushed in order and removed from the outbox', ...)   // FakeRemote records ops
it('pull fully replaces seats', ...)
// apps/web remote.test.ts
it('an upload with no local photo is a RejectedError', ...)
it('update and delete use match filters', ...)                        // fake client records .match({...})
```

- [ ] **Step 2: Run `npx.cmd vitest run`.** Expected: the new tests FAIL.
- [ ] **Step 3: Implement.** Write the migration, widen the shim, change core, widen the Dexie schema (version 4), and map the new ops in sync and the remote.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: everything passes, including plan 1 and 2a tests.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: outbox upsert/update/delete/upload, seats, plan 2b schema"`

---

### Task 2: Seat plan view and editor

**Files:**
- Create: `apps/web/src/lib/seats.ts`, `apps/web/src/pages/SeatPlan.svelte`, `apps/web/test/seats.test.ts`, `apps/web/test/seatplan-page.test.ts`
- Modify: `apps/web/src/App.svelte` (route `seat` → SeatPlan), `apps/web/src/lib/router.ts` (remove `seat` from `SOON`), `apps/web/src/lib/demo.ts` (seed an 8×5 plan, alphabetical)

**Interfaces:**
- Consumes: `LSeatPlan`, `LSeat`, `classDay`, `CorrectionModal`.
- Produces:

```ts
export interface Layout { rows: number; cols: number; seats: (string | null)[] }   // row-major, length rows*cols, learnerId or null
export async function seatPlanFor(db: KlasilidDb, classId: string, date: IsoDate): Promise<{ plan: LSeatPlan | null; layout: Layout }>
  // latest effectiveFrom <= date, ties broken by latest createdAt; no plan → 8×5 empty
export function fillAZ(layout: Layout, learners: LLearner[]): Layout        // by last name, first name; extra learners stay unseated
export function resize(layout: Layout, rows: number, cols: number): Layout  // clamps 1..10; keeps each learner's (row, col) when it still exists; others become unseated
export function unseated(layout: Layout, learners: LLearner[]): LLearner[]
export async function saveSeatPlan(db: KlasilidDb, classId: string, layout: Layout, now: Date): Promise<LSeatPlan>
  // new plan effective today (Manila) with createdAt = now; seats for non-null cells; one transaction; outbox: insert seat_plans, then insert seats (one op per seat)
```

**Page behaviour, copying the mockup:**
- **Header:** `cls-head` with "Seat plan", the day and session (Today · Morning).
- **Controls:**
  - Morning/Afternoon session tabs (`sess-tabs`), defaulting to Afternoon from 12:00 Manila;
  - a Day dropdown listing this month's school days;
  - an "Edit seat plan" button.
- **View panel:**
  - "Front of the room";
  - desks (`.desks` / `.desk` with the mockup's `desk()` markup: initials, name, time or status, icon);
  - filters All / Late / Absent / Not yet with counts (`.fbtn`), which dim the other desks;
  - the legend;
  - the afternoon note (`.pm-note`) using the real afternoon window times;
  - the layout note "8 rows · 5 seats · 38 seated · N without a seat".
- **Clicking a desk** opens `CorrectionModal` for that learner and session.
- **Editor panel (`#wEd`):**
  - steppers for Rows and Seats per row (1–10), and the seat total;
  - the "Fill A–Z" and "Clear seats" buttons;
  - seats (`.eseats` / `.eseat`);
  - the "Not seated" aside with chips (`.uchips` / `.uchip`);
  - placement by tap-then-tap (click a chip or seat to select it, then a seat) or HTML5 drag-and-drop;
  - "Remove from seat" (shown only when a seated learner is selected), Cancel, and "Save seat plan".

- [ ] **Step 1: Write the failing tests.**

```ts
// seats.test.ts
it('fillAZ seats learners alphabetically row by row and leaves extras unseated', ...)
it('resize to fewer rows sends learners in removed seats back to unseated, others keep their seat', ...)   // Review Focus 2
it('resize clamps to 1..10', ...)
it('seatPlanFor picks the latest plan by effectiveFrom then createdAt; past days keep the old plan', ...)
it('saveSeatPlan writes plan + seats and queues seat_plans then seats', ...)
// seatplan-page.test.ts
it('shows a desk per seat with each learner status for the chosen session', ...)
it('the Late filter dims everyone who is not late', ...)
it('clicking a desk opens the correction modal for that learner', ...)
it('editor: click a chip then an empty seat places the learner; Save writes a new plan', ...)
it('editor: rows and seats steppers stop at 1 and 10', ...)
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement** `seats.ts` and `SeatPlan.svelte`, porting the mockup's `desk()`, `renderEd` markup and its editor CSS classes. Seed the demo plan.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: PASS.
- [ ] **Step 5: Visual check** against the mockup's seat plan and editor at 1440×950 and 390×844.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): seat plan view and editor"` (add the new files first).

---

### Task 3: Students page, student drawer, add student, transfer out

**Files:**
- Create: `apps/web/src/lib/students.ts`, `apps/web/src/pages/Students.svelte`, `apps/web/src/components/StudentDrawer.svelte`, `AddStudentModal.svelte`, `TransferModal.svelte`, `apps/web/test/students.test.ts`, `apps/web/test/students-page.test.ts`
- Modify: `App.svelte`, `router.ts` (`students` live)

**Interfaces:**
- Produces:

```ts
export type StudentFilter = 'all' | 'nocard' | 'replaced' | 'noparent' | 'left';
export interface StudentRow {
  learner: LLearner; enrollment: LEnrollment;
  status: 'enrolled' | 'joined' | 'left';         // joined = joinedOn within the last 30 days
  card: { state: 'none' | 'registered' | 'replaced'; uid?: string };
  parent: 'none';                                 // parent accounts arrive in plan 4
  presentPct: number | null;                      // this month: P+L days ÷ counted days, H = ½
}
export async function studentRows(db: KlasilidDb, classId: string, today: IsoDate, filter: StudentFilter, query: string): Promise<StudentRow[]>
export async function addStudent(db: KlasilidDb, classId: string, s: { fullName: string; lrn?: string; sex: 'M'|'F'; joinedOn: IsoDate;
  from?: string; guardianName?: string; guardianPhone?: string }, now: Date): Promise<LLearner>
  // fullName "Last, First M.I." parsed with setup.ts parseLearnerList rules; LRN must be 12 digits or empty → errors 'Enter the full name as Last name, First name', 'LRN has 12 digits'
  // queues rpc add_learner (v2 args); local learner + enrollment written in one transaction
export async function transferOut(db: KlasilidDb, enrollmentId: string, lastDay: IsoDate, newSchool: string): Promise<void>
  // local enrollment.leftOn = day after lastDay; queues update enrollments {left_on, leave_reason: 'Transferred to <school>'}
```

**Page:**
- **Header:** `cls-head` "Students", "Gr. 6 Diamond · N learners". Controls: the School year dropdown, "Register cards" (opens the bulk modal from Task 4), and "Add student".
- **Tools:** search, plus the Show dropdown: All learners / No card / Card replaced / No parent account / Transferred out.
- **Table `.tbl`, paginated 12 per page:**
  - Learner;
  - Status tag: Enrolled / Joined <date> / Transferred out;
  - RFID card tag: Registered / No card / Replaced <date>;
  - Parent account tag: "Not set up" until plan 4;
  - Attendance %;
  - an Open button.
- **Drawer (`.drawer`):**
  - **Today:** status, with a Correct button that opens `CorrectionModal`.
  - **Card and accounts:** "Registered · ends in 4F21" with Replace, or "No card" with Register. Parent account shows "Not set up yet" with a disabled "Login slip" button titled "Comes with parent accounts".
  - **Enrollment:** "Enrolled since <date>" with "Transferred out", or "Left <date> · <reason>".
  - **Grades this term:** "Comes with class records".
  - **History:** this school year's present %.
- **Add student modal:** the mockup's fields. "Add and register card" saves, then opens the register-card modal for the new learner.
- **Transfer modal:** Last day (dropdown of this month's school days up to today) and New school.

- [ ] **Step 1: Write the failing tests.**

```ts
// students.test.ts
it('studentRows filters by no card, replaced card and transferred out, and searches by name', ...)
it('presentPct counts half days as half', ...)
it('addStudent validates the name format and a 12-digit LRN, then queues add_learner with guardian fields', ...)
it('transferOut sets leftOn to the day after the last day and queues the enrollment update', ...)
it('a transferred-out learner is not in classDay after the last day but stays in history before it', ...)   // Review Focus 4
// students-page.test.ts
it('lists learners with status, card and attendance columns, 12 per page', ...)
it('the drawer opens from a row and its Correct button opens the correction modal', ...)
it('Add student → Add and register card opens the register modal for the new learner', ...)
it('Transferred out moves the learner to the Transferred out filter', ...)
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement**, porting the mockup's `renderStudents` row markup, drawer, `addStuModal` and `xferModal`.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: PASS.
- [ ] **Step 5: Visual check** against the mockup.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): students page, drawer, add and transfer"` (add the new files first).

---

### Task 4: Registering and replacing cards

**Files:**
- Create: `apps/web/src/components/RegisterCardModal.svelte`, `apps/web/test/cards.test.ts`
- Modify: `apps/web/src/lib/students.ts`, `Students.svelte`, `StudentDrawer.svelte`, `Today.svelte` (the "Register cards for N learners" to-do opens the bulk modal)

**Interfaces:**
- Produces:

```ts
export type AssignResult = { ok: true } | { ok: false; reason: 'taken'; ownerName: string };
export async function assignCard(db: KlasilidDb, learnerId: string, uid: string, now: Date): Promise<AssignResult>
  // uid uppercase; if an active OR inactive card row with that uid exists → { ok:false, 'taken', owner } (cards are never reassigned);
  // else insert local card + queue insert cards {uid, learner_id, active:true, issued_at}
export async function replaceCard(db: KlasilidDb, learnerId: string, now: Date): Promise<void>
  // deactivate the learner's active card(s): local active=false + queue update cards {active:false, replaced_at} match {uid}
export async function waitForNewCard(db: KlasilidDb, since: Date, signal: AbortSignal, poll: () => Promise<void>): Promise<string>
  // resolves with the uid of the first tap after `since` whose card is unknown; calls poll() every 3 s (App passes syncOnce) — taps reach the browser through the server
```

**Modals, copying the mockup:**
- **Register card (`regModal`):**
  - the `tapwait` ring;
  - "Tap a blank card on the door reader" / "The reader beeps when it reads the card. Waiting…";
  - success shows the ring as `.ok` with "Card registered", and closes after 1.2 s;
  - a taken card shows "This card belongs to <name>. Tap a blank card." and keeps waiting.
- **Register cards in a row (`bulkModal`):** the list in name order of learners without a card, with the current learner highlighted. Each new card is assigned to the current learner and moves to the next. "Skip for now" moves on without assigning.
- **Demo mode:** both modals show the mockup's "Simulate tap" button, which feeds a fresh random UID. In online mode the button isn't shown.

- [ ] **Step 1: Write the failing tests.**

```ts
it('assignCard registers an unknown card to the learner and queues the insert', ...)
it('a card that belongs to another learner is refused with their name and nothing is written', ...)   // Review Focus 1
it('an old deactivated card cannot be given to someone else either', ...)
it('replaceCard deactivates the old card so its taps no longer count for the learner', ...)
it('waitForNewCard resolves with the first unknown tap after the modal opened, ignoring known cards and older taps', ...)
it('bulk registration walks learners without a card in order and skip moves on', ...)
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Use an `AbortController` to stop polling when the modal closes.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(web): register and replace cards"` (add the new files first).

---

### Task 5: School calendar with PH holidays

**Files:**
- Create: `apps/web/src/lib/calendar.ts`, `apps/web/src/pages/Calendar.svelte`, `apps/web/src/components/DayMenu.svelte`, `apps/web/test/calendar.test.ts`, `apps/web/test/calendar-page.test.ts`
- Modify: `apps/web/src/lib/setup.ts` (`applySetup` queues the preloaded holidays), `demo.ts` (seed them), `App.svelte`, `router.ts`

**Interfaces:**
- Produces:

```ts
export const PH_HOLIDAYS: { date: IsoDate; name: string }[]
  // SY 2026–2027. Copy the mockup's CALD entries of type 'hol' (Aug–Dec 2026: Ninoy Aquino Day, National Heroes Day, All Souls' Day,
  // Bonifacio Day, Immaculate Conception, Christmas break days, Rizal Day) and add 2027: Jan 1 New Year's Day, Mar 25 Maundy Thursday,
  // Mar 26 Good Friday, Apr 9 Araw ng Kagitingan. Weekends excluded.
export type DayKind = 'school' | 'half' | 'suspension' | 'holiday';
export async function setDayType(db: KlasilidDb, schoolYearId: string, date: IsoDate, kind: DayKind, name?: string): Promise<void>
  // 'school' → delete local row + queue delete calendar_days {school_year_id, date}; else upsert local + queue upsert (onConflict 'school_year_id,date')
export interface DayCell { date: IsoDate; weekend: boolean; kind: DayKind | null; name?: string; pct?: number; isToday: boolean; past: boolean }
export async function monthCells(db: KlasilidDb, classId: string, month: string, today: IsoDate, now: Date): Promise<DayCell[]>   // one cell per date of the month, in order; the page pads the first week so it starts on Monday; pct from classDay for past school days
```

**Page, copying the mockup v37 calendar:**
- **Header:** `cls-head` "School calendar" / "Days that count for attendance and SF2. Click a day to change it.", with month navigation and Today.
- **Grid:** `.cgrid` day cards using the mockup's `renderCal` card markup:
  - past days show the attendance % bar;
  - today shows the "Today · N in" badge;
  - special days show their icon (star = holiday, half = half day, cloud = suspension) and name;
  - weekend columns are narrower.
- **Day menu (`.daymenu`):** clicking a weekday opens School day / Half day / Class suspension / Holiday.
- **Side panel:** `cstats` counts (school days, half days, suspensions, holidays this month) and "Special days", with back-to-back days grouped (the mockup's calgroup logic).
- **Who can edit:** only the year's admin. Locally, the class's teacher is treated as admin. If the server refuses, the outbox moves the change to rejected (plan 2a) and Today shows it.

- [ ] **Step 1: Write the failing tests.**

```ts
it('PH_HOLIDAYS has no weekend dates and includes Bonifacio Day 2026-11-30', ...)
it('setDayType holiday then school upserts then deletes, both queued', ...)
it('marking a day with taps as a holiday makes nobody absent and keeps the taps; back to school restores', ...)   // Review Focus 5
it('monthCells starts on Monday and gives past school days an attendance %', ...)
it('the page groups Dec 21–23 Christmas break into one Special days row', ...)
it('clicking a day opens the day menu and choosing Half day updates the card', ...)
it('applySetup queues the preloaded holidays for the new school year', ...)
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement**, porting the mockup's calendar markup and the v37 day-card CSS.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: PASS.
- [ ] **Step 5: Visual check** against the mockup's calendar.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): school calendar with PH holidays"` (add the new files first).

---

### Task 6: Settings

**Files:**
- Create: `apps/web/src/lib/settings.ts`, `apps/web/src/lib/export.ts`, `apps/web/src/pages/Settings.svelte`, `apps/web/test/settings.test.ts`, `apps/web/test/settings-page.test.ts`
- Modify: `App.svelte` (apply the saved theme at start), `router.ts`, `apps/web/src/lib/attendance.ts` (pass `reviewOutside` to `computeDay`)

**Interfaces:**
- Produces:

```ts
export async function saveTapWindows(db: KlasilidDb, classId: string, windows: SetupWindow[], now: Date): Promise<string[]>
  // validateWindows first → returns errors without writing; else rows effective today: same (class, session, kind, today) is replaced (local put by
  // deterministic id `${classId}-${session}-${kind}-${today}`; queue upsert tap_windows onConflict 'class_id,session,kind,effective_from')
export async function setIgnoreRepeat(db: KlasilidDb, classId: string, minutes: 1|3|5|10): Promise<void>   // local + queue update classes
export async function setReviewOutside(db: KlasilidDb, classId: string, review: boolean): Promise<void>
export type Theme = 'light' | 'dark' | 'auto';
export function applyTheme(t: Theme): void          // the mockup's setTheme: data-theme from matchMedia for 'auto'; saved in localStorage 'kTheme'
export function attendanceCsv(days: ClassDay[]): string   // header: Learner,<each date>,Absent,Late; cells use dayLetter; RFC 4180 quoting
```

**Page, copying the mockup:**
- **Header:** `pg-head` "Settings" / "Rules, the door reader, and accounts". The tabs are those shown in the mockup's Settings screen: Tap times / Reader and accounts / Alerts / Display and data.
- **Tap times tab:**
  - the `winset` table with 12-hour dropdowns and its error line;
  - "Taps outside these times": Ask me to review / Ignore (`segset`);
  - "Ignore repeat taps within" with 1, 3, 5 or 10 minutes;
  - a note: "Changes apply from today. Past days keep their times."
- **Reader and accounts tab:**
  - Door reader status: "No reader paired yet". The pairing button is disabled, titled "Pair the reader with the Windows or Android app".
  - "Register cards": Start, which opens the bulk modal.
  - Parent accounts: "Login slips come with parent accounts", disabled.
  - Student accounts: Manage, which goes to Students.
- **Alerts tab:** the mockup's toggles, saved in `db.prefs` on this device only, with a line saying alerts go live with the parent app. Text messages (SMS): "Later".
- **Display and data tab:**
  - Appearance: Light / Dark / Match device, using `applyTheme`.
  - Language: English / Filipino, saved to `profiles.language` through an update op.
  - Your data: "Download attendance (CSV)" for a chosen month, using `attendanceCsv`, downloaded with a Blob and `<a download>`.
- **"Run first-time setup":** shown disabled, titled "Your class is already set up".

- [ ] **Step 1: Write the failing tests.**

```ts
it('saveTapWindows rejects overlapping times with core messages and writes nothing', ...)
it('saving twice today replaces today’s windows; yesterday still uses the old ones', ...)   // Review Focus 3
it('changing tap times during the day recalculates today', ...)                          // Review Focus 3
it('setIgnoreRepeat and setReviewOutside update the class and queue updates; classDay honours them', ...)
it('attendanceCsv quotes names with commas and uses grid letters', ...)
it('applyTheme auto follows the device; the choice survives a reload', ...)
it('the Tap times tab shows 10 time dropdowns and saving shows "Saved. Applies from today."', ...)
it('the Display tab switches the theme', ...)
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: PASS.
- [ ] **Step 5: Visual check** against the mockup's Settings screen.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): settings"` (add the new files first).

---

### Task 7: Account page

**Files:**
- Create: `apps/web/src/pages/Account.svelte`, `apps/web/test/account.test.ts`
- Modify: `apps/web/src/lib/session.ts` (`AuthPort` gains `changePassword(current, next)` and `setEmail(email)`), `App.svelte`, `router.ts`

**Interfaces:**
- Produces:
  - `AuthPort.changePassword(current: string, next: string): Promise<void>` re-signs in with `current` first. It throws `'Current password is wrong'`, `'At least 8 characters'`, or `"Can't change the password offline"`.
  - `AuthPort.setEmail(email: string): Promise<void>` uses supabase `auth.updateUser({ email })`.
  - `saveDisplayName(db, userId, name)` updates `meta.user`, queues an update to `profiles` `{ display_name }`, and the sidebar refreshes.

**Page, copying the mockup:**
- Profile panel: avatar, name, "Teacher · <school>", Display name, Username (read-only, from the sign-in), "Email for password resets", and Save.
- Password panel: Current password, New password ("At least 8 characters."), and Change password.
- In demo mode, both panels are disabled with the note "Accounts work once Klasilid is online."

- [ ] **Step 1: Write the failing tests.**

```ts
it('saving the display name updates the sidebar name and queues a profiles update', ...)
it('change password checks the current password and the 8-character minimum', ...)
it('offline password change shows "Can\'t change the password offline"', ...)
it('demo mode disables both panels with the note', ...)
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(web): account page"` (add the new files first).

---

### Task 8: Excuse-letter photo upload

**Files:**
- Modify: `apps/web/src/components/CorrectionModal.svelte`, `apps/web/src/lib/db.ts` (`recordCorrection` takes an optional `photo`), `apps/web/test/correction.test.ts`, `apps/web/test/sync.test.ts`

**Interfaces:**
- `recordCorrection(db, c, now, photo?: Blob)`, when a photo is given:
  - sets the correction's `photo_path = '<classId>/<correctionId>.jpg'` in the queued insert row, because corrections are append-only and can't be updated later;
  - stores the blob in `db.photos`;
  - queues `{ kind: 'upload', bucket: 'excuse-letters', path, correctionId }` right after the insert, all in one transaction.
- After a successful upload, the local blob is kept, so it can be shown offline.
- The correction modal shows a thumbnail of the chosen photo.
- In the drawer's Today row, a corrected half-day with a photo shows a "Letter" link that opens the local blob. If there's no local copy, it opens a signed URL from the server.

- [ ] **Step 1: Write the failing tests.**

```ts
it('a correction with a photo queues the insert (with photo_path) then the upload, in one transaction', ...)
it('the upload op reads the blob from db.photos at push time', ...)
it('the modal shows a thumbnail after choosing a photo', ...)
```

- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(web): upload excuse-letter photos"`

---

## Left for later plans

- Reader pairing and local Wi-Fi reading (plans 5–6).
- Parent and student accounts, login slips and consent (plan 4).
- SF2 (plan 3).
- Grades (plan 7).
- The phone-app screens (with the mobile app).
- Deploying to Supabase. This needs the owner's Supabase account; ask before the pilot.

Still in `docs/plans/backlog.md`:
- the five small review items from plan 2a;
- removing a tap window from a date forward;
- whether a transferred-out learner's family keeps access. The spec keeps history, so no change is planned unless the owner says otherwise.
