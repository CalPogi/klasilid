# Klasilid Plan 2a: Teacher app core (offline data, sync, setup, Today, Attendance)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A teacher web app she can use offline. It covers the first-time setup wizard, the Today dashboard, the Attendance page and attendance corrections. All of it runs on a local database that syncs with Supabase when there is internet, and in a demo mode when no Supabase project is configured yet.

**Architecture:**
- **App:** a new workspace, `apps/web`, built with Svelte 5, Vite and TypeScript. It uses no router or UI library: a hash router of about 20 lines, plus the mockup's CSS ported as plain CSS.
- **Data flow:** every screen reads and writes only the local Dexie (IndexedDB) database. Writes are also appended to an `outbox` table.
- **Sync:** `sync.ts` pushes the outbox and then pulls from a `Remote`. The real `Remote` is a thin supabase-js adapter; tests use a fake.
- **Attendance status** comes from `@klasilid/core` `computeDay`, the same function the server uses.
- **Server functions:** two new SQL functions (RPCs) cover what row-level security cannot do safely. `setup_class` creates the school, school year and class. `add_learner` adds a learner and their enrollment.

**Tech Stack:** Svelte 5.57, Vite 8, @sveltejs/vite-plugin-svelte 7, Dexie 4.4, @supabase/supabase-js 2.119, Vitest 5 with jsdom 31, @testing-library/svelte 5.4 and fake-indexeddb 6.2. The PGlite database tests from plan 1 carry on unchanged.

**Spec:** `docs/2026-11-15-klasilid-design.md`. Read §3 (goals), §7.1, §7.8, §7.10, §9 and §11. Also read `docs/plans/backlog.md` (the "Plan 2" items) and `docs/plans/2026-11-15-plan-1-foundation.md` for the core and database interfaces.

**UI reference:** `docs/mockup/klasilid-mockup-v37.html`, a clickable mockup. Open it in a browser. The owner iterated heavily on this design, so match it: same tokens, layout, wording, floating sidebar and floating bottom bar. Copy its CSS rules into the components rather than redesigning.

## Global Constraints

- **No real learner data** anywhere in code, fixtures, demo data or tests. Demo names are invented. (spec §11)
- **Offline:** attendance works with no internet. Every screen renders from local data; sync is best-effort. (spec §3, §9)
- **Time:** all "today" and date logic uses Manila time through `manilaDate` / `manilaMinute` from `@klasilid/core`, never the device's local time zone. (spec §4)
- **Corrections:**
  - A reason is required, chosen from: Forgot their card / Card not working / Tapped by a classmate, not in room / Sick (excused) / School activity or errand / Arrived but did not tap / Other. "Other" requires free text.
  - Corrections are never edited; a new one overrides the old one.
  - The newest correction wins by the time it was **created on the device**, not the time it synced. (spec §7.1)
- **Inputs:** every choosable input is a dropdown (`<select>`), never radio buttons or free text, except names and the "Other" reason. All buttons use one button style. (spec §5, owner decision)
- **Layout:**
  - On web, each page fits a 1440×950 laptop screen without page scrolling. Long tables paginate.
  - On phones there's no horizontal scroll at 320 px or wider.
  - Touch targets are at least 44 px; text is at least 12 px. (spec §3, mockup)
