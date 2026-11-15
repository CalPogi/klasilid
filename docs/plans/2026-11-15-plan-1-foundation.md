# Klasilid Plan 1: Foundation (attendance rules, database, reader upload)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The tested core that every screen and the reader depend on:
- the attendance status rules;
- the phase 1 database with row-level security;
- the server endpoint that accepts taps from the door reader.

**Architecture:**
- An npm-workspaces repo in `Mommy System/`.
- `packages/core` is pure TypeScript with no runtime dependencies. It holds the time, tap-window and status logic that both the app (offline) and the server use.
- `supabase/` holds the SQL migrations and the `tap` Edge Function. The function's logic lives in a pure `handler.ts`, so it is tested in Node. Only `index.ts` touches Deno.
- The database tests run the real migrations in PGlite (Postgres compiled to WebAssembly), so no Docker is needed.

**Tech Stack:** TypeScript 5, Node 22, Vitest, @electric-sql/pglite, Supabase (Postgres 15+, Edge Functions on Deno).

**Spec:** `docs/2026-11-15-klasilid-design.md`. Read §7.1, §7.3, §8, §9, §10 and §11 before starting.

**This is plan 1 of 7.** The later plans are listed at the end. Each one builds on this one's interfaces.

## Global Constraints

- All school times are Asia/Manila (UTC+8, no daylight saving). Store UTC, compute and display Manila time. (spec §4)
- Four taps a day: `am`/`pm` × `in`/`out`. Each has a window: *opens*, *late after*, *closes*. Windows can't overlap. (spec §7.1)
- Taps are never edited or deleted. Corrections are separate rows, and the newest correction wins. (spec §7.1)
- A correction needs a reason: `forgot_card | card_not_working | tapped_by_classmate | sick | school_activity | arrived_no_tap | other`. `other` requires text. (spec §7.1)
- Tap ID = `deviceId-sequence`. Duplicates are dropped by ID. (spec §6, §8)
- No real learner data in code, fixtures or tests. `*.xlsm` and `*.xlsx` are git-ignored. (spec §7.4, §11)
- The owner (operator) gets no row-level-security access to learner data. (spec §2)
- `packages/core` has zero runtime dependencies.

## Review Focus

1. **The reader clock resets** (RTC battery dies → year 2000) or runs ahead. The tap must still be stored and acknowledged, with `clock_suspect = true`, and never silently dropped. Tested in Task 6.
2. **The same tap arrives twice** (reader upload plus app relay, or a retry after a lost acknowledgement). One row is stored, and both requests acknowledge it. Tested in Task 6.
3. **Taps at the exact boundary seconds:** 7:15:59 with late-after 7:15 is on time; 7:16:00 is late; a tap at exactly *closes* is late, not after-closing. Tested in Task 3.
4. **Windows changed mid-year:** past days keep the windows they had. Tested in Task 2.
5. **A parent linked but not yet consented** sees nothing, and a student sees nothing until their parent consents. Tested in Task 5.

---

## File structure

```
Mommy System/
  package.json                 workspaces, root scripts, devDeps (vitest, typescript, pglite)
  tsconfig.base.json
  vitest.config.ts             includes packages/*/test/** and supabase/tests/**
  .gitignore
  packages/core/
    package.json               name "@klasilid/core", no dependencies
    src/types.ts               shared types (below)
    src/time.ts                Manila date/minute helpers
    src/windows.ts             validateWindows, windowsForDate
    src/status.ts              computeDay
    src/index.ts               re-exports
    test/time.test.ts  test/windows.test.ts  test/status.test.ts
  supabase/
    config.toml                from `npx supabase init`
    migrations/20261115000000_init.sql     tables, audit triggers
    migrations/20261115000100_rls.sql      helper functions + policies
    functions/tap/handler.ts   pure request handler
    functions/tap/index.ts     Deno.serve wrapper using supabase-js
    tests/shim.sql             test-only stand-ins for Supabase's auth schema and roles
    tests/db.ts                PGlite setup helper
    tests/schema.test.ts  tests/rls.test.ts  tests/tap-handler.test.ts
```

---

### Task 1: Repo scaffold and core types

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `.gitignore`, `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/types.ts`, `packages/core/src/index.ts`, `packages/core/test/smoke.test.ts`

**Interfaces:**
- Produces, in `packages/core/src/types.ts`:

