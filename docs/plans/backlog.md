# Backlog carried out of plan 1

Pick these up in the plan named.

## Plan 2 (teacher app)
Plan 2a (`2026-11-15-plan-2a-teacher-app-core.md`) covers the first five items below. The rest go to plan 2b.

- Show `clock_suspect` taps to the teacher. `computeDay` does not see the flag; add it to `Tap` or show suspect taps on the review list.
- A learner with no in-tap but a tap in the out window shows as absent and the tap is hidden. Send that tap to the review list (`packages/core/src/status.ts`).
- Insert a learner and their enrollment in one server function (RLS only shows a learner once they are enrolled).
- Setup wizard needs a server function to create the school and school year and set `school_years.admin_id`.
- Access checks ignore `enrollments.left_on`; decide whether a transferred-out learner's family keeps access to history (spec says history is kept).
- Removing a tap window from a date forward (e.g. no afternoon out) has no representation yet.
- Calendar type `event` is not a `DayType`; map it to `school` in the caller.
- Run `npx supabase init` and deploy; deploy the `tap` function with `--no-verify-jwt`.

## Plan 4 (parents and students)
- Consent goes through a `give_consent(version)` server function that stamps `now()` and writes the audit log, instead of a direct column update.
- Families can't read `seats`; if the parent view shows the child's seat, add a definer function that returns only their own child's seat.

## Plan 5 (reader firmware)
- Upload response is `{ acked: number[], rejected: number[] }`. Mark `acked` as sent and drop `rejected` (unreadable UID).
- Send `tappedAt` as ISO 8601 with `Z`. The server stores a time without a time zone as suspect.

## Later
- A reader moved to another class hands its old taps to the new teacher; scope taps by the device's class at tap time if readers ever move.
- A learner can't be enrolled with two teachers. Phase 3 subject classes (ECR uploads) need a rule for shared learners.
- Owner role has no policies for devices or reader requests.
