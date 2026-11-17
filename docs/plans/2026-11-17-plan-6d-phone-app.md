# Klasilid Plan 6d: Phone app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On phones (the Android app and any phone browser), Klasilid shows the mockup's teacher phone app, with a bottom bar, phone screens and bottom sheets, instead of the laptop layout squeezed to phone width.

**Architecture:**
- **Width switch:** a `phone` store (`lib/layout.ts`) makes `App.svelte` render `PhoneApp` instead of `Shell` and the laptop pages.
- **Phone screens:** each phone screen is its own component under `src/pages/phone/`. It ports the mockup's phone markup and uses the mockup's phone CSS, which is already in `styles/mockup.css` under `.phone`, inside a full-screen `.phone.app-phone` frame.
- **Shared logic:** phone and laptop call the same `lib/` functions. Logic a phone screen needs that today lives inside a laptop page is moved to `lib/` first, with no behaviour change.
- **Sheets:** `Modal.svelte` becomes the mockup's bottom sheet on phones. So every existing pop-up (correction, add student, transfer, register card) becomes a phone sheet without a second copy, and Android's back closes it.

**Tech Stack:** Svelte 5, TypeScript, Vite, Dexie, Vitest + @testing-library/svelte (jsdom), Tauri 2 (unchanged).

**Spec:** `docs/2026-11-17-phone-app-design.md` (approved 2026-11-17).
- The visual sources are the mockup's teacher phone (`docs/mockup/klasilid-mockup-v37.html`, `#tp`) and the canvas boards "Phone app: screens the mockup didn't have" (https://claude.ai/artifact/LQUuLx898BG7FU4tqW7bvq).
- The orange dashed outlines on those boards are review markers only; don't build them.
- To see a mockup screen's runtime markup (lists built by its script), use `node ~/tools/shots/dump-mockup.mjs <mockup.html> "<selector>" <n>`.
- To screenshot it, use `node ~/tools/shots/shoot-mockup-phone.mjs <mockup.html> <outdir> home seat dAtt mStudents stu`.

## Global Constraints

- **Match the mockup exactly:** port each phone screen's markup and class names from the mockup. Use `styles/mockup.css` as it is. No new colours, type or spacing. New CSS goes only in `styles/phone.css`, for the full-screen frame, safe areas and sheet layout.
- **Phone layout query:** `(max-width: 760px), (max-height: 500px)`.
- **Names on phone screens:** first name and last initial, e.g. "Ana G." (`shortName`).
- **Bottom bar:** Home · Advisory · Classes · Reports · Menu. Classes, Reports and Advisory's Report card tab show "Coming in the next update".
- **Menu:** Profile, Settings, School calendar, Help and feedback, Sign out.
- **Touch targets:** 44 px minimum.
- **Safe areas:** `viewport-fit=cover`. The header is padded by `env(safe-area-inset-top)`. The bottom bar and the edit-seats bar are padded by `env(safe-area-inset-bottom)`.
- **No real information:** sample names and the section "Sampaguita" in tests and screenshots. No real place names in placeholders.
- **Laptop unchanged:** above the query, the app looks and behaves as today. All 321 existing tests keep passing.
- **Release gates:** nothing is pushed, deployed or tagged without the owner's yes.

## Spec deviations (decided here, with reasons)

- **Register card:** the mockup's `regCard` screen is served by `RegisterCardModal`, which shows as a sheet on phones. It has the same content (learner, tap-wait ring), and a second copy of the card-registration flow (polling, retries, the demo "Simulate tap") would drift. So there is no `#/register` route. Settings → "Register a card" opens it in bulk mode; a learner's page opens it for that learner.
- **Notifications:** the bell opens a sheet listing the same notices the laptop bell lists (`todayNotices`). It does not open a full `notifs` screen.

## Review Focus