```ts
export type Session = 'am' | 'pm';
export type TapKind = 'in' | 'out';
export type Minutes = number;            // minutes after Manila midnight, 0..1439
export type IsoDate = string;            // 'YYYY-MM-DD' (Manila calendar date)

export interface TapWindow {
  session: Session; kind: TapKind;
  opens: Minutes; lateAfter: Minutes | null;   // null for 'out' windows
  closes: Minutes; effectiveFrom: IsoDate;
}
export interface Tap { id: string; cardUid: string; at: string /* ISO 8601 UTC */ }
export type DayType = 'school' | 'holiday' | 'suspension' | 'half';   // 'half' = no school in the afternoon
export type HalfDayStatus = 'on_time' | 'late' | 'absent' | 'excused' | 'pending' | 'no_school';
export type Flag = 'after_closing' | 'no_time_out';
export type CorrectionReason = 'forgot_card' | 'card_not_working' | 'tapped_by_classmate'
  | 'sick' | 'school_activity' | 'arrived_no_tap' | 'other';
export interface Correction {
  id: string; session: Session;
  status: 'on_time' | 'late' | 'absent' | 'excused';
  reason: CorrectionReason; reasonText?: string; at: string /* ISO UTC */;
}
export interface HalfDay {
  status: HalfDayStatus; flags: Flag[];
  inTapId?: string; outTapId?: string; correctionId?: string;
}
export interface ReviewItem { tapId: string; at: string; why: 'outside_window' }
export interface DayResult { am: HalfDay; pm: HalfDay; review: ReviewItem[] }
```