- **Theme:** light and dark, using the mockup's tokens. The default is light. (spec §7.10)
- **Dependencies:** none beyond the Tech Stack list. (ponytail: add one only when a few lines can't do the job)

## Review Focus

1. **Offline startup.** The app is opened with no internet. The teacher has signed in before on this device, or the app is in demo mode. Today must still show attendance from local data, and the outbox must keep her corrections. Tested in Task 9.
2. **Sync drops mid-push.** The network fails after some outbox items were sent. Nothing is lost or duplicated, and the next sync sends the remainder exactly once. Tested in Task 3.
3. **Two devices correct offline.** Her laptop and phone each correct the same learner's morning while offline. After both sync, both devices show the correction that was created later. Tested in Task 3.
4. **Device clock in another time zone.** A laptop is set to UTC. At 07:30 Manila (23:30 UTC the day before), "today" must still be the Manila date. Tested in Task 4.
5. **No tap windows yet.** Before setup is finished, or on a date before the first window takes effect, the screens show "Set up tap times" rather than marking everyone absent. Tested in Task 4.

---

## File structure

```
Mommy System/
  package.json                         workspaces += "apps/*"; scripts: dev, test
  vitest.config.ts                     becomes test.projects: [node project (packages, supabase), 'apps/web']
  supabase/migrations/20261115000200_rpc.sql      setup_class, add_learner
  supabase/tests/rpc.test.ts
  apps/web/
    package.json                       @klasilid/web; deps svelte, dexie, @supabase/supabase-js, @klasilid/core
    index.html  vite.config.ts  tsconfig.json  svelte.config.js
    src/main.ts  src/App.svelte
    src/styles/tokens.css  src/styles/base.css        ported from the mockup
    src/lib/router.ts                  hash router
    src/lib/db.ts                      Dexie schema, local types, outbox helpers
    src/lib/demo.ts                    seedDemo() with invented names
    src/lib/sync.ts                    syncOnce(), Remote interface
    src/lib/remote-supabase.ts         Remote over supabase-js (thin, untested like plan 1's index.ts)
    src/lib/attendance.ts              classDay(): per-learner status for a date
    src/lib/session.ts                 demo/online mode, sign-in, cached user for offline open
    src/components/Shell.svelte        floating sidebar (web) + floating bottom bar and Menu dropdown (phone)
    src/components/Modal.svelte
    src/components/CorrectionModal.svelte
    src/components/Pager.svelte        pagination
    src/pages/SignIn.svelte  src/pages/Setup.svelte  src/pages/Today.svelte  src/pages/Attendance.svelte
    test/*.test.ts                     jsdom + fake-indexeddb
```

---

### Task 1: App scaffold, tokens, shell and router

**Files:**
- Create: everything under `apps/web/` except `lib/db.ts` onward; `apps/web/test/router.test.ts`, `apps/web/test/shell.test.ts`
- Modify: `package.json` (workspaces `["packages/*", "apps/*"]`, script `"dev": "npm run dev -w @klasilid/web"`), `vitest.config.ts`, `.claude/launch.json` (create: config `web`, `npm.cmd run dev`, port 5173)

**Interfaces:**
- Produces:
  - `type Route = 'today' | 'attendance' | 'setup' | 'signin'`
  - `route: { subscribe }`, a Svelte readable of `Route`, from `src/lib/router.ts`
  - `go(r: Route): void`, which sets `location.hash = '#/' + r`. An unknown hash maps to `'today'`.
  - `Shell.svelte` props: `{ current: Route; className: string; pendingChanges: number; children }`
- The navigation items and labels follow the mockup. Web sidebar: **Today**, then the **Advisory · Gr. 6 Diamond** group with **Attendance**. Pages from plan 2b appear disabled with "Coming soon" in the `title` attribute: Seat plan, Students, School calendar, Settings. Phone bottom bar: Today, Attendance, Menu. The Menu dropdown opens above the button, the hamburger icon morphs into an X, and there is no arrow.

- [ ] **Step 1: Scaffold.**
  - Create `apps/web` with the files above. `vite.config.ts` uses `svelte()` and has a `test` block: `environment: 'jsdom'`, `include: ['test/**/*.test.ts']`, `setupFiles: ['fake-indexeddb/auto']`, and `resolve.conditions` including `'browser'` for tests.
  - The root `vitest.config.ts` becomes `test.projects`: one inline node project (the plan 1 includes) plus `'apps/web'`.
  - Port the `:root` and `html[data-theme="dark"]` token blocks verbatim from mockup lines 10–23 and the dark block into `tokens.css`. Load the Plus Jakarta Sans font link from the mockup in `index.html`.
- [ ] **Step 2: Write the failing tests.**

```ts
// router.test.ts
it('maps hashes to routes, unknown → today', () => { location.hash = '#/attendance'; expect(get(route)).toBe('attendance'); location.hash = '#/nope'; expect(get(route)).toBe('today'); });
it('go() sets the hash', () => { go('setup'); expect(location.hash).toBe('#/setup'); });
// shell.test.ts
it('shows Today and Attendance as links and marks the current one', ...)    // aria-current="page" on Attendance when current='attendance'
it('shows plan-2b pages as disabled with "Coming soon"', ...)               // Seat plan button disabled
it('phone Menu toggles a dropdown and the icon state', ...)                 // click Menu → menu visible, button aria-expanded="true"
it('shows "N changes waiting to sync" only when pendingChanges > 0', ...)
```

- [ ] **Step 3: Run `npx.cmd vitest run --project web`.** Expected: FAIL, modules missing.
- [ ] **Step 4: Implement** `router.ts` (a readable store that listens to `hashchange`) and `Shell.svelte`, porting the mockup's `.side`/`.fnav` markup and CSS. `App.svelte` renders `Shell` plus the page for the current route, with placeholder pages for now.
- [ ] **Step 5: Run the whole suite with `npx.cmd vitest run`.** Expected: plan 1's 74 tests plus the new ones pass.
- [ ] **Step 6: Visual check.**
  - Start the `web` preview (`.claude/launch.json`).
  - At 1440×950 and 390×844, compare the shell with the mockup's sidebar and bottom bar.
  - Confirm there's no page scroll at 1440×950 and no horizontal scroll at 320 px.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "feat(web): app scaffold, tokens, shell and router"`

---

### Task 2: Local database and demo data

**Files:**
- Create: `apps/web/src/lib/db.ts`, `apps/web/src/lib/demo.ts`, `apps/web/test/db.test.ts`

**Interfaces:**
- Consumes: the `@klasilid/core` types (`TapWindow`, `Tap`, `Correction`, `IsoDate`, `Session`).
- Produces, in `db.ts`. Local rows are camelCase versions of the plan 1 tables; ids are client-generated with `crypto.randomUUID()`.

```ts
export interface LClass { id: string; schoolYearId: string; subject: string; grade: number; section: string; isAdvisory: boolean; ignoreRepeatMinutes: 1|3|5|10 }
export interface LLearner { id: string; lastName: string; firstName: string; middleName?: string; sex: 'M'|'F' }
export interface LEnrollment { id: string; classId: string; learnerId: string; joinedOn: IsoDate; leftOn?: IsoDate }
export interface LCard { uid: string; learnerId: string; active: boolean }
export interface LTapWindow extends TapWindow { id: string; classId: string }
export interface LTap extends Tap { deviceId: string; clockSuspect: boolean }
export interface LCorrection extends Correction { learnerId: string; classId: string; date: IsoDate; createdBy: string }
export interface LCalendarDay { id: string; schoolYearId: string; date: IsoDate; type: 'holiday'|'half'|'suspension'|'event'; name: string }
export interface LSeatPlan { id: string; classId: string; rows: number; cols: number; effectiveFrom: IsoDate }
export type OutboxOp =
  | { kind: 'insert'; table: 'attendance_corrections' | 'tap_windows' | 'seat_plans' | 'calendar_days'; row: Record<string, unknown> }
  | { kind: 'rpc'; fn: 'setup_class' | 'add_learner'; args: Record<string, unknown> };
export interface OutboxItem { seq?: number; op: OutboxOp; createdAt: string }
export class KlasilidDb extends Dexie { classes; learners; enrollments; cards; tapWindows; taps; corrections; calendarDays; seatPlans; outbox; meta }
export function openDb(name?: string): KlasilidDb                       // default 'klasilid'
export async function recordCorrection(db: KlasilidDb, c: Omit<LCorrection, 'id' | 'at'>, now?: Date): Promise<LCorrection>
export async function pendingCount(db: KlasilidDb): Promise<number>
```

  - Dexie stores: `classes: 'id'`, `learners: 'id'`, `enrollments: 'id, classId, learnerId'`, `cards: 'uid, learnerId'`, `tapWindows: 'id, classId'`, `taps: 'id, cardUid, tappedAt'`, `corrections: 'id, learnerId, date'`, `calendarDays: 'id, date'`, `seatPlans: 'id, classId'`, `outbox: '++seq'`, `meta: 'key'`.
  - `recordCorrection` validates the reason rule (`other` needs non-blank `reasonText`; otherwise it throws `'A reason is required'` / `'Describe the reason'`). It writes the correction with `id = randomUUID()` and `at = now.toISOString()`, and appends an outbox `insert` whose `row` is snake_case (`id, learner_id, class_id, date, session, status, reason, reason_text, created_by, created_at`), all in **one Dexie transaction**.
  - In `demo.ts`, `seedDemo(db, now: Date)` writes one advisory class (Gr. 6 Diamond) with 38 invented learners. Each learner gets a card and an enrollment. It also writes the four tap windows from plan 1's fixtures, effective from `'2026-06-01'`, and taps for the last 9 school days plus today up to `now`, with a mix of on time, late, absent and a few after-closing taps. It writes no outbox items.

- [ ] **Step 1: Write the failing tests.**

```ts
it('recordCorrection writes the row and one outbox insert atomically', ...)   // corrections.count 1, outbox[0].op.row.created_at === c.at
it('rejects a missing reason and an empty "other"', ...)                     // rejects 'Describe the reason'; nothing written to either table
it('pendingCount counts outbox items', ...)
it('seedDemo creates 38 learners with cards and no outbox items', ...)
it('demo names are invented (no learner name appears in a denylist built from nothing real)', ...) // assert every name comes from demo.ts's own FIRST/LAST arrays
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement `db.ts` and `demo.ts`.**
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -am "feat(web): local Dexie database, outbox and demo data"` (add the new files first).

---

### Task 3: Sync engine

**Files:**
- Create: `apps/web/src/lib/sync.ts`, `apps/web/src/lib/remote-supabase.ts`, `apps/web/test/sync.test.ts`

**Interfaces:**
- Consumes: `KlasilidDb`, `OutboxItem`, and the local row types from Task 2.
- Produces:

```ts
export interface Snapshot {   // camelCase local rows; full replace for small tables, merge-by-id for taps & corrections
  classes: LClass[]; learners: LLearner[]; enrollments: LEnrollment[]; cards: LCard[]; tapWindows: LTapWindow[];
  calendarDays: LCalendarDay[]; seatPlans: LSeatPlan[]; taps: LTap[]; corrections: LCorrection[];
}
export interface Remote {
  push(op: OutboxOp): Promise<void>;          // must be idempotent: inserts use client ids (upsert ignoreDuplicates), RPCs are idempotent by id
  pull(sinceIso: string | null): Promise<Snapshot>;   // taps/corrections received after sinceIso; small tables in full
}
export interface SyncResult { pushed: number; pulled: boolean; error?: string }
export async function syncOnce(db: KlasilidDb, remote: Remote, now?: Date): Promise<SyncResult>
```

**Rules:**
1. Push outbox items in `seq` order and delete each one only after its `push` resolves.
2. On the first failure, stop, keep the rest, **skip the pull**, and return `error`.
3. Pull happens only when the outbox is empty. Replace the small tables completely. Merge taps and corrections by id. Set `meta.lastPull` to the pull start time.
4. When two corrections exist for the same learner, date and session, both are kept. `computeDay` picks the newest by `at`, which is `created_at`, so sync order doesn't matter.
5. `remote-supabase.ts` implements `Remote` with supabase-js:
   - `insert` → `.upsert(row, { onConflict: 'id', ignoreDuplicates: true })`;
   - `rpc` → `.rpc(fn, args)`;
   - `pull` → select each table through RLS, mapping snake_case to camelCase.
   - It's a thin adapter, tested later against a live project.

- [ ] **Step 1: Write the failing tests.** Use a fake `Remote` backed by in-memory arrays, with `failAfter(n)` to throw on the (n+1)th push.

```ts
it('pushes every outbox item in order, then pulls', ...)
it('network drops mid-push: sent items are removed, the rest stay, no pull', ...)   // Review Focus 2: failAfter(1) with 3 items → remote has 1, outbox has 2; next sync → remote has 3, no duplicates
it('a retried push of an already-received item is not duplicated', ...)           // fake remote ignores duplicate ids like the server
it('pull replaces small tables and merges taps/corrections without dropping local ones', ...)
it('two devices correcting offline converge on the later-created correction', ...) // Review Focus 3: dbA and dbB each recordCorrection (A at 08:00Z, B at 08:05Z) → sync A, sync B, sync A → both dbs computeDay → B's correction wins
it('offline (pull throws) leaves local data untouched and returns error', ...)
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement `sync.ts` and `remote-supabase.ts`.**
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -am "feat(web): outbox sync engine and Supabase remote"` (add the new files first).

---

### Task 4: Attendance for a class day

**Files:**
- Create: `apps/web/src/lib/attendance.ts`, `apps/web/test/attendance.test.ts`

**Interfaces:**
- Consumes: `computeDay`, `windowsForDate`, `manilaDate` and `DayType` from `@klasilid/core`, plus `KlasilidDb`.
- Produces:

```ts
export interface LearnerDay { learner: LLearner; am: HalfDay; pm: HalfDay; review: ReviewItem[] }
export interface ClassDay {
  date: IsoDate; dayType: DayType; needsSetup: boolean;      // true when no in-window is in effect for this date
  rows: LearnerDay[];                                       // enrolled on that date (joinedOn <= date < leftOn), sorted last name, first name
  counts: { in: number; late: number; absent: number; notYet: number; total: number };   // from the AM half: in = on_time + late, notYet = pending
  unknownTaps: LTap[];                                      // taps whose card is not an active card of an enrolled learner
  suspectTaps: LTap[];                                      // clockSuspect taps of enrolled learners (backlog: show them to the teacher)
}
export async function classDay(db: KlasilidDb, classId: string, date: IsoDate, now: Date): Promise<ClassDay>
export function todayManila(now: Date): IsoDate             // manilaDate(now.toISOString())
export function needsAttention(day: ClassDay): LearnerDay[]  // any review item, flag after_closing, or AM status 'absent', in that priority
```

  - `dayType` comes from `calendarDays` for the date. `event` maps to `school`; a missing day is `school`.
  - Weekends are not school days: on a Saturday or Sunday, `dayType` is `'holiday'`. Saturday classes are out of scope.
  - When `needsSetup` is true, every row has status `pending` and nothing is marked absent.
  - `computeDay` gets `ignoreRepeatMinutes` from the class row.
  - **Backlog fix in core:** a learner with no in-tap who taps during an out window currently shows as absent, and the tap is hidden. In `packages/core/src/status.ts`, an out-window tap on a half-day that has no in-tap also goes to `review` (`why: 'outside_window'`).
    - Add test `'an out tap with no in tap goes to review'` to `packages/core/test/status.test.ts`, and watch it fail first.

- [ ] **Step 1: Write the failing tests.** Use `seedDemo` or small hand-built fixtures.

```ts
it('maps taps to learners through active cards and counts the morning', ...)
it('a tap from an unassigned card is listed in unknownTaps, not on anyone', ...)
it('a learner who left before the date is not listed; one who joined after is not listed', ...)
it('todayManila uses Manila, not the device zone', () => { expect(todayManila(new Date('2026-11-12T23:30:00Z'))).toBe('2026-11-13'); });   // Review Focus 4
it('no windows in effect → needsSetup and nobody absent', ...)                  // Review Focus 5
it('a calendar holiday and a Saturday are no_school', ...)
it('needsAttention orders review items, then after-closing, then absences', ...)
it('clock-suspect taps of enrolled learners are listed in suspectTaps', ...)
it('uses the class ignoreRepeatMinutes', ...)                                   // class set to 10 → taps 7 min apart count once
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement `attendance.ts`.** Read the class's taps for the date with Dexie's `tappedAt` index, between the Manila day's start and end in UTC.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -am "feat(web): class day attendance from local data"` (add the new files first).

---

### Task 5: Server functions `setup_class` and `add_learner`

**Files:**
- Create: `supabase/migrations/20261115000200_rpc.sql`, `supabase/tests/rpc.test.ts`

**Interfaces:**
- Consumes: plan 1's tables and the `private.*` helpers.
- Produces two public functions (`security definer`, `set search_path = public, private`), both idempotent by their client-supplied ids:
  - `setup_class(p_school_id uuid, p_school_name text, p_year_id uuid, p_year_label text, p_starts date, p_ends date, p_class_id uuid, p_grade int, p_section text) returns uuid`
    - Requires `private.is_teacher()`, otherwise it raises `'teachers only'`.
    - It inserts the school, the year with `admin_id = auth.uid()`, and the advisory class with `teacher_id = auth.uid()`, `subject = 'Advisory'`, `is_advisory = true`. Each insert uses `on conflict (id) do nothing`.
    - It returns `p_class_id`.
  - `add_learner(p_learner_id uuid, p_class_id uuid, p_last text, p_first text, p_middle text, p_sex text, p_joined date) returns uuid`
    - Requires `private.is_class_teacher(p_class_id)`, otherwise it raises `'not your class'`.
    - It inserts the learner and the enrollment, both `on conflict do nothing`.
    - It raises `'learner belongs to another teacher'` if `private.enrolled_with_other_teacher(p_learner_id)`.
  - Both are granted execute to `authenticated` and revoked from `public` and `anon`.

- [ ] **Step 1: Write the failing tests** with plan 1's `freshDb()` / `as()`.

```ts
it('setup_class creates school, year (admin = caller) and advisory class', ...)
it('setup_class twice with the same ids creates nothing new', ...)
it('setup_class by a parent raises "teachers only"', ...)
it('add_learner adds learner + enrollment visible to the teacher', ...)   // then select from learners as teacher → 1 row
it('add_learner into another teacher\'s class raises "not your class"', ...)
it('add_learner is idempotent', ...)
it('anon cannot call either function', ...)
```

- [ ] **Step 2: Run `npx.cmd vitest run supabase/tests/rpc.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Write the migration.**
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -am "feat(db): setup_class and add_learner server functions"` (add the new files first).

---

### Task 6: First-time setup wizard

**Files:**
- Create: `apps/web/src/pages/Setup.svelte`, `apps/web/src/lib/setup.ts`, `apps/web/test/setup.test.ts`

**Interfaces:**
- Consumes: `validateWindows` and `hm` from core; `KlasilidDb`, `OutboxOp` and `todayManila`.
- Produces:

```ts
export interface SetupInput {
  schoolName: string; yearLabel: string; startsOn: IsoDate; endsOn: IsoDate;
  grade: 4|5|6; section: string; rows: number; cols: number;              // rows/cols 1..10
  windows: { session: Session; kind: TapKind; opens: string; lateAfter: string | null; closes: string }[];  // 'HH:MM'
  learners: { lastName: string; firstName: string; middleName?: string; sex: 'M'|'F' }[];
}
export function validateSetup(s: SetupInput): string[]        // [] = ok; includes validateWindows' messages
export async function applySetup(db: KlasilidDb, s: SetupInput, now: Date): Promise<string>   // returns classId
```

**Wizard and `applySetup` rules:**
- **Steps** (one per screen, as in the mockup's setup wizard modal): School year → Class → Seat layout → Tap times → Learners → Done.
- **Pairing the reader and registering cards** (spec §7.8) need the reader and the Windows/Android app. On the Done screen they appear as two "When your reader arrives" items linking to Settings. They are built in plan 2b and plan 6.
- **Dropdowns:**
  - Grade: 4 / 5 / 6.
  - Section: Diamond, Ruby, Pearl, Sapphire, Emerald, Jade, Opal, Topaz, Amethyst, Garnet.
  - School year: SY 2026–2027.
  - Rows and seats per row: 1–10.
  - Tap times: `<select>` lists in 5-minute steps from 05:00 to 18:00.
- **Learner entry:** the only free-text fields are learner names. They are entered one per row, with a "Paste a list" box that splits "Last, First Middle" lines.
- **`applySetup` writes**, in one transaction:
  - local rows;
  - outbox ops in this order: `rpc setup_class`, `rpc add_learner` for each learner, `insert tap_windows` ×4 effective from `todayManila(now)`, then `insert seat_plans`.
- **Validation:**
  - at least 1 learner;
  - section chosen;
  - `startsOn < endsOn`;
  - windows valid;
  - no duplicate learner (same last, first and middle name).

- [ ] **Step 1: Write the failing tests.**

```ts
it('validateSetup passes a complete input', ...)
it('validateSetup reports overlapping tap times with core\'s message', ...)   // 'Morning out overlaps Morning in'
it('validateSetup rejects no learners and duplicate learners', ...)
it('applySetup writes class, learners, windows, seat plan and the outbox ops in order', ...)  // outbox kinds/fns sequence asserted
it('the wizard\'s Next button is disabled until the step is valid', ...)    // render Setup, Class step, Next disabled until section chosen
it('the wizard uses selects for grade, section, rows, seats and every tap time', ...)  // query by role 'combobox'
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement.** In `App.svelte`, redirect to `#/setup` when the local database has no advisory class and the app isn't in demo mode. Demo mode shows an "Open first-time setup" link instead.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Visual check** at 1440×950 and 390×844 against the mockup's setup wizard.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): first-time setup wizard"` (add the new files first).

---

### Task 7: Correction modal

**Files:**
- Create: `apps/web/src/components/Modal.svelte`, `apps/web/src/components/CorrectionModal.svelte`, `apps/web/test/correction.test.ts`

**Interfaces:**
- Consumes: `recordCorrection` and `LearnerDay`.
- Produces: `CorrectionModal.svelte` props `{ db: KlasilidDb; classId: string; date: IsoDate; day: LearnerDay; session: Session; teacherId: string; onclose: () => void; onsaved: (c: LCorrection) => void }`.
  - It shows the learner's name, the half-day, and the current status with its tap time.
  - A status `<select>`: On time / Late / Absent / Excused.
  - A reason `<select>` with the exact labels from Global Constraints, mapped to the `CorrectionReason` codes.
  - When the reason is Other, a required text box appears.
  - An optional photo input (`accept="image/*"`). The file is kept locally as a Blob in a new `photos` store keyed by correction id; uploading it is plan 2b.
  - Save calls `recordCorrection`.

- [ ] **Step 1: Write the failing tests.**

```ts
it('Save is disabled until a reason is chosen', ...)
it('choosing Other shows a required text box; Save stays disabled while it is blank', ...)
it('saving writes the correction and calls onsaved', ...)                // db.corrections.count() === 1
it('the reason list has exactly the seven labels in order', ...)
it('Escape and the close button call onclose without saving', ...)
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Add the `photos: 'correctionId'` store to `KlasilidDb` as version 2. `Modal.svelte` ports the mockup's modal CSS, traps focus and closes on Escape.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git commit -am "feat(web): attendance correction modal"` (add the new files first).

---

### Task 8: Today and Attendance pages

**Files:**
- Create: `apps/web/src/pages/Today.svelte`, `apps/web/src/pages/Attendance.svelte`, `apps/web/src/components/Pager.svelte`, `apps/web/test/today.test.ts`, `apps/web/test/attendance-page.test.ts`

**Interfaces:**
- Consumes: `classDay`, `needsAttention`, `todayManila`, `CorrectionModal` and `pendingCount`.
- Produces: page components with props `{ db: KlasilidDb; classId: string; teacherId: string; displayName: string; now: () => Date }`. Both re-read every 30 s and after a correction is saved.

**Today**, matching the mockup's Today page:
- **Greeting and heading:** "Good morning/afternoon, Ma'am" (afternoon from 12:00 Manila), then the Manila date and "Gr. 6 Diamond".
- **Four stat cards:**
  - **In class:** "*n* of *total* learners";
  - **Late:** "after *late-after time*";
  - **Absent;**
  - **Not yet:** "no tap so far".
- **"Needs your attention":** the `needsAttention` list. Clicking a name opens the correction modal for the morning, or the afternoon if it is after 12:00 Manila.
- **Unknown card taps:** listed with their times.
- **Wrong reader clock:** when `suspectTaps` isn't empty, a note reads "The reader's clock looked wrong for *n* taps. Check them." and lists the taps.
- **Name in the greeting:** it uses the signed-in teacher's display name, from the `displayName` prop.
- **Offline banner:** shown when `navigator.onLine` is false: "No internet right now. Attendance keeps working … *n* changes sync when the internet is back."
- **Setup prompt:** when `needsSetup`, the cards are replaced by a "Set up tap times" button.

**Attendance:**
- A day `<select>` listing the school days of the current month so far, newest first, labelled "Today · Fri, Nov 13" and "Thu, Nov 12".
- A month `<select>` for history.
- The table shows: Learner, Morning (status and in time), Afternoon (status and in time), and Flags.
- A correction is marked by a small "corrected" tag.
- 12 rows per page with `Pager`. Clicking a status opens the correction modal for that half-day.

- [ ] **Step 1: Write the failing tests.**

```ts
it('Today shows the four counts from classDay', ...)
it('Today lists needs-attention learners and opens the correction modal on click', ...)
it('Today shows "Set up tap times" instead of counts when needsSetup', ...)
it('Today shows the offline banner with the pending count when offline', ...)   // stub navigator.onLine=false; 2 outbox items → "2 changes"
it('Attendance pages 38 learners as 12 per page', ...)
it('Attendance day select lists school days newest first, skipping weekends and holidays', ...)
it('a saved correction updates the row status and shows "corrected"', ...)
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement**, porting the mockup's Today and Attendance markup and CSS.
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Visual check.**
  - In demo mode, at 1440×950: Today and Attendance fit without page scroll.
  - At 390×844 and 320 px: no horizontal scroll, and touch targets are at least 44 px.
  - Dark mode tokens apply.
  - Compare side by side with the mockup.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): Today and Attendance pages"` (add the new files first).

---

### Task 9: Sign-in, demo mode and offline open

**Files:**
- Create: `apps/web/src/lib/session.ts`, `apps/web/src/pages/SignIn.svelte`, `apps/web/test/session.test.ts`
- Modify: `apps/web/src/App.svelte` (gate pages on the session; run `syncOnce` on start, every 60 s while online, and on the `online` event)

**Interfaces:**
- Produces:

```ts
export type Mode = 'demo' | 'online';
export interface Session { mode: Mode; userId: string; displayName: string }
export interface AuthPort { signIn(email: string, password: string): Promise<{ userId: string; displayName: string }>; signOut(): Promise<void> }
export function modeFromEnv(env: { VITE_SUPABASE_URL?: string; VITE_SUPABASE_ANON_KEY?: string }): Mode
export async function startSession(db: KlasilidDb, mode: Mode): Promise<Session | null>   // demo → seeds once and returns the demo teacher; online → cached user from meta, or null
export async function signIn(db: KlasilidDb, auth: AuthPort, email: string, password: string): Promise<Session>  // caches {userId, displayName} in meta.user
export async function signOut(db: KlasilidDb, auth: AuthPort): Promise<void>   // clears meta.user only; local data and outbox stay so nothing unsynced is lost
```

**Rules:**
- **Demo mode** applies when either env var is missing. It shows a slim "Demo · data stays on this device" banner and never syncs.
- **Sign-in:** the teacher signs in with email and password. Parent and student sign-in is plan 4.
- **Offline open:** a cached user opens the app offline. supabase-js refreshes the token when the app is back online.
- **Sign-out with unsynced changes:** signing out while the outbox isn't empty first asks for confirmation: "*n* changes haven't synced yet. They stay on this device and sync next time you sign in."

- [ ] **Step 1: Write the failing tests** with a fake `AuthPort`.

```ts
it('modeFromEnv is demo when either variable is missing', ...)
it('demo startSession seeds once and returns the demo teacher', ...)   // second call does not reseed (learner count stays 38)
it('online startSession returns the cached user with no network', ...) // Review Focus 1: meta.user set, auth never called → session returned; classDay still renders rows
it('signIn caches the user; signOut clears it but keeps outbox items', ...)
it('a wrong password shows "Wrong email or password" and stays on sign-in', ...)
```

- [ ] **Step 2: Run `npx.cmd vitest run --project web`.** Expected: FAIL.
- [ ] **Step 3: Implement.** `SignIn.svelte` ports the mockup's sign-in screen. There's no role picker; the role comes from the account (spec §2).
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Run `npm.cmd run build -w @klasilid/web`.** Expected: the build succeeds with no Svelte warnings about accessibility.
- [ ] **Step 6: Commit.** `git commit -am "feat(web): sign-in, demo mode and offline open"` (add the new files first).

---

## Plan 2b (next): seat plan editor, Students and cards (including bulk card registration from reader taps), School calendar with PH holidays preloaded, Settings (tabs) and Account, uploading correction photos, and the remaining Plan 2 backlog items.
