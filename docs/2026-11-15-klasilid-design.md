# Klasilid — design

Date: 2026-11-15 · Status: approved by the owner on 2026-11-15
UI reference: [mockup/klasilid-mockup-v37.html](mockup/klasilid-mockup-v37.html) (clickable; open in a browser). Where this document and the mockup disagree, this document wins.

Marks used below: **(decided)** = the owner chose it. **(builder's call, proposed)** = filled in during design, can be changed.

---

## 1. Intent

Klasilid (klase + silid) digitizes the daily paperwork of one DepEd public elementary teacher at San Isidro West Central School, Isabela:

- adviser of **Grade 6 Diamond**;
- teaches **AP 6** and **AP 5** to other sections.

Today she takes attendance by hand, fills the SF2 (Daily Attendance Report) by hand, and keeps grades in the DepEd/Teach Pinas ECR Excel files. Parents only learn about attendance and grades at card day.

Klasilid should:

1. take advisory-class attendance automatically with an RFID door reader;
2. show her who is in, late or absent on a seat plan, so she can catch a card tapped by a classmate;
3. fill the SF2 for her;
4. let parents and students follow attendance and grades from their phones;
5. never ask her to type grades twice: grades come only from the ECR files she already makes.

Success means a full month of SF2 she would submit as-is, parents checking the app instead of asking her, and no day where attendance failed because the internet was down.

The owner (her son) builds and runs it. Later, other teachers may buy a door reader from him and use Klasilid for their own classes.

## 2. People and roles

The role comes from the account itself. There is no role picker at sign-in. Every rule below is enforced on the server, not just hidden in the app.

| Role | Can see | Can change |
|---|---|---|
| **Teacher (adviser)** | Her advisory class: attendance, seat plan, students, cards, report-card grades from all subjects. Her own subject classes. | Attendance corrections (with a reason), seat plan, roster, cards, tap windows, calendar, uploads of her own class records |
| **Teacher (subject only)**, phase 3 | Classes she uploaded records for | Her own uploads |
| **Parent/guardian** | Their own child or children: attendance history and **every score** in the class records, by month and by school year | Nothing except their own profile and consent |
| **Student** | Their own attendance history and **final grades only** | Nothing except their own profile |
| **Owner (operator)** | Door reader requests, reader devices, system health. **No access to learner data through the app.** | Device registration |

Phase 1 users: the teacher, plus Diamond parents and students. **(decided)**

## 3. Goals, non-goals, anti-goals

**Goals**
- Attendance works with no internet and no laptop. **(decided)**
- One screen per task. Web pages fit a laptop screen without page scrolling; long tables paginate. **(decided)**
- The same app runs as a website, an Android app and a Windows app. **(decided)**
- History is kept: past months and past school years, for the teacher, parents and students. **(decided)**

**Non-goals (for now)**
- Typing or calculating grades in Klasilid. The ECR file stays the source. **(decided)**
- SF1 and SF9 generation, LMS features, chat or messaging, fees.
- An iPhone app. iPhone users use the website. **(decided)**
- Attendance for subject classes. Only the advisory class is tracked. **(decided)**

**Anti-goals: a failure even if it technically works**
- Anyone, including the teacher, can edit a grade inside Klasilid. **(decided)**
- An attendance change with no recorded reason. **(decided)**
- Children's data leaking, appearing in test builds, or visible to the wrong parent.
- A day of attendance lost because the Wi-Fi or internet was down.
- The teacher doing more work than with paper.
- Being too heavy for low-end Android phones or old school laptops.

## 4. Constraints

- **Law.** Data Privacy Act of 2012 (RA 10173). Learners are minors. Parent consent is collected in the app. A privacy notice is required. Real data goes in only after the **principal's written approval**. **(decided)**
- **Network.** School Wi-Fi may be weak or may require signing in on a web page (a captive portal), which the reader can't do. Internet can drop for days. Mobile data is costly for parents.
- **People.** The owner is one person building, hosting and supporting it, and pays the bills. **(decided)** Running costs must stay near zero until the pilot proves it.
- **Devices.** Parents have low-end Android phones; some have iPhones; some have no smartphone. The teacher has a laptop or phone.
- **DepEd formats.** The SF2 must match the official layout exactly. Class records arrive as Teach Pinas three-term ECR v2.0 `.xlsm` (DO 15 s.2026) for now; other templates come later.
- **Time.** All school times are Asia/Manila. Store UTC; display Manila time.

## 5. Approaches (how it is built)

### Packaging: one app for web, Android and Windows

| | Approach | Trade-off |
|---|---|---|
| **A (picked)** | **Tauri 2** for both Windows and Android, wrapping one TypeScript web app | One packaging tool. Small installers (about 10 MB on Windows, using the WebView2 already in Windows 10/11). Built-in Windows auto-update. Its Android support is newer than Capacitor's; if it causes trouble, swap the Android shell to Capacitor without touching app code. |
| B | Capacitor (Android) + Tauri (Windows) | Most proven per platform, but two tools for one person to maintain. |
| C | Capacitor + Electron | About 100 MB Windows download, heavy on RAM: too much for old school laptops. |

The owner picked **A**. **(decided)** The owner asked for a landing page with downloadable apps first, and wants both a mobile and a Windows app. **(decided)**

### Backend

**Supabase** (builder's call, proposed), because one free service covers what Klasilid needs:
- Postgres database;
- logins;
- row-level security, which enforces the role table in §2 in the database itself;
- file storage for ECR files and excuse-letter photos;
- small TypeScript server functions (Edge Functions) for reader uploads, ECR parsing and SF2 generation.

Rejected:
- A self-built Node server on a VPS: more to secure and patch for one person.
- Firebase: weak fit for relational school data and SQL reports.

Known catch: free Supabase projects pause after about a week with no activity, which could happen over school breaks. Either keep a scheduled ping running or move to the paid plan (about US$25/month) once real data is in.

### Frontend stack (builder's call, proposed)

- **Svelte 5 + Vite + TypeScript**, built as a single-page app. Small bundles suit low-end phones. React is an acceptable swap.
- **Dexie** (IndexedDB) for the offline copy of data on each device.
- **Supabase JS** client.
- Visual design follows the mockup:
  - black and orange; accent `#FF7A1A` with dark text on orange;
  - light and dark mode;
  - floating sidebar on web and floating bottom bar on phones;
  - all choice inputs are dropdowns;
  - one button style.

## 6. System overview

```
 [RFID card] ─tap─▶ [Door reader: ESP32 + RC522 + OLED + buzzer + RTC + battery]
                         │  stores every tap on flash, works with no network
          ┌──────────────┴───────────────┐
   local Wi-Fi (no internet needed)      internet (when available)
          │                              │
 [Teacher app: Windows / Android]        ▼
   reads taps from the reader ──────▶ [Supabase: DB + auth + storage + functions]
   keeps an offline copy (Dexie)  ◀────┘        ▲
                                                │
                 [Website + parent/student apps]
```

Every tap has a unique ID. It can reach the server by two paths: the reader uploads it directly, or the teacher's app relays it. Duplicates are dropped by ID, so taking both paths is safe.

## 7. Features

### 7.1 Attendance (advisory class only)

**Four taps a day** **(decided)**: morning in, morning out, afternoon in, afternoon out.

**Tap windows** **(decided)**
- Each of the four taps has its own window, set by the teacher: *opens*, *late after*, *closes*. The setup wizard asks for these times; nothing is hard-coded.
- Windows can't overlap. Settings refuses an overlapping window.

**Status rules**

| Situation | Result |
|---|---|
| "In" tap between *opens* and *late after* | **On time** for that half-day |
| "In" tap between *late after* and *closes* | **Late** |
| "In" tap after *closes* | **Late**, flagged "came after closing" on the review list. One action changes it to absent. **(decided)** |
| Any tap outside every window, e.g. "out" well before the out window opens | Goes to the **review list**; status is unchanged until the teacher decides |
| No "in" tap for a half-day on a school day | **Absent** for that half-day once its in window closes |
| No "out" tap | Recorded as "no time out"; does not change the status |
| Repeat taps of the same card within the "ignore repeat taps" setting (1/3/5/10 minutes) | Ignored; the first tap counts |
| No-school day (holiday, suspension, or the afternoon of a half day) in the calendar | No absences are counted |

**Corrections** **(decided)**
- The teacher can change any half-day status, e.g. mark absent someone whose card a classmate tapped.
- A reason is required: Forgot their card / Card not working / Tapped by a classmate, not in room / Sick (excused) / School activity or errand / Arrived but did not tap / Other (free text required).
- Taps are never edited or deleted. A correction is a separate record that overrides the computed status. If there are several corrections, the newest one wins. Every correction stays in the audit history: who, when, old status, new status, reason.

**Excused absences** **(decided)**
- A reason is always required.
- The teacher can also attach a photo of the excuse letter, stored privately.
- Parents sending letters from their app is a later feature.

**One status function**
- Status is computed by a single TypeScript function. It runs in the app (so status works offline) and on the server (as the source of truth).
- Inputs: the taps, the windows in effect that day, the calendar and the corrections.
- Window changes apply from a chosen date forward. Past days keep the windows they had.

### 7.2 Seat plan **(decided)**
- The teacher sets rows × seats per row (1–10 each).
- Learners are placed by tap-then-tap or by dragging. "Fill A–Z" places everyone alphabetically.
- The plan shows each learner's live status for the chosen day: on time / late / absent / not yet. This is how she spots a card tapped by an absent classmate.
- Colors: on time = ink, late = orange, absent = red. Green is reserved for "system OK".
- A plan applies from a date forward. Past days show the plan they had.

### 7.3 Students and cards
- **Roster:** name, sex, LRN (builder's call: optional field), joined date, parent account status, card status.
- **Transfers in and out** with a date **(decided)**. Leavers drop off attendance from their last day but keep their history.
- **Cards:** 13.56 MHz MIFARE cards. A card is identified by its UID.
  - Register one card: tap it on the reader while "register" mode is on, then pick the learner.
  - Bulk registration: tap cards one after another, assigning each to the next learner on the list.
  - Replace a lost card: the old UID stops working at once.
  - A tap from an unknown card gets a distinct beep and appears in the app for registration.
- The app is the only place cards are assigned. The reader doesn't need to know names to record a tap.

### 7.4 Grades (phase 2) **(decided)**
- Grades come **only** from uploaded ECR `.xlsm` files. No screen edits a grade.
- On upload, the server parses the file and **detects subject, grade, section and term**. The teacher confirms; she doesn't type them.
- **Name matching:** each name in the file is matched against the roster. Names that don't match exactly are listed for the teacher to match once; the match is remembered for later uploads. Unmatched names are never silently dropped.
- **Versions:** every upload is a new version. The newest is shown; older versions stay viewable, with who uploaded and when.
- **Who sees what:**
  - Parents see every score: written work, performance tasks and exams per term, as in the file.
  - Students see final term grades only.
  - The adviser sees all subjects' term grades for her class on **Report card grades**, once each subject's teacher has uploaded. In phase 1–2 she uploads everything herself.
- **Her subject classes in other sections** (AP 5, AP 6 Ruby and others; builder's call):
  - The learner list comes from the uploaded file itself. These classes need no seat plan, cards or attendance.
  - Only she sees those grades until each section's own adviser joins in phase 3. Those parents and students then get access through their adviser's login slips, and the adviser's Report card grades include her uploads.
  - Name matching (above) applies only where a roster exists: Diamond now, other sections once their adviser joins.
- First template supported: Teach Pinas three-term ECR v2.0. Other templates are added only once real sample files exist. An unknown template is refused with a clear message, never guessed at.
- Parsing runs on the server, so a modified app can't inject grades. The original file is kept in private storage.
- Reference file: the teacher's real `AP 6 _DIAMOND FINAL.xlsm`. **It contains real learner names: never commit it, upload it to third-party tools, or use it in test data.** Build a fake copy with made-up names for tests.

### 7.5 Reports
- **SF2 generation:** a filled SF2 for any month, as an Excel file in the official layout, ready to print or submit. It is built from the computed attendance plus corrections and the calendar.
  - Before release, compare its output with one of her real submitted SF2s, line by line: counts, tardy marks, half-day marks and monthly totals.
- **Export:** the teacher can export attendance and roster as CSV or Excel, plus a full export of her class data to hand to the school. The owner gets no learner-data export through the app (§2). (builder's call)
- **SF2 mapping is a separate layer** (builder's call). The status function outputs one status per half-day: on time, late, absent or excused, plus flags such as "no time out". A separate SF2 module turns those into SF2 marks and totals, for example how a half-day absence counts in the totals and whether a missing afternoon "out" counts as cutting classes. That way, checking against her real SF2 (§14) changes only the SF2 module, not the status function. Start from the official SF2 guidelines; the real sample is the final check.

### 7.6 School calendar **(decided)**
- Month view with day cards. Past school days show their attendance %.
- Philippine regular and special holidays are preloaded for the school year.
- The teacher adds half days, class suspensions and school events. These drive "no absence counted" in §7.1 and the SF2.

### 7.7 Parent and student views **(decided)**
- View-only, phone first.
- Today's status; a month grid of past attendance; a school-year switcher.
- Grades as described in §7.4.
- In-app activity feed, e.g. "Ana was late, Nov 5, 7:42 AM". Push notifications and SMS come later.
- One parent account can be linked to several children (builder's call).

### 7.8 Accounts, sign-in and consent
- **Teacher:** creates her account in the **first-time setup wizard**. Steps: school year, class (grade and section), seat layout, tap windows, pair the reader, add learners, register cards.
- **Parents and students:** the teacher prints **login slips**, one sheet per learner. Each sheet has two cut-apart halves (builder's call):
  - a **parent** half: username and one-time password;
  - a **student** half: a separate username and one-time password.
  - Parent and student are separate accounts, so the rule that students see final grades only is enforced on the server.
- **Sign-in is username + password. No SMS is needed** (builder's call, keeps running costs at zero). At first sign-in, the user sets their own password.
  - Adding an email is optional. It enables self-service password reset.
  - Without an email, the reset is "ask the adviser for a new login slip", as in the mockup. Printing a new slip voids the old password.
- The parent must accept the **privacy notice and consent** before seeing anything. A student's account works only after their parent has consented.
- Sign-out, and revoking a parent link (by the teacher), are supported.

### 7.9 Door reader page **(decided)**
- An in-app page explaining the reader. It lets another teacher **request a reader** from the owner: name, school, class size (Up to 30 / 31–40 / 41–50 / More than 50), contact.
- Price is shown as "₱ —" until the owner sets it.
- Requests reach the owner by email and appear in an owner-only list.

### 7.10 Settings and account **(decided)**
- **Account:** profile and password. Separate from Settings.
- **Settings tabs:**
  - Attendance: tap windows, ignore-repeat time;
  - Reader: status, Wi-Fi, pairing;
  - Class;
  - Language: English / Filipino;
  - Appearance: light / dark / follow device. Default light.
  - Data: export.
- **Phone menu:** a dropdown above the Menu button, whose icon turns into an X. It lists only pages that have no other entry point.

### 7.11 Landing page **(decided)**
- A public website explaining Klasilid.
- Buttons: **Download for Android** (APK), **Download for Windows** (installer), **Open in browser**.
- Also hosts the **privacy notice** and the door reader request link.
- No learner data on it.

## 8. Door reader (hardware and firmware)

**No soldering, low cost (decided).** Every part arrives with pins already attached and connects with female-to-female jumper wires. The first reader costs about ₱920 before student cards.

**Parts:**
- ESP32 dev board (pins pre-soldered);
- RC522 13.56 MHz reader, the "soldered" variant (3.3 V);
- 0.96″ I²C OLED;
- active buzzer module;
- DS3231 RTC module with coin cell;
- 40 female-to-female jumper wires;
- power from any USB phone charger and cable;
- a junction box with a clear cover, about 158 × 90 mm (₱169), as the case.
  - The RC522 and the OLED are taped to the inside of the clear cover. Cards read through the cover, and the screen shows through it.
  - The USB cable comes in through one small hole, made with a heated nail or a cutter. That is the only tool step.

**Backup power (decided: no battery board).** The reader is plugged into a power bank that supports pass-through charging (charging and powering at the same time), and the power bank stays plugged into the wall.
- Check that the power bank doesn't switch itself off at the reader's low current draw, about 100 mA.
- If the power fails completely, taps already saved stay on flash and the DS3231 keeps time on its coin cell, so nothing recorded is lost.
- Days-long outages (typhoons) are out of scope. The teacher corrects those days by hand.
- The DS3231 runs from the ESP32's 3.3 V supply, so its coin-cell charging circuit is effectively off and needs no modification.

**Firmware** (C++, Arduino framework via PlatformIO; builder's call):
- **Tap:**
  - Read the UID and stamp it with RTC time.
  - Append it to a flash log (LittleFS). The log must hold at least 30 school days of taps for 50 learners.
  - Give feedback on the OLED and buzzer within half a second: time, plus "Recorded". Name and status show when the reader has a roster cached.
- **Tap ID:** `deviceId-sequence-tappedAtMillis` (set by the server). The sequence number survives reboots; the time in the ID means a wiped reader that restarts its sequence never collides with old taps, while a retry of the same tap still deduplicates.
- **Clock:** the DS3231 is the time source. It resyncs from NTP whenever the reader has internet, and the app can also set it while paired. Each tap stores its clock source and last-sync time, so bad clock data can be spotted.
- **Network modes (decided: Wi-Fi, not Bluetooth):**
  1. joins the school Wi-Fi;
  2. if that's absent, runs its own hotspot, **"Klasilid-Diamond"**.
- **Local API** for the teacher's app on the same network:
  - list taps since a sequence number;
  - status (clock, battery, storage, last upload);
  - receive the cached roster and today's windows;
  - register mode.
  - Every call needs a pairing token set during setup.
- **Upload:** when online, the reader posts unsent taps to the `tap` server function with its device key and marks them sent when they come back in `acked`. Taps in `rejected` (unreadable card UID) are dropped. A tap with an unreadable or time-zone-less time is still stored, using the server's time, and flagged. Retries back off.
- **Setup:** first boot opens the hotspot with a small setup page for Wi-Fi details and pairing. The setup wizard walks the teacher through it.
- Over-the-air firmware update: builder's call, recommended.

**Limits to accept:** card UIDs can be cloned, and a student can tap a friend's card. Mitigations are the seat-plan check (§7.2), corrections, and instant card replacement.

## 9. Offline and sync

- **Reader:** always records. Needs no network.
- **Teacher app (Windows/Android):**
  - Keeps an offline copy of the class, roster, windows, calendar, corrections and recent taps.
  - Shows status and allows corrections offline.
  - Reads taps from the reader over local Wi-Fi.
  - Queues its own changes, such as corrections, roster edits and seat plans, and uploads them when internet returns.
- **Why the website can't reach the reader:** a browser blocks an `https` website from calling the reader's plain-`http` local address. Only the Tauri apps can do it, through Tauri's HTTP plugin. In the browser, taps appear once they reach the server.
- **Hotspot catch:** when the reader runs its own hotspot, a device joined to it has no internet while connected.
- **Conflict rules:**
  - Taps are append-only and deduplicated by ID.
  - Corrections are append-only; the newest by its timestamp wins.
  - For roster, seat plan and settings, the last write wins, and every change is kept in the audit log.
- **Parents and students:** read-only. They see the last synced data with a "last updated" time.

## 10. Data (sketch)

Main tables:
- `schools`, `school_years`, `users` (role, language)
- `classes` (subject, grade, section, school year, teacher, is_advisory)
- `learners` (name, sex, LRN), `enrollments` (learner, class, joined_on, left_on, leave_reason)
- `guardians` (user, learner, consent_at, consent_version), `login_codes` (one-time)
- `cards` (uid, learner, active, issued_at, replaced_at)
- `devices` (reader id, class, key hash, pairing token hash, firmware version, last seen)
- `tap_windows` (class, session am/pm, kind in/out, opens, late_after, closes, effective_from)
- `taps` (id = deviceId-seq, device, card_uid, tapped_at, clock_synced_at, received_at)
- `attendance_corrections` (learner, date, session, status, reason, reason_text, photo path, by, at)
- `calendar_days` (date, type: holiday / half / suspension / event, name, scope)
- `seat_plans` (class, rows, cols, effective_from), `seats` (plan, row, col, learner)
- `ecr_uploads` (class, term, file path, version, uploaded_by, uploaded_at, template, parse result), `name_matches` (class, name_in_file, learner)
- `grades` (upload, learner, component, item, score, max)
- `reader_requests`
- `audit_log`

Row-level security on every table, following §2.

## 11. Security and privacy

- Row-level security for every role. A test suite checks that a parent can't read another family's rows and that a student can't read component scores.
- Devices authenticate with per-device keys, stored only as hashes on the server. A reader can only add taps; it can't read anything.
- Private storage buckets for ECR files and letter photos, served by short-lived signed links.
- **No real learner data in development or test data.** Fake data is generated.
- Privacy notice and versioned consent records.
- Retention: keep records for the school year plus the period the school's privacy officer sets. Delete or export on request.
- Daily database backups.
- Personal data never goes in URLs.

## 12. Distribution and updates

- **Website:** static hosting (Cloudflare Pages or similar, free) on a domain. The domain name hasn't been checked yet.
- **Windows:** Tauri `.msi`/`.exe` installer, with the Tauri updater for automatic updates. It will show an "unknown publisher" warning until it is on the **Microsoft Store**, which is the plan, or signed with a certificate.
- **Android:** Tauri APK downloaded from the landing page. Users must allow "install unknown apps". The app checks a version file and prompts to download new versions. **Google Play** (US$25 once) comes after the pilot.
- **iPhone:** website only.

## 13. Rollout

No fixed pilot date. Build the full phase 1 scope on all three platforms (web, Windows, Android); don't cut it down to hit a date. **(decided)** Order the reader parts early, since shipping takes time.

1. **Phase 1, pilot:**
   - door reader;
   - attendance (four taps, windows, review, corrections, excuses);
   - seat plan, roster and cards, calendar;
   - SF2;
   - parent and student attendance view, login slips and consent;
   - setup wizard;
   - landing page with Android, Windows and web.
   - Run 2–4 weeks with paper attendance in parallel. **(decided)**
2. **Phase 2:** ECR upload, name matching, versions; parent scores; student final grades; adviser report-card view.
3. **Phase 3:** other teachers' accounts and uploads; door reader requests and sales; Microsoft Store and Google Play; push notifications or SMS; parents sending excuse letters.

## 14. Open: waiting on the school or the owner

- The principal's written approval, and whether the school has a data privacy officer. Must come before any real data.
- How the school Wi-Fi works, especially whether it has a captive portal, and its signal at the door. The owner will check during on-site testing. **(decided: test on site)**
- One real submitted SF2, and the official SF2 template file, to check the generated output against.
- Door reader price, and whether requests show the owner's name and number or "the Klasilid team".
- ECR samples from other teachers and subjects, MAPEH in particular, before phase 3 uploads.

## 15. Left to the builder

- Project layout, component structure, styling approach, state management.
- Exact database schema, indexes and migrations. §10 is a sketch.
- Firmware structure, flash log format, retry timing, over-the-air updates.
- How the app finds the reader on the network (mDNS name, fixed hotspot IP, or IP saved during pairing).
- The test approach. Must include: the status function (every row of the §7.1 table), RLS rules, ECR parsing against the fake file, SF2 output against the real sample, and tap de-duplication.