- [ ] **Step 1: `git init` in `Mommy System/`, then write `.gitignore`.** It must contain `node_modules/`, `dist/`, `.superpowers/`, `*.xlsm`, `*.xlsx`, `.env*`, `supabase/.temp/`.
- [ ] **Step 2: Write the root `package.json`** with `"private": true`, `"workspaces": ["packages/*"]`, `"type": "module"`, scripts `"test": "vitest run"` and `"typecheck": "tsc -p packages/core --noEmit"`, and devDependencies `vitest`, `typescript`, `@electric-sql/pglite`. `tsconfig.base.json` sets `strict: true`, `target: ES2022`, `module: ESNext`, `moduleResolution: Bundler`. `vitest.config.ts` includes `packages/*/test/**/*.test.ts` and `supabase/tests/**/*.test.ts`.
- [ ] **Step 3: Write `packages/core/src/types.ts`** exactly as in Interfaces, and `index.ts` re-exporting it. Add `test/smoke.test.ts` asserting `typeof import('../src/index') === 'object'`.
- [ ] **Step 4: Run `npm install`, then `npm test` and `npm run typecheck`.** Expected: 1 test passes, typecheck exits 0.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "chore: scaffold workspace and core types"`

---

### Task 2: Manila time helpers and tap windows

**Files:**
- Create: `packages/core/src/time.ts`, `packages/core/src/windows.ts`, `packages/core/test/time.test.ts`, `packages/core/test/windows.test.ts`

**Interfaces:**
- Consumes: Task 1 types.
- Produces:
  - `manilaDate(iso: string): IsoDate`
  - `manilaMinute(iso: string): Minutes`, floored to the whole minute
  - `hm(s: string): Minutes`, a test/setup helper: `'07:15'` → `435`
  - `validateWindows(ws: TapWindow[]): string[]`, which returns human-readable errors; an empty array means valid
  - `windowsForDate(all: TapWindow[], date: IsoDate): TapWindow[]`, which returns 0–4 windows sorted by `opens`

- [ ] **Step 1: Write the failing tests.**

```ts
// time.test.ts
expect(manilaDate('2026-11-12T16:30:00Z')).toBe('2026-11-13');      // 00:30 Manila next day
expect(manilaMinute('2026-11-12T23:15:59Z')).toBe(hm('07:15'));      // seconds floored
expect(manilaMinute('2026-11-12T23:16:00Z')).toBe(hm('07:16'));
// windows.test.ts — W = am-in 06:30/07:15/08:00, am-out 11:30/–/12:15, pm-in 12:30/13:00/13:30, pm-out 16:00/–/17:00, effectiveFrom 2026-06-01
expect(validateWindows(W)).toEqual([]);
expect(validateWindows([{...amIn, lateAfter: hm('08:30')}, ...rest])).toContain('Morning in: "late after" must be between opens and closes');
expect(validateWindows([amIn, {...amOut, opens: hm('07:50')}, ...rest])).toContain('Morning out overlaps Morning in');
expect(validateWindows([{...amIn, kind:'in', lateAfter: null}, ...rest])).toContain('Morning in: "late after" is required');
// window changed mid-year: past days keep the old one (Review Focus 4)
const later = {...amIn, lateAfter: hm('07:30'), effectiveFrom: '2026-11-10'};
expect(windowsForDate([...W, later], '2026-11-09').find(w=>w.session==='am'&&w.kind==='in')!.lateAfter).toBe(hm('07:15'));
expect(windowsForDate([...W, later], '2026-11-10').find(w=>w.session==='am'&&w.kind==='in')!.lateAfter).toBe(hm('07:30'));
expect(windowsForDate(W, '2026-05-31')).toEqual([]);
```

- [ ] **Step 2: Run `npm test`.** Expected: these tests fail because the functions are not defined.
- [ ] **Step 3: Implement.** Manila = UTC + 480 minutes; use plain `Date` arithmetic, no library. `windowsForDate` picks, for each (session, kind), the window with the greatest `effectiveFrom <= date`. `validateWindows` checks:
  - `opens < closes`;
  - for `in` windows, `lateAfter` is non-null with `opens <= lateAfter <= closes`;
  - for `out` windows, `lateAfter` is null;
  - in the order am-in, am-out, pm-in, pm-out, each window's `closes < next.opens`.
  - Labels are "Morning in", "Morning out", "Afternoon in" and "Afternoon out". Use the error strings exactly as in the tests.
- [ ] **Step 4: Run `npm test`.** Expected: PASS.
- [ ] **Step 5: Commit.** `git commit -am "feat(core): Manila time helpers and tap window rules"` (add new files first).

---

### Task 3: The status function

**Files:**
- Create: `packages/core/src/status.ts`, `packages/core/test/status.test.ts`
- Modify: `packages/core/src/index.ts` (re-export)

**Interfaces:**
- Consumes: `manilaMinute`, `windowsForDate`, and the types from Tasks 1–2.
- Produces:

```ts
export interface DayInput {
  date: IsoDate;
  taps: Tap[];                 // this learner's taps for this date, any order
  windows: TapWindow[];        // already filtered with windowsForDate
  dayType: DayType;
  corrections: Correction[];   // this learner, this date
  now: string;                 // ISO UTC; for past dates pass any time after the day ends
  ignoreRepeatMinutes: 1 | 3 | 5 | 10;
}
export function computeDay(input: DayInput): DayResult;
```

**Rules** (spec §7.1). Each rule is one test:
1. Sort taps by `at`. Drop any tap within `ignoreRepeatMinutes` of the last *kept* tap.
2. A tap matches the window with `opens <= minute <= closes`.
3. For an `in` window: on time if `minute <= lateAfter`, late if `minute > lateAfter`. Only the first matching tap counts; later ones are ignored, not sent to review.
4. If an `in` window has no matching tap, an unmatched tap with `in.closes < minute < next window's opens` (or end of day if there's no next window) makes that half-day `late` with flag `after_closing`.
5. Any other unmatched tap → `review` with `why: 'outside_window'`, and it doesn't change status.
6. An `in` window with no tap → `pending` while `now`'s Manila minute is `<= closes` on that date, otherwise `absent`.
7. An `out` tap sets `outTapId`. If the half-day has an in tap, its out window has closed (by `now`), and there's no out tap, add flag `no_time_out`. The flag doesn't change status.
8. `dayType` `holiday`/`suspension` → both halves `no_school`; `half` → `pm` is `no_school`. A `no_school` half gets no flags and no review items.
9. Corrections: for each session, the correction with the greatest `at` overrides `status` and sets `correctionId`. Flags stay.

- [ ] **Step 1: Write the failing tests.** Use the windows `W` from Task 2, date `2026-11-13`, `now = '2026-11-13T12:00:00Z'` (20:00 Manila), and a helper `tap(id, 'HH:MM:SS')` that builds a UTC ISO time from a Manila time.

```ts
it('on time at 07:15:59, late at 07:16:00', ...)          // am.status 'on_time' / 'late'  (Review Focus 3)
it('tap exactly at closes 08:00:00 is late, not after_closing', ...)
it('08:20 with no earlier in-tap is late + after_closing', ...)   // flags ['after_closing']
it('08:20 after a 07:10 tap goes to review, status stays on_time', ...)
it('no in-tap: pending at 07:59 Manila, absent at 08:01', ...)
it('repeat taps within ignoreRepeatMinutes are dropped', ...)    // 07:10:00 and 07:12:00 with 3 → one kept; the second is NOT in review
it('missing out-tap adds no_time_out once its window closed', ...)
it('a 10:00 tap (between windows, not after an in-window gap) goes to review', ...) // am-in tapped 07:00, 10:00 → review
it('holiday → both no_school; half day → pm no_school', ...)
it('newest correction wins and keeps flags', ...)   // two corrections on am; the later 'absent' wins; correctionId set
it('excused via correction', ...)
```