1. **Back with a sheet open on a routed screen**, e.g. a correction sheet on a learner's page. Back closes only the sheet; a second back leaves the page. Test in Task 1 (Modal) and Task 5.
2. **A phone turned sideways in the middle of editing seats.** It stays on the phone app and the draft survives. Test in Task 1 (query matches a 900×400 screen).
3. **A phone-only link opened on a laptop** (`#/student?id=…`, `#/day?date=…`, `#/seat-edit`). The laptop shows the matching laptop page (Students, Attendance, Seat plan), not Today. Test in Task 1.
4. **`#/day?date=` with a holiday, a weekend, a date in an earlier month, or garbage.** A non-school day shows the laptop's "No classes" message in the phone card. Garbage goes back to Attendance. Nothing crashes. Test in Task 4.
5. **A transferred-out learner's page.** It has no Correct, no Register/Replace and no Transferred out button, and it shows "Left <date>". Test in Task 5.

---

## File structure

```
apps/web/index.html                         viewport-fit=cover
apps/web/src/lib/layout.ts                  PHONE_QUERY, phone store
apps/web/src/lib/back.ts                    closeOnBack(onclose): cleanup
apps/web/src/lib/router.ts                  + param(), hash store, routes student/day/seat-edit/classes, laptopRoute()
apps/web/src/lib/today.ts                   todayTodos, attentionLine, todayNotices (moved out of Today.svelte)
apps/web/src/lib/format.ts                  + shortName
apps/web/src/lib/attendance.ts              + monthSummary, learnerRecentDays
apps/web/src/lib/seat-editor.ts             seat-editor state (moved out of SeatPlan.svelte)
apps/web/src/styles/phone.css               full-screen phone frame, safe areas, sheet fgrid
apps/web/src/components/Modal.svelte        phone: renders as .scrim + .sheet, back closes it
apps/web/src/components/phone/PhoneShell.svelte   frame, fnav, menu (.mdrop)
apps/web/src/components/phone/AdvisoryHead.svelte class header + ctabs.m
apps/web/src/pages/phone/PhoneApp.svelte    route switch for phone screens
apps/web/src/pages/phone/HomePhone.svelte
apps/web/src/pages/phone/SeatPlanPhone.svelte      today, or a past day with ?date=
apps/web/src/pages/phone/AttendancePhone.svelte
apps/web/src/pages/phone/StudentsPhone.svelte
apps/web/src/pages/phone/StudentPhone.svelte       a learner's page
apps/web/src/pages/phone/SeatEditPhone.svelte
apps/web/src/pages/phone/SettingsPhone.svelte
apps/web/src/pages/phone/ProfilePhone.svelte
apps/web/src/pages/phone/CalendarPhone.svelte
apps/web/src/pages/phone/SoonPhone.svelte
apps/web/test/phone-*.test.ts               one file per task
```

---

### Task 1: Phone frame, routes, sheets

**Files:**
- Create: `lib/layout.ts`, `lib/back.ts`, `styles/phone.css`, `components/phone/PhoneShell.svelte`, `pages/phone/PhoneApp.svelte`, `pages/phone/SoonPhone.svelte`, `test/phone-frame.test.ts`
- Modify:
  - `lib/router.ts`, `components/Modal.svelte`, `App.svelte`;
  - `index.html` (viewport `width=device-width, initial-scale=1.0, viewport-fit=cover`);
  - `main.ts` (import `phone.css` after `mockup.css`).

**Interfaces:**
- **`lib/layout.ts`:**
  - `export const PHONE_QUERY = '(max-width: 760px), (max-height: 500px)'`;
  - `export const phone: Readable<boolean>`, from `matchMedia(PHONE_QUERY)` and its `change` event; `false` when `matchMedia` is missing.
- **`lib/back.ts`:** `export function closeOnBack(onclose: () => void): () => void`.
  - It pushes a history entry (`history.pushState({ klSheet: true }, '')`).
  - A `popstate` calls `onclose`.
  - The returned cleanup removes the listener and, if the entry is still on top (`history.state?.klSheet`), calls `history.back()`.
