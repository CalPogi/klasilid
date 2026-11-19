# Door reader screen: animated UI

Date: 2026-11-19 · Status: draft, waiting for the owner's approval

Marks: **(decided)** = the owner chose it. **(builder's call, proposed)** = filled in during design, can be changed.

## 1. Why

The reader's screen today is plain text: the time, the words "Wi-Fi" / "Hotspot" / "No Wi-Fi", an "N to send" count, and two lines for a tap. The owner wants it to look finished, move, show its status with proper icons (Wi-Fi first), and be readable at the classroom door in morning sun.

Approved screens **(decided)**: the design canvas boards "Reader screen: status bar, start-up, idle, setup, after hours", "Reader screen: tap results, frame by frame" and "Reader screen: problems" (canvas https://claude.ai/artifact/LQUuLx898BG7FU4tqW7bvq, section "Door reader screen"). The firmware matches them; where this document and a board differ, the board wins on looks and this document on behaviour.

Success: every screen on the boards appears on the real reader, the animations run smoothly, a tap still beeps and shows its result within 500 ms, and the learners can read the result at the door.

## 2. Goals, non-goals, anti-goals

Goals:
- **Status bar** (top 16 rows): date on the left; on the right a slot for taps waiting (count + arrow, the arrow rising while uploading) or a problem icon, then Wi-Fi.
- **Screens:** start-up (mark draws, name wipes in, progress bar), idle (big clock, rounded "Tap your card" button), after hours (dim), setup (QR code + hotspot name + address), tap results (On time, Late, Recorded, Card not registered, Already in, Saved · check the time), problems that keep taps working (No Wi-Fi, Clock not set, Key not accepted) and problems that stop them (Reader full, Storage error).
- **Motion:** the tap sequence (grow, fold, rise, hold, slide away), the clock's last digit rolling on the minute, the card gliding in the button, problem messages rolling in the button, the upload arrow rising, the start-up draw-in, and a one-pixel drift each minute against burn-in.
- **Brightness:** the panel at its brightest during school hours, lowest after hours.

Non-goals:
- A colour screen (the owner kept the one-colour OLED **(decided)**).
- Changing how taps are judged (on time / late / recorded stay as `statusFor` decides), how they are saved or uploaded, or the setup page.
- Reporting a firmware version.
- Different layouts per panel colour: the boards' panel-colour switch only shows how one layout looks on each panel.

Anti-goals (a failure even if everything else works):
- A tap taking longer than 500 ms from card to beep and first flash frame, or the beep waiting for an animation.
- A card going unread because a frame was being drawn (a frame may delay reading by at most one frame, about 33 ms).
- A screen element that stays lit in the same place all day (burn-in).
- Text cut off or overlapping on any screen, with real names up to the roster's limit.

## 3. Constraints

- Hardware as built: SSD1306 128 × 64 on its own I²C bus (Wire1, 400 kHz); one full redraw takes about 33 ms (measured). Some panels are yellow on rows 0–15 and blue below, so nothing but the status bar (and full-screen flashes) uses rows 0–15.
- Firmware: Arduino core 2.0.17 (espressif32@6.9.0), U8g2 full-buffer mode, network work stays on core 0, taps on core 1 (spec §8).
- The tap path: card → save to flash → beep → screen, within 500 ms (today about 290 ms).
- On-board Unity tests for logic (`firmware/test/test_core`), as today; drawing is checked by eye on the reader.

## 4. Approaches

- **A. Frames from the main loop (picked (decided)).** The loop that polls the card reader also draws the next animation frame when one is due (at most every 40 ms). A card arriving mid-frame waits at most one frame. Least code; one owner of the screen.
- **B. A separate screen task.** Taps send the screen a message; card reading never waits. Rejected: a second task sharing the display buffer and state, more code and harder tests, to save about 33 ms the budget doesn't need.

## 5. How it works

### Screen logic, separate from drawing (builder's call, proposed)

- New pure code in `firmware/lib/core/src/screen.{h,cpp}`: given the time (uptime ms and clock), the latest status (Wi-Fi bars or mode, taps waiting, uploading, problems) and events (a tap result), it decides **what to show and where each animation is** (scene + phase + progress 0–1 + drift offset). No U8g2 there, so it is testable on the board.
- `firmware/src/hw/display.cpp` draws whatever the screen logic says, with U8g2, using the boards' layout.
- `main.cpp` feeds events and status in, and each loop calls the screen's `frameDue(now)` and draws when one is due; static screens redraw once a second (the clock), animations at up to 25 frames a second.

### Status bar

- Date "THU 19 NOV" (Manila date, capitals); "-- --- ---" when the clock isn't set.
- Wi-Fi, rightmost: 3 bars at RSSI ≥ −60 dBm, 2 at ≥ −72, 1 below; "hotspot" icon when only the hotspot is on; "no Wi-Fi" (stubs and a cross) when neither is connected. **(builder's call, proposed thresholds)**
- The slot to its left: the count of taps waiting (hidden at 0) with an up arrow that rises while an upload runs; a problem icon replaces the arrow (count kept) for Key not accepted, and the clock icon replaces count and arrow for Clock not set, as drawn.

### Tap results

- Timeline **(decided, from the board)**: 0–0.2 s light grows from the centre with the result's icon until the panel is lit; 0.2–0.45 s it folds down into the band; 0.45–0.7 s the name rises into place; held until 2.5 s; 2.5–2.8 s the result slides up as idle slides in. A new tap at any point starts its own sequence at once.
- The first flash frame is drawn right after the beep starts, in the same place `display::tap` is called today, so the tap's feedback time doesn't grow beyond one frame.
- The time in a band is the tap's clock time: "7:12" for on time, late and already in (short, to fit; these happen in a known tap window), "3:05 PM" with AM/PM for recorded taps, which can be any time of day. **(builder's call, proposed)**
- Results and band text: ON TIME · 7:12, LATE · 7:41, RECORDED · 3:05 PM, Card not registered / SHOW YOUR ADVISER, ALREADY IN · m:mm (outlined band, no flash, name rise only, 1.5 s), SAVED · CHECK THE TIME (when the clock isn't set). Sounds unchanged, plus a very short tick for Already in.
- Names: as the roster gives them (first name and last initial). Longer than 10 characters: a smaller face; longer than 18: cut with "...". **(builder's call, proposed: measured against the chosen fonts so nothing overflows 124 px)**

### Already in (new behaviour)

- The roster's `ignoreRepeatMinutes` (1, 3, 5 or 10; already sent by the server, today ignored by `parseRoster`) is kept with the roster; default 3 when missing.
- The same rule as the app's `dropRepeats` (`packages/core/src/status.ts`): a tap within that many minutes of the card's **last counted** tap is a repeat; a repeat doesn't move the window. With 3 minutes and taps 2 minutes apart, the taps at 0 and 4 minutes count and the one at 2 is "Already in", exactly as the teacher's records will show. Measured by uptime, so it works without a set clock. **(builder's call, proposed)**
- A repeat shows "Already in" instead of a flash. **The tap is still saved and uploaded as today** (the app drops it by the same rule), so nothing changes in the records. **(builder's call, proposed)**
- The existing 3-second debounce (one physical tap read several times) stays as it is.

### Start-up

- `setup()` blocks while it starts each part, so start-up isn't animated from the loop. The mark's draw-in and the name's wipe play first (about 1 s of frames drawn directly in `setup()`, before the slow steps), then the progress bar moves one step after each real start-up stage: screen and clock, card reader, tap log (the long one, about 4 s), class list, Wi-Fi started. The idle screen follows. No tap can happen during start-up (the card reader isn't polled yet), as today. **(builder's call, proposed)**

### Bright and dim

- **Bright** from 30 minutes before each of today's tap windows opens until 60 minutes after it closes; **dim** the rest of the time, including mid-morning between windows. A reader with no windows or no set clock stays bright. **(builder's call, proposed)** The reader doesn't know weekends or holidays (the class list has no day type), so on those days it is bright only around the usual tap times; the one-pixel drift protects it the rest of the time. Sending "school day or not" with the class list is a later change.
- Bright: contrast 255 and the SSD1306 pre-charge and VCOM at their brightest. Dim ("After hours" board): lowest contrast, no status bar, larger drift. A tap while dim behaves normally and keeps the screen bright for 10 s.

### How long problem screens stay

- **Storage error at start-up** (the tap log can't open): stays until the reader restarts; taps aren't read. **(builder's call, proposed)**
- **Storage error on one tap** (a single write failed): shown as that tap's result for 2.5 s, then the normal idle screen returns and the next tap tries again. **(builder's call, proposed)**
- **Reader full:** shown as the tap's result when a tap is refused, and as the idle screen while the log is full; it clears by itself as soon as an upload frees space. **(builder's call, proposed)**

### Setup screen

- Shown when the reader has no saved Wi-Fi (setup mode), instead of idle. The QR code encodes the hotspot as an open network (`WIFI:T:nopass;S:<hotspot name>;;`), drawn 2 pixels per module on a lit square, with the hotspot name and "192.168.4.1" beside it.
- Library: the Arduino "QRCode" library (ricmoo), added to `lib_deps` with a pinned version. **(builder's call, proposed)**
- When Wi-Fi is set but unreachable and the hotspot has come on as a fallback (after 30 s), the normal idle screen shows: the hotspot icon in the status bar, and this still counts as the **No Wi-Fi** problem, so the button rolls "NO WI-FI · TAPS KEPT" for as long as taps can't upload. **(builder's call, proposed)**

### Problems

- Taps still work: No Wi-Fi (including the hotspot fallback), Clock not set, Key not accepted keep the idle screen; the button rolls between "TAP YOUR CARD" and the problem every 3 s. With several at once, the most urgent shows: Key not accepted, then Clock not set, then No Wi-Fi.
- Taps stop: Reader full (after a refused tap, and as the idle screen while full) and Storage error take over the screen as drawn.

### Fonts

- Clock digits: a U8g2 "logisoso" numeric face 26–28 px tall; names: U8g2 helvB (about 18 px, 12 px for long names); small labels: a 5 × 8 capitals face with the middle dot "·"; icons: 9 × 9 bitmaps copied from the boards. **(builder's call, proposed, within: everything fits the boards' positions)**

## 6. Left to the builder

- Exact pixel positions (from the boards), font picks within the rules above, frame counts per movement (5–8 frames each at up to 25 fps), and the module layout inside `screen` / `display`.
- How the status snapshot is gathered each loop (it must not hold `logMutex` while drawing).
- Tests: the screen logic's scene and phase at given times (tap timeline, cut-in by a new tap, return to idle), the status-bar slot and Wi-Fi bar rules, the after-hours window, Already in by uptime and the roster's repeat minutes, name sizing and truncation, and every label fitting the band. On the reader: tap feedback time still under 500 ms (the serial line `ms to feedback`), and each screen checked against the boards.