- [ ] **Step 2: Run `npm test -- status`.** Expected: FAIL, `computeDay` not defined.
- [ ] **Step 3: Implement `computeDay` in `status.ts`.** Write it as a pure function with no I/O and no `Date.now()`; time comes only from `now`.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(core): attendance status function"`

---

### Task 4: Database schema

**Files:**
- Create: `supabase/config.toml` (via `npx supabase init`), `supabase/migrations/20261115000000_init.sql`, `supabase/tests/shim.sql`, `supabase/tests/db.ts`, `supabase/tests/schema.test.ts`

**Interfaces:**
- Produces:
  - Tables, in schema `public`, with `uuid` primary keys `default gen_random_uuid()` unless noted:
    - `schools`(name)
    - `school_years`(school_id, label e.g. 'SY 2026–2027', starts_on, ends_on)
    - `profiles`(id uuid PK = auth user id, role text check in ('teacher','parent','student','owner'), display_name, language text default 'en')
    - `classes`(school_year_id, teacher_id → profiles, subject, grade int, section, is_advisory bool, ignore_repeat_minutes int default 3 check in (1,3,5,10))
    - `learners`(last_name, first_name, middle_name, sex check in ('M','F'), lrn text null, user_id → profiles null)
    - `enrollments`(class_id, learner_id, joined_on date, left_on date null, leave_reason text null; unique (class_id, learner_id))
    - `guardians`(user_id → profiles, learner_id, consent_at timestamptz null, consent_version text null; PK (user_id, learner_id))
    - `login_codes`(learner_id, for_role check in ('parent','student'), username text unique, code_hash text, used_at null, voided_at null)
    - `cards`(uid text PK check `uid ~ '^[0-9A-F]{8}([0-9A-F]{6})?$'`, learner_id, active bool default true, issued_at, replaced_at null)
    - `devices`(id text PK e.g. 'KD-0001', class_id, key_hash text, pairing_token_hash text, firmware text, last_seen_at)
    - `tap_windows`(class_id, session, kind, opens int, late_after int null, closes int, effective_from date; unique (class_id, session, kind, effective_from))
    - `taps`(id text PK, device_id, card_uid text, tapped_at timestamptz, clock_synced_at timestamptz null, clock_suspect bool default false, received_at timestamptz default now())
    - `attendance_corrections`(learner_id, class_id, date, session, status, reason, reason_text, photo_path null, created_by, created_at; check `reason <> 'other' or length(trim(reason_text)) > 0`)
    - `calendar_days`(school_year_id, date, type check in ('holiday','half','suspension','event'), name; unique (school_year_id, date))
    - `seat_plans`(class_id, rows int check 1..10, cols int check 1..10, effective_from date)
    - `seats`(plan_id, row int, col int, learner_id; unique (plan_id, row, col), unique (plan_id, learner_id))
    - `audit_log`(bigserial id, table_name, row_id text, action, old jsonb, new jsonb, actor uuid, at timestamptz default now())
  - Columns not listed above are the builder's choice. Do **not** create `grades` or `ecr_uploads`; they belong to plan 6.
  - `taps` and `attendance_corrections` reject `UPDATE` and `DELETE` through a trigger that raises `'append-only'`.
  - An audit trigger `audit_row()` on `attendance_corrections`, `enrollments`, `cards`, `tap_windows`, `seat_plans`, `seats` writes to `audit_log` with `actor = auth.uid()`.
  - `supabase/tests/db.ts`: `export async function freshDb(): Promise<PGlite>`. It runs `shim.sql`, then every file in `supabase/migrations/` in name order.
  - `shim.sql` is test-only. It creates schema `auth`, `auth.users(id uuid primary key)`, `auth.uid()` returning `nullif(current_setting('request.jwt.claim.sub', true), '')::uuid`, and the roles `anon`, `authenticated`, `service_role`. Real Supabase already has all of these, so the migrations must **not** create them.

- [ ] **Step 1: Spike — confirm PGlite supports `CREATE ROLE`, `SET ROLE` and RLS.** Run a 10-line script under `node` that creates a role, a table with a policy, `SET ROLE`, and selects. If it fails, stop and report: the fallback is Docker plus `npx supabase start`, which changes `db.ts` only.
- [ ] **Step 2: Write the failing tests** in `schema.test.ts`:

```ts
it('migrations apply cleanly', async () => { await freshDb(); });
it('taps are append-only', ...)            // insert, then UPDATE → rejects /append-only/; DELETE → rejects
it('corrections need text when reason is other', ...)   // reason 'other', reason_text '' → rejects
it('card uid format is enforced', ...)     // '04a1b2c3' (lowercase) rejects; '04A1B2C3' ok; '04A1B2C3D4E5F6' ok
it('duplicate tap id is ignored with on conflict do nothing', ...) // insert twice → count 1
it('correction insert writes an audit_log row with the actor', ...)
```

- [ ] **Step 3: Run `npm test -- schema`.** Expected: FAIL, missing migration.
- [ ] **Step 4: Write `20261115000000_init.sql`** to make the tests pass.
- [ ] **Step 5: Run `npm test`.** Expected: PASS.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(db): phase 1 schema with append-only taps and audit log"`

---

### Task 5: Row-level security

**Files:**
- Create: `supabase/migrations/20261115000100_rls.sql`, `supabase/tests/rls.test.ts`

**Interfaces:**
- Consumes: Task 4 tables and `freshDb()`.
- Produces: these SQL helper functions, `security definer`, `stable`, `set search_path = public`:
  - `is_class_teacher(class_id uuid) → bool`
  - `is_consented_guardian(learner_id uuid) → bool`: a `guardians` row for `auth.uid()` with `consent_at is not null`
  - `is_consented_student(learner_id uuid) → bool`: `learners.user_id = auth.uid()` and some guardian of that learner has consented
  - `can_view_learner(learner_id uuid) → bool`: teacher of any class the learner is enrolled in, OR consented guardian, OR consented student
- RLS is enabled on every table in Task 4.
- Policies (`authenticated` role only; `anon` gets nothing):
  - The teacher of a class has full access to its `enrollments`, `cards` (via enrollment), `devices` (select only), `tap_windows`, `calendar_days` (via school year of her class), `seat_plans`, `seats`, and `attendance_corrections` (insert and select only). She can select `taps` whose `device_id` belongs to her class.
  - Any viewer can select `learners` through `can_view_learner`.
  - Guardians and students can select only their own learner's `attendance_corrections` and `taps` (joined through `cards.uid` → `learner_id`), plus the `tap_windows`, `calendar_days` and `seat_plans` of that learner's advisory class. They cannot insert, update or delete anything except their own `profiles` row (update) and their `guardians.consent_*` (update own row).
  - Nobody can select `login_codes`, `devices.key_hash` or `devices.pairing_token_hash` through the API. Revoke column privileges on the two hash columns from `authenticated`.
  - `owner` role: no policies. It reads nothing learner-related. (spec §2)
  - `audit_log`: the teacher selects rows for her own classes' tables; nobody else can.