- **`lib/router.ts`:**
  - `Route` gains `'student' | 'day' | 'seat-edit'`.
  - `SOON` gains `classes: 'My classes'`.
  - `export function param(name: string, hash = location.hash): string` (`inviteOf` becomes `param('invite', hash)`).
  - `export const hash: Readable<string>`.
  - `export function go(r: Route, params?: Record<string, string>): void`.
  - `export function laptopRoute(r: Route): Route` maps `student→students`, `day→attendance`, `seat-edit→seat`, and anything else to itself.
- **`PhoneShell.svelte`** props: `{ current: Route; onsignout?: () => void; children: Snippet }`.
  - It renders `<div class="phone app-phone">`, then children, then the mockup's `nav.fnav`. Advisory is "on" for seat, attendance, students, grades, student, day and seat-edit.
  - Menu opens `.mdrop` with `.mdrop-catch`; back closes it via `closeOnBack`.
  - "Help and feedback" goes to `#/account`, as the laptop menu does.
- **`PhoneApp.svelte`** props: the same values `App.svelte` passes to `Shell` and the pages (db, classId, className, session, mode, now, …).
  - It switches on `$route` inside `{#key $hash}`, so a screen that reads `param()` remounts when only the query changes.
  - Until later tasks add phone screens, any route without one renders its laptop page inside `.scr.screen.on`.
  - `classes`, `reports`, `grades`, `manage` and `reader` render `SoonPhone` with the SOON title.
- **`Modal.svelte`:** when `$phone`, it renders `<div class="scrim open" onclick=close></div><div class="sheet open" role="dialog" aria-modal="true" aria-labelledby=…><div class="grab"></div>{children}</div>` and calls `closeOnBack(onclose)` for its lifetime. Escape and focus trapping are unchanged. On laptops it renders as today.
- **`phone.css`:**
  - `.phone.app-phone{width:100%;height:100dvh;border:0;border-radius:0;box-shadow:none}`;
  - `.app-phone .scr{top:env(safe-area-inset-top)}`;
  - `.app-phone .fnav{bottom:calc(12px + env(safe-area-inset-bottom))}`;
  - `.sheet .fgrid{grid-template-columns:1fr}`;
  - `.sheet{max-height:86dvh;overflow:auto;padding-bottom:calc(34px + env(safe-area-inset-bottom))}`;
  - the demo badge moves to the top on phones.
- **`App.svelte`:** when `$phone && session`, it renders `PhoneApp` in place of `<Shell>…</Shell>`. In the laptop branch, the route used to pick a page is `laptopRoute($route)`. Sign in, Sign up and Setup are unchanged.

- [ ] **Step 1: Write the failing tests** in `test/phone-frame.test.ts`. Use a helper `mockMatchMedia(matches: boolean)` that stubs `window.matchMedia` before importing or rendering.
  - `it('PHONE_QUERY treats a sideways phone as a phone')`: `PHONE_QUERY` contains `(max-height: 500px)`.
  - `it('param and routeOf read #/student?id=…')`: `routeOf('#/student?id=l1') === 'student'`; `param('id', '#/student?id=l1') === 'l1'`.
  - `it('laptopRoute sends phone-only routes to their laptop page')`: student→students, day→attendance, seat-edit→seat.
  - `it('on a phone the app shows the bottom bar and no sidebar')`: render `App` with demo deps and matchMedia true. `findByRole('navigation', {name:'Main'})` has the class `fnav`; `document.querySelector('aside.side')` is null.
  - `it('on a laptop the sidebar shows and no bottom bar')`: the reverse.
  - `it('a phone-only link opened on a laptop shows the laptop page')`: hash `#/student?id=x`, matchMedia false. The Students heading shows.
  - `it('on a phone Classes and Reports say coming in the next update')`: click the Classes nav button. `getByText('Coming in the next update')`.
  - `it('on a phone a Modal is a bottom sheet and back closes it')`: render a test harness with `Modal` and `onclose` spied. `.sheet.open` exists. `history.back()` then wait: `onclose` called once.
  - `it('closing a sheet with its button pops its history entry')`: count `history.length` before, open, close via `onclose` unmount. `history.state?.klSheet` is falsy.
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/phone-frame.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the interfaces above. Port `fnav` and `.mdrop` from mockup lines 1701–1708.
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass (321 + new).
- [ ] **Step 5: Browser check** with `klasilid-web` (demo) at 390×844 and 900×400: bottom bar, Menu opens and closes, Classes shows Soon. At 1440: unchanged.
- [ ] **Step 6: Commit** `feat(web): phone frame, bottom bar and sheets`.

