# Klasilid phone app: design

Status: approved by the owner on 2026-11-17 (canvas boards "Phone app: screens the mockup didn't have" approved with it).
Visual source of truth: the mockup's "Mobile app" section, teacher phone (`docs/mockup/klasilid-mockup-v37.html`, `#tp`, lines ~1354â€“1712, plus its script for screens filled in by JavaScript).

## Why

The Android app is the website squeezed to phone width: the laptop sidebar becomes a hamburger menu and every page keeps its laptop layout. The mockup has a separate phone app with:
- a bottom bar;
- a big "33 of 38 in class" card;
- tabs under Advisory;
- bottom sheets for corrections.

That phone app was never built. The owner wants the phone app to be the one in the mockup. The landing and sign-in pages also show phone screenshots, and they should show the real phone app.

Success looks like this:
- The adviser opens Klasilid on her Android phone and gets the mockup's phone app, working on her real class.
- A phone browser, including an iPhone, gets the same phone app.
- New phone screenshots replace the current ones.

## Goals

- The mockup's teacher phone app, screen for screen, for every feature that is already built.
- The phone and laptop versions run on the same data and the same rules, so they never disagree.
- Android's back button and swipe-back behave as she expects: back closes the sheet, or returns to the previous screen.

## Non-goals

- Features that are not built yet, apart from their "coming in the next update" screens:
  - Classes and subject classes;
  - report card grades;
  - Reports and SF2;
  - class record upload;
  - notifications;
  - the door reader page and pairing;
  - parent and learner accounts.
- The parent and learner phones in the mockup (plan 4).
- A tablet layout. Anything wider than a phone keeps the laptop layout.
- Changes to the laptop pages, apart from moving shared logic into `lib/` (see Constraints).
- The mockup's phone frame: the island, status bar and home bar are presentation only and are not drawn.

## Anti-goals (a failure even if it works)

- The phone and laptop versions computing the same thing in two places, and drifting apart (e.g. who counts as late).
- New colours, type or spacing. The tokens and the mockup's phone CSS already in `apps/web/src/styles/mockup.css` are used as they are.
- Real names or the real section in tests, screenshots or copy. Sample names come from `~/tools/shots/shoot.mjs`; the section is "Sampaguita".

## Decisions (the owner's)

- **Approach A:** separate phone screens. Each built page gets a phone version that ports the mockup's phone markup (`TodayPhone.svelte` beside `Today.svelte`, and so on).
  - A width switch shows them, inside a phone frame component (`PhoneShell`) with the bottom bar.
  - Both versions read and write through the same `lib/` functions.
  - Rejected: one component per page holding both layouts (pages twice as long, layouts tangled); CSS-only restyle (can't produce the mockup's phone screens).
- **The bottom bar is the mockup's:** Home Â· Advisory Â· Classes Â· Reports Â· Menu.
  - Classes and Reports appear and open a "coming in the next update" screen, as the laptop sidebar does today.
  - Inside Advisory, the Report card tab does the same.
- **Layout by screen size, not by platform** (proposed in conversation; the owner did not object). The phone app shows in the Android app and in any phone browser when the screen matches `(max-width: 760px), (max-height: 500px)`. 760 px is the breakpoint the auth pages already use.
  - *Builder's-check call:* the height clause keeps a phone turned sideways (800â€“930 px wide, under 500 px tall) on the phone app. Otherwise the layout would switch mid-task, losing an open correction sheet's typed reason and unsaved Edit seats changes, and stranding phone-only routes.
  - A laptop window dragged narrower than 760 px does switch; that is accepted.

## Screens

Each phone screen ports the mockup's markup and classes for that screen. "Built" lists where the data and logic already exist today.

| Phone screen | Mockup `data-screen` | Built (data/logic from) | Notes |
|---|---|---|---|
| Home | `home` | Today page, `lib/attendance` | Header: avatar, name, date, sync chip, bell. Banner: no internet. The mockup's "reader offline" banner is left out (builder's-check call: no reader data exists yet; it comes with plan 6b). Big count card with segment bar and legend; "Open seat plan". "Needs your attention" rows open the learner's page. The laptop "To do" card is not in the mockup and is left out. |
| Advisory Â· Seat plan | `seat` | SeatPlan page | Morning/Afternoon tabs, filters with counts, afternoon note, front of room, desks, legend. Tapping a seat opens the correction sheet. The edit icon opens Edit seats. |
| Advisory Â· Attendance | `dAtt` | Attendance page | Three stats, month navigation, list of school days. The mockup script defines the row content. What tapping a day does is open (see "Open question"). |
| Advisory Â· Students | `mStudents` | Students page | Search, list; a row opens the learner's page. |
| Advisory Â· Report card | `dGrades` | none | "Coming in the next update" screen inside the Advisory tabs. |
| Learner's page | `stu` | StudentDrawer, CorrectionModal | Hero, today card with "Correct" (opens the sheet), three stats, recent days. The mockup's "Parent" section is left out until plan 4. The card actions the laptop drawer has (register, replace, deactivate) appear as rows here. |
| Edit seats | `seatEdit` | SeatPlan edit mode | Row and seat steppers, Not seated chips, Fill Aâ€“Z, seats, and the fixed Cancel / Save seat plan bar (`m-ed-actions`). |
| Correction sheet | `#sheet` | CorrectionModal | Bottom sheet: Present/Late/Absent/Excused, reason select with "Otherâ€¦", Cancel / Save change. The same rules as the laptop modal (a reason is required). |
| Classes | `classes` | none | "Coming in the next update". |
| Reports | `reports` | none | "Coming in the next update". |
| Menu | `.mdrop` | Shell's account menu | Sheet: Profile, Settings, School calendar, Help and feedback, Sign out. |
| Profile | `profile` | Account page | Display name, username, Change password. The mockup's "Email for password resets" is left out (deferred in plan 6c). |
| Settings | `settings` | Settings page | Tap times as `mwin` cards with the same validation. Door reader: "Door reader" (coming in the next update) and "Register a card". Display: Appearance and Language. The mockup's Accounts and "Notify me when" groups are left out (not built). Laptop-only settings (ignore repeat taps, outside-window review, CSV export) appear as rows in the matching group. |
| Register card | `regCard` | RegisterCardModal | Learner select, tap-wait ring, the real reader flow (no "Simulate tap" except in demo mode, as today). |
| School calendar | `pcal` | Calendar page, DayMenu | Month navigation, stats, grid, Special days; tapping a day opens the day menu as a sheet. |
| Notifications (bell) | `notifs` | none | The bell behaves as it does on the laptop Today page today. |
| Sign in, Sign up | `signin` | SignIn, SignUp | The approved plan 6c pages are already built for phones and stay; the mockup's older phone sign-in is not used. |
| First-time setup | none | Setup wizard | Not in the phone mockup. The existing wizard is checked at 390 px and fixed only where it breaks. |
| Update banner, demo badge, "connect once" message | none | App.svelte | Shown in the phone frame above the screen content. |