- [ ] **Step 1: Write the failing tests.** Add a helper `as(db, userId, fn)` that runs `set local role authenticated; set local request.jwt.claim.sub = '<id>'` inside a transaction. Seed: school, year, teacher T, advisory class C, learners A and B, parents PA (consented) and PB (linked to B, **not** consented), student SA (A's account), owner O, device D in C, and taps for A's and B's cards.

```ts
it('teacher sees both learners and all taps of her class', ...)
it('consented parent sees only their own child', ...)          // PA selects learners → [A]; taps → only A's card
it('unconsented parent sees nothing', ...)                     // PB → learners [], taps []   (Review Focus 5)
it('student sees nothing until a parent consents, then only self', ...)
it('owner sees no learners, taps or corrections', ...)
it('parent cannot insert a correction', ...)                   // rejects
it('teacher cannot update or delete a correction', ...)        // append-only + no policy
it('device key hashes are not readable by the teacher', ...)  // select key_hash → permission denied
it('anon sees nothing', ...)
```

- [ ] **Step 2: Run `npm test -- rls`.** Expected: FAIL.
- [ ] **Step 3: Write `20261115000100_rls.sql`.**
- [ ] **Step 4: Run `npm test`.** Expected: all pass, schema tests included.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(db): row-level security for teacher, parent, student, owner"`

---

### Task 6: Reader upload endpoint (`tap` function)

**Files:**
- Create: `supabase/functions/tap/handler.ts`, `supabase/functions/tap/index.ts`, `supabase/tests/tap-handler.test.ts`

**Interfaces:**
- Consumes: the `devices` and `taps` tables.
- Produces:
  - **Request contract** (the reader in plan 5 and the app relay in plan 2 use it): `POST /functions/v1/tap`, header `x-device-key: <plain key>`, JSON body
    `{ "deviceId": "KD-0001", "taps": [{ "seq": 41, "cardUid": "04A1B2C3", "tappedAt": "2026-11-13T23:10:02Z", "clockSyncedAt": "2026-11-13T21:00:00Z" | null }] }`.
  - **Responses:**
    - `200 {"acked":[41,...]}`, listing every seq that is now stored, whether new or a duplicate;
    - `401` for an unknown device or a wrong key;
    - `400 {"error":"..."}` for a malformed body, or more than 500 taps.
  - App relay: the app sends the same body with the device key it received at pairing. A single contract is enough. (ponytail: one key per reader for both paths. Add per-user relay auth if keys ever leak.)
  - Signatures:
    - `export interface TapDeps { findDevice(id: string): Promise<{ keyHash: string } | null>; insertTaps(rows: TapRow[]): Promise<void>; now(): Date }`
    - `export interface TapRow { id: string; device_id: string; card_uid: string; tapped_at: string; clock_synced_at: string | null; clock_suspect: boolean }`
    - `export async function handleTap(headers: Headers, body: unknown, deps: TapDeps): Promise<{ status: number; body: unknown }>`
    - `export async function sha256Hex(s: string): Promise<string>`, using Web Crypto (works in Node 22 and Deno)
  - `insertTaps` in `index.ts` uses supabase-js with the service-role key: `upsert(rows, { onConflict: 'id', ignoreDuplicates: true })`.

- [ ] **Step 1: Write the failing tests.** Use in-memory `deps`, where `insertTaps` pushes into a `Map` keyed by id.

```ts
it('stores taps with id deviceId-seq and acks them', ...)          // id 'KD-0001-41'
it('wrong key → 401, nothing stored', ...)
it('unknown device → 401', ...)
it('same batch sent twice → one row each, both acked', ...)         // Review Focus 2
it('clock reset (tappedAt 2000-01-01) is stored with clock_suspect true and acked', ...)  // Review Focus 1
it('tappedAt more than 5 minutes ahead of now() → clock_suspect true', ...)
it('unregistered card uid is stored', ...)                           // attribution happens later, via cards
it('lowercase uid is normalised to uppercase; non-hex uid → 400', ...)
it('more than 500 taps → 400', ...)
```

- [ ] **Step 2: Run `npm test -- tap-handler`.** Expected: FAIL.
- [ ] **Step 3: Implement `handler.ts`.**
  - `clock_suspect` is true when `tappedAt < 2026-01-01T00:00:00Z` or `tappedAt > now + 5 min`.
  - Validate the body by hand; it's 15 lines, no schema library.
  - Compare key hashes in constant time: XOR every character of the two equal-length hex strings and check the total.
  - Write the thin Deno wrapper `index.ts` with `Deno.serve`, reading `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` from the environment.
- [ ] **Step 4: Run `npm test`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat(api): tap upload endpoint for door readers"`

---

## After this plan: the remaining plans, in order

Each is written once the one before it is done, so it can use the real interfaces.

2. **Teacher app, phase 1** (Svelte 5 + Vite):
   - sign-in and setup wizard;
   - Today, Seat plan, Attendance with review list and corrections (with photo), Students and cards, School calendar with PH holidays, Settings and Account;
   - Dexie offline copy and sync queue; app relay of taps.
3. **Reports:** the SF2 module, built from the official template and checked against her real SF2, plus CSV/Excel export.
4. **Parent and student views:** login slips, consent and privacy notice, attendance history, activity feed.
5. **Door reader firmware** (ESP32, PlatformIO): flash log, RTC/NTP, OLED/buzzer, local API, upload, hotspot setup, register mode.
6. **Packaging and landing page:**
   - Tauri 2 Windows installer with auto-update, and the Android APK with an update prompt;
   - the local reader link through Tauri's HTTP plugin;
   - the landing page with download buttons and the privacy notice.
7. **Phase 2 grades:** ECR upload and parsing on the server, name matching, versions, parent scores, student final grades, adviser report card. Phase 3 (other teachers, reader requests, app stores, notifications) is planned after the pilot.

**Tools needed later, not for this plan:**
- Rust (`rustup`), Android Studio and SDK, and WebView2 for plan 6;
- PlatformIO for plan 5;
- a Supabase account for the first deploy.