---

### Task 2: Shared logic out of the laptop pages

**Files:**
- Create: `lib/today.ts`, `lib/seat-editor.ts`, `test/phone-logic.test.ts`
- Modify: `lib/format.ts`, `lib/attendance.ts`, `pages/Today.svelte`, `pages/SeatPlan.svelte` (use the moved functions; no visible change)

**Interfaces (produced):**
- **`lib/format.ts`:** `export function shortName(l: { firstName: string; lastName: string }): string` returns `'Ana G.'`. An empty last name gives the first name alone.
- **`lib/today.ts`:**
  - `export interface Todo { id: 'reader' | 'cards' | 'unknown' | 'clock'; title: string; sub: string; due: string }`
  - `export function todayTodos(day: ClassDay, noCard: number): Todo[]`: the exact items and copy from `Today.svelte:64-69`.
  - `export function attentionLine(r: LearnerDay, afternoon: boolean): { text: string; session: Session; status: HalfDayStatus }`: moved from `why()` at `Today.svelte:73-80`.
  - `export interface Notice { title: string; sub: string; tone: '' | 'bad' | 'warn' }`
  - `export function todayNotices(day: ClassDay, refused: number, pending: number, online: boolean): Notice[]`: from `Today.svelte:57-62`.
- **`lib/attendance.ts`:**
  - `export function monthSummary(days: ClassDay[]): { presentPct: number | null; late: number; absent: number }`. `presentPct` is present half-days (on time, late or excused) ÷ half-days whose status is not `pending` or `no_school`, rounded; `null` when there are none. `late` is late half-days; `absent` is absent half-days.
  - `export async function learnerRecentDays(db: KlasilidDb, classId: string, learnerId: string, now: Date, n = 5): Promise<{ date: IsoDate; row: LearnerDay }[]>`: newest first, school days of this month and the last.
- **`lib/seat-editor.ts`** (moved from `SeatPlan.svelte:21-73`):
  - `export type Pick = { type: 'stu'; id: string } | { type: 'seat'; idx: number } | null`
  - `export function clickSeat(draft: Layout, sel: Pick, idx: number): { draft: Layout; sel: Pick; movedOut: string | null }`
  - `export function stepSize(draft: Layout, k: 'rows' | 'cols', d: number): { draft: Layout; lost: number }`
  - `export function editorHint(draft: Layout, sel: Pick, learners: LLearner[], msg: string, verb: 'Click' | 'Tap'): string`: the laptop says "Click", the phone "Tap". The copy is otherwise identical to `SeatPlan.svelte:72-73`.

- [ ] **Step 1: Write failing tests** in `test/phone-logic.test.ts`:
  - `shortName({firstName:'Ana', lastName:'Garcia'}) === 'Ana G.'`;
  - `todayTodos` on the demo day (seedDemo) contains `{ id:'reader', title:'Pair your door reader' }`, and `cards` when `noCard > 0`;
  - `attentionLine` for a learner with an after-closing tap returns text starting `Came after closing`;
  - `monthSummary` on two seeded days returns the hand-counted values. Also `monthSummary([])` gives `{ presentPct: null, late: 0, absent: 0 }`;
  - `learnerRecentDays` returns at most n entries, newest first;
  - `clickSeat`:
    - a stu pick on an occupied seat returns `movedOut` = the old occupant;
    - two seat picks swap;
  - `stepSize` shrinking from 8 to 7 rows with someone in row 8 returns `lost: 1`.
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/phone-logic.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** by moving the code into `lib/`. Make `Today.svelte` and `SeatPlan.svelte` call the moved functions.
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass, including the existing Today and Seat plan tests unchanged.
- [ ] **Step 5: Commit** `refactor(web): move Today and seat-editor logic into lib for the phone app`.