## Open question (the owner's)

The mockup's phone screens have no place for some things the laptop already does:
- Add student;
- Transfer out;
- register cards in bulk;
- the Students filters (No parent, Transferred out);
- Today's "To do" list: cards to register, taps with a wrong reader clock, learners with no card;
- correcting a past day. On the laptop you click a cell in the month grid; on phone, the Attendance day list has no such path.

**Owner's answer:** design phone screens for them.

They are drawn on the canvas under "Phone app: screens the mockup didn't have", with new parts outlined in orange. They are built from the app's own phone stylesheet and use the laptop's existing wording.
- **Home:** a "To do" card under "Needs your attention", with the laptop's items and a 44 px tick target. "Register cardsâ€¦" opens Register cards.
- **Attendance â†’ a school day:** each day in the list gets a chevron and opens that day.
  - The day screen is the mockup's phone seat plan for that date: Morning/Afternoon, All/Late/Absent filters, front of the room, seats with tap times, legend. A back button and the date replace the class header.
  - Tapping a seat opens the same correction sheet; a reason is required.
  - Route: `#/day?date=YYYY-MM-DD`, for any month the attendance screen can show.
- **Names on phone screens** follow the mockup: first name and last initial ("Ana G."), everywhere.
- **Students:**
  - a + button in the header opens the Add student sheet (the laptop form's fields and wording);
  - rows as in the mockup: today's first tap ("In 7:01 AM") and status tag;
  - filter chips for All, No card, Card replaced, No parent account and Transferred out;
  - a "Register cards for N learners" banner when anyone has no card.
- **A learner's page:** a "Card" group (Register or Replace) and an "Enrollment" group, where "Transferred out" opens the transfer sheet. The laptop's sample placeholder "e.g. Cauayan South CS" becomes "Name of the new school" (no real place names).

## How it fits together

- **Width switch:** a small store, e.g. `lib/layout.ts` exporting `phone` (a `matchMedia('(max-width: 760px)')` readable).
  - `App.svelte` renders `PhoneShell` and the phone screens when it is true; otherwise `Shell` and the laptop pages, as today.
- **Routes:** the same hash routes as today. Two additions:
  - phone-only screens get their own routes so Android's back works: a learner's page (`#/student?id=â€¦`), Edit seats, Register card;
  - the router already reads `?â€¦` after the route name (added for invite links).
- **Sheets:** sheets (correction, menu, day menu) close on back. Opening a sheet pushes a history entry; back pops it.
- **Shared logic:** where a laptop page computes something inline that its phone screen also needs, move it into `lib/` first, with no behaviour change and the existing tests still passing. Then both versions call it.
- **Safe areas:**
  - add `viewport-fit=cover`;
  - pad the bottom bar and the edit-seats bar with `env(safe-area-inset-bottom)`;
  - pad the header with `env(safe-area-inset-top)`.
  This is needed so nothing sits under Android's gesture bar.
- **Touch targets:** 44 px minimum. This holds wherever the mockup already sets it; check the bottom bar, steppers and chips.

## Testing

- **Component tests** for each phone screen, the same kind as the laptop pages' tests:
  - renders from the demo database;
  - the main action works (correct a status, save seats, change a tap time, navigate the tabs).
- **App-level tests:**
  - below 760 px the bottom bar shows and the sidebar doesn't;
  - above, the reverse;
  - back closes an open sheet.
- **Browser check:** at 390 Ã— 844 against the mockup's phone screens, and at 1440 to confirm the laptop is unchanged.
- **Screenshots:** re-capture with `shoot.mjs` (its 390 px shots will then be the phone app). Replace `apps/web/public/auth/phone-*.png` and `apps/landing/img/phone-today.png`.

## Constraints

- Svelte 5, the existing stores and `lib/` modules, Dexie offline-first. No new dependencies.
- All existing tests keep passing (321 at the time of writing).
- Release gates as before: nothing is pushed, deployed or tagged without the owner's yes.

## Left to the builder

- The exact split of each laptop page's logic into `lib/` (Constraints says how).
- Component names and file layout beyond `PhoneShell` and `<Page>Phone.svelte`.
- The order the screens are built in. Suggested: frame and Home first, then Advisory, then the rest.
- Where the mockup's script builds a list (attendance days, students, the seat grid), follow the script's row markup and wording.