---

### Task 3: Home

**Files:** Create `pages/phone/HomePhone.svelte`, `test/phone-home.test.ts`; modify `PhoneApp.svelte` (route `today` → HomePhone).

**Interfaces:**
- **Consumes:**
  - `classDay`, `needsAttention`, `todayTodos`, `attentionLine`, `todayNotices`, `shortName`, `Modal`, `CorrectionModal`;
  - `go('student', { id })`.
- **Props:** `{ db; classId; teacherId; displayName; now; onregister?: () => void }` (the same as `Today.svelte`).
- **Port of mockup `data-screen="home"` (lines 1367–1394):**
  - header: avatar initials, name, date (`fmtDay`, e.g. "Mon, Nov 16"), sync chip "Synced h:mm" or "N changes waiting";
  - bell → Modal sheet "Notifications" listing `todayNotices`;
  - `.net-banner` when offline;
  - big count card with segbar, legend and "Open seat plan";
  - "Needs your attention" rows. A row tap opens `CorrectionModal` for `attentionLine(...).session`, as the laptop does. "See all" → `#/seat`.
- **Then the canvas's To do card:** `.title-row` "To do" + "N left" over `.rows` of `.todo`. Each tick is wrapped in a 44 px button (`aria-pressed`). The "cards" item is a button calling `onregister`, with a chevron.
- **No-class states:** a holiday or suspension, and no tap times. They show the laptop's titles ("No classes today", "Set the tap times first") inside a `.card`.

- [ ] **Step 1: Failing tests** (demo DB, `now` = a school morning):
  - the count shows `of 38 in class`;
  - attention rows use short names (`/^[A-Z][a-z]+ [A-Z]\.$/` on each `b`);
  - "To do" lists "Pair your door reader";
  - each tick has `aria-pressed` and a 44 px box (`getComputedStyle` is not reliable in jsdom; assert the class `tickhit` exists on the button);
  - clicking an attention row opens a dialog named with the learner's short name;
  - with `now` on a holiday, "No classes today" shows.
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/phone-home.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. Browser at 390×844 against `mock-home.png` and the canvas Home board.
- [ ] **Step 5: Commit** `feat(web): phone Home`.

---

### Task 4: Advisory: Seat plan, a past day, Attendance

**Files:**
- Create: `components/phone/AdvisoryHead.svelte`, `pages/phone/SeatPlanPhone.svelte`, `pages/phone/AttendancePhone.svelte`, `test/phone-advisory.test.ts`
- Modify: `PhoneApp.svelte` (routes `seat`, `day`, `attendance`, `grades`)

**Interfaces:**
- **`AdvisoryHead`** props: `{ className: string; count: number; tab: 'seat' | 'attendance' | 'students' | 'grades'; right?: Snippet }`.
  - It ports the mockup's `.hrow` (class name, "Your advisory class · N learners") and `.ctabs.m`. Tabs are links to `#/seat`, `#/attendance`, `#/students`, `#/grades`; the current one has `aria-current="page"` and the class `on`.
  - `right` defaults to a `spacer44`.
- **`SeatPlanPhone`** props: `{ db; classId; teacherId; now; date?: IsoDate }`.
  - Without `date`: today, with `AdvisoryHead` (tab seat; right = edit icon → `#/seat-edit`). Port mockup lines 1397–1408: sess-tabs, filters with counts (All/Late/Absent/Not yet), afternoon note, front, desks, legend.
  - **Desks:** `id="mDesks"` (the mockup's `.lt` rule depends on it), with the markup from the mockup dump: `button.desk.{in|late|absent|notyet}` > `span.av` > `span.bdg`, then `b` (shortName) and `small.num`.
  - **With `date`** (route `day`, `param('date')`):
    - the header is a back button (`history.back()`) plus the long date ("Thursday, Nov 12") and "Gr. 6 Sampaguita · past school day";
    - filters are All/Late/Absent;
    - the hint "Tap a seat to correct this day. A reason is required." shows;
    - no edit icon.
  - A seat tap opens `CorrectionModal` for that date and session.
  - **Bad dates:** a date that isn't `YYYY-MM-DD` → `go('attendance')`. A non-school day → "No classes on this day" in a `.card`.
- **`AttendancePhone`** props: `{ db; classId; now }`.
  - Port mockup lines 1412–1423 with `stat3` from `monthSummary`, and `mnav` over `monthsWithAttendance` (previous/next; next is disabled on the current month).
  - "School days" rows use the mockup script's `.day` markup (date, weekday, "N present", "L late · A absent[ · today]", tag "N absent" or "All in"). Each row is a button with a chevron → `go('day', { date })`.
  - The title row also shows the canvas hint "Tap a day to see or correct it".
- **`grades`:** AdvisoryHead (tab grades) + SoonPhone body.

- [ ] **Step 1: Failing tests:**
  - the seat plan has `#mDesks` with one desk per seated learner, and the late desk's `small` contains `.lt`;
  - tapping a desk opens a dialog with "Save change";
  - in Attendance, clicking the first day row sets `location.hash` to `#/day?date=<that date>`;
  - `#/day?date=<a seeded school day>` shows "past school day" and no edit button;
  - `#/day?date=<a holiday>` shows "No classes on this day";
  - `#/day?date=nonsense` ends on `#/attendance`;
  - a date in the previous month renders;
  - the Report card tab shows "Coming in the next update" under the tabs.
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/phone-advisory.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. Browser check against `mock-seat.png`, `mock-dAtt.png` and the canvas "past school day" board.
- [ ] **Step 5: Commit** `feat(web): phone Advisory seat plan, past day and attendance`.

---

### Task 5: Students and a learner's page

**Files:** Create `pages/phone/StudentsPhone.svelte`, `pages/phone/StudentPhone.svelte`, `test/phone-students.test.ts`; modify `PhoneApp.svelte` (routes `students`, `student`).

**Interfaces:**
- **Consumes:**
  - `studentRows(db, classId, today, filter, query)`, `StudentFilter`, `transferOut`, `learnerRecentDays`, `classDay`, `shortName`;
  - `AddStudentModal`, `TransferModal`, `CorrectionModal`, `RegisterCardModal` (all sheets on phone via Task 1);
  - the App's `register({ learner? , bulk? })` callback, passed down as `onregister`.
- **`StudentsPhone`** props: `{ db; classId; teacherId; now; mode; onregister }`.
  - AdvisoryHead (tab students; right = `iconbtn` "Add student" with the plus icon → `AddStudentModal`).
  - Search `label.search` as in the mockup (line 1484).
  - Filter chips `.filters` > `.fbtn`: All, No card, Card replaced, No parent account, Transferred out, each with its count. These are the values of `StudentFilter`.
  - When no-card count > 0, an `.up-row` "Register cards for N learners" / "Tap each card on the door reader, in list order" → `onregister({ bulk: true })`.
  - Rows use the mockup's `.rowi` markup: shortName; today's first tap "In 7:01 AM", "No tap yet", or "Left <date>" for transferred; tag. A row tap → `go('student', { id })`.
- **`StudentPhone`** props: `{ db; classId; teacherId; now; mode; onregister }`, with the learner id from `param('id')`.
  - Unknown id → `go('students')`.
  - Port mockup lines 1500–1510:
    - back (`history.back()`), hero (initials, shortName, class);
    - today card with status and "Correct" (`mini-btn primary` → CorrectionModal for the current session);
    - `stat3` (present % this month, late, absent, from `learnerRecentDays` over the month);
    - "Recent days" `.day` rows.
  - Then the canvas groups:
    - "Card": `.mrow` "RFID card" / "Registered · ends in XXXX" or "No card yet" + `mini-btn` "Replace"/"Register" → `onregister({ learner })`;
    - "Enrollment": "Enrolled" / "Since <date>[ · from <school>]" + `mini-btn` "Transferred out" → TransferModal.
  - The "Parent" group is not built (plan 4).
  - **Transferred out** (`status === 'left'`): it shows "Left <date>" and the reason, and hides Correct, Register/Replace and Transferred out.
- **`TransferModal`:** change its placeholder to "Name of the new school" (no real place names, design doc).

- [ ] **Step 1: Failing tests:**
  - in Students, the "No card" chip filters the rows;
  - the Add student button opens a dialog titled "Add student";
  - the register banner calls `onregister` with `{ bulk: true }`;
  - a row click → `#/student?id=<id>`;
  - the learner page shows the short name and "Recent days";
  - "Correct" opens a dialog; `history.back()` closes it and the page stays (Review Focus 1);
  - a transferred-out learner shows "Left" and no buttons named Correct, Replace, Register or Transferred out (Review Focus 5);
  - an unknown id ends on `#/students`;
  - the TransferModal placeholder is "Name of the new school".
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/phone-students.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. Browser check against `mock-mStudents.png`, `mock-stu.png` and the canvas Students and learner boards.
- [ ] **Step 5: Commit** `feat(web): phone Students and learner page`.

---

### Task 6: Edit seats

**Files:** Create `pages/phone/SeatEditPhone.svelte`, `test/phone-seat-edit.test.ts`; modify `PhoneApp.svelte` (route `seat-edit`).

**Interfaces:**
- **Consumes:** `seatPlanFor`, `saveSeatPlan`, `fillAZ`, `unseated`, `clickSeat`, `stepSize`, `editorHint(…, 'Tap')`, `classDay` (for the learners), `shortName`.
- **Props:** `{ db; classId; now }`.
- **Port of mockup lines 1435–1452 plus the fixed bar** `.m-ed-actions` (line 1683, shown, not `hidden`):
  - back is "Cancel": it discards and runs `history.back()`;
  - steppers for Rows and Seats per row (`.stepper` with − and + buttons, labelled as in the mockup);
  - "Not seated" with "Fill A–Z" and `.m-unseated.uchips` (`button.uchip`, `.sel` when picked);
  - the hint; front of the room; seats `.eseats`;
  - "Remove from seat" (`btn ghost`, shown while a seat is picked).
  - Save → `saveSeatPlan` → `history.back()`.
- **While this screen shows, the bottom bar is hidden** (the mockup's `.phone.editing .fnav{display:none}`): PhoneShell gets the class `editing` when `$route === 'seat-edit'`.

- [ ] **Step 1: Failing tests:**
  - "More rows" increases the shown row count;
  - tapping a chip then a seat seats that learner and the chip disappears;
  - "Fill A–Z" leaves no chips;
  - Save writes a `seat_plans` outbox item and leaves the screen;
  - Cancel leaves without an outbox item;
  - the bottom bar is not in the document on this route.
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/phone-seat-edit.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. Browser check against the mockup's `seatEdit` screen.
- [ ] **Step 5: Commit** `feat(web): phone seat editor`.

---

### Task 7: Menu screens: Settings, Profile, School calendar

**Files:** Create `pages/phone/SettingsPhone.svelte`, `pages/phone/ProfilePhone.svelte`, `pages/phone/CalendarPhone.svelte`, `test/phone-menu.test.ts`; modify `PhoneApp.svelte` (routes `settings`, `account`, `calendar`).

**Interfaces:**
- **Consumes:**
  - `saveTapWindows`, `setIgnoreRepeat`, `setReviewOutside`, `setLanguage`, `applyTheme`, `savedTheme`, `attendanceCsv` (lib/settings);
  - `saveDisplayName`, `AuthPort.changePassword`;
  - `monthCells`, `setDayType`, `KIND_LABEL` (lib/calendar);
  - `TIMES`, `timeLabel`, `validateWindows`.
- **`SettingsPhone`** props: the same as `Settings.svelte` plus `onregister`. Port mockup lines 1656–1680:
  - header with back;
  - "Tap times" as `.mwin` cards (From / Late after / Until selects), with the same validation and error line as the laptop;
  - "Door reader" group: "Door reader" (→ `#/reader`, Soon) and "Register a card" (→ `onregister({ bulk: true })`);
  - "Display": Appearance (Light/Dark/Auto) and Language (English/Filipino) as `.segset`;
  - the laptop-only settings as `.kv` rows in a "Rules" group: ignore repeat taps, review taps outside tap times, and "Download attendance (CSV)";
  - the mockup's "Accounts" and "Notify me when" groups are not built.
- **`ProfilePhone`** props: the same as `Account.svelte`. Port mockup lines 1642–1654 without the email field:
  - hero;
  - "Your details": Display name (saves via `saveDisplayName`) and Username (read-only);
  - "Security": "Change password", opening a Modal sheet with current, new and confirm fields and the laptop's messages.
- **`CalendarPhone`** props: the same as `Calendar.svelte`. Port mockup lines 1468–1478:
  - back, `.monthnav.m`, `.cstats.m`, `.cweek.m` and `.cgrid.m` from `monthCells`, "Special days" list;
  - tapping a day opens a Modal sheet titled with the date, with the four kinds as `role="menuitemradio"` buttons (the same options as `DayMenu`). Picking one calls `setDayType`.

- [ ] **Step 1: Failing tests:**
  - in Settings, changing "Morning in late after" to a time before "From" shows the laptop's overlap/order error and doesn't save;
  - a valid change queues a `tap_windows` op;
  - "Register a card" calls `onregister({ bulk: true })`;
  - the Dark appearance button sets `html[data-theme="dark"]`;
  - in Profile, saving a display name updates the cached user;
  - the Change password sheet rejects mismatched new passwords with the laptop's message;
  - in Calendar, tapping a school day and choosing "Holiday" queues a `calendar_days` upsert.
- [ ] **Step 2: Run** `npx.cmd vitest run apps/web/test/phone-menu.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass. Browser check against the mockup's `settings`, `profile` and `pcal` screens.
- [ ] **Step 5: Commit** `feat(web): phone settings, profile and calendar`.

---

### Task 8: Loose ends and new screenshots

**Files:** Modify `PhoneApp.svelte` and `phone.css` where needed; `apps/web/public/auth/phone-*.png`; `apps/landing/img/phone-today.png`; `test/phone-frame.test.ts`.

- [ ] **Step 1: Failing tests** in `phone-frame.test.ts`:
  - on a phone with no class and setup needed, the setup wizard shows inside the phone frame and its Next button is reachable;
  - the update banner and the "Connect once to load your class" card render inside `.scr`.
- [ ] **Step 2: Run them.** Expected: FAIL where the frame hides them.
- [ ] **Step 3: Fix:**
  - render the wizard, banner and connect-once card inside PhoneApp's `.scr`;
  - make the wizard modal fit at 390 px (`phone.css`: `.modal .box.wiz` max-height `100dvh` and scrollable).
- [ ] **Step 4: Run** `npx.cmd vitest run`. Expected: all pass.
- [ ] **Step 5: Screenshots.** With `klasilid-web` (demo) running, run `node ~/tools/shots/shoot.mjs <scratch>/img5`. Its 390 px shots are now the phone app.
  - Look at each one for real names; the script renames them to samples.
  - Copy `phone-today.png`, `phone-seats.png` and `phone-attendance.png` to `apps/web/public/auth/`, and `phone-today.png` to `apps/landing/img/`.
- [ ] **Step 6: Browser check** of every phone screen at 390×844 and 900×400 (sideways), and the laptop at 1440. Then run `npm.cmd run build -w @klasilid/web`. Expected: the build succeeds.
- [ ] **Step 7: Commit** `feat(web): phone app loose ends and new phone screenshots`.
