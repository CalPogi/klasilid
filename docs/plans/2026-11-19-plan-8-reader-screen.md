# Plan 8: Door reader screen (animated OLED UI) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The reader's OLED shows the approved screens (status bar, start-up, idle, dim, setup, tap results, problems) with their animations, and a tap still gets its beep and first flash frame within 500 ms.

**Architecture:** Pure screen logic in `firmware/lib/core/src/screen.{h,cpp}` decides the scene, animation phase and progress from the time, a status snapshot and tap events (tested on the board with Unity). `firmware/src/hw/display.cpp` draws a frame with U8g2 from that decision plus the texts. `main.cpp` feeds taps and status in and draws a frame from `loop()` whenever one is due (approach A: frames from the main loop).

**Tech Stack:** ESP32 Arduino core 2.0.17 (espressif32@6.9.0), PlatformIO, U8g2 (full buffer, `_2ND_HW_I2C` on Wire1), Unity on-board tests, ricmoo QRCode library.

**Spec:** `docs/2026-11-19-reader-screen-design.md` (approved 2026-11-19). Approved boards: canvas https://claude.ai/artifact/LQUuLx898BG7FU4tqW7bvq, section "Door reader screen" (boards ReaderCalm, ReaderTaps, ReaderProblems). Looks follow the boards; behaviour follows the design doc.

## Global Constraints

- Tap path: card → save → beep → first flash frame within 500 ms (serial line `tap … ms to feedback`); a frame may delay a card read by at most one frame (about 33 ms).
- Frames only from `loop()` (core 1), at most one every 40 ms (25 fps); static screens redraw once a second. Exception: start-up frames are drawn directly in `setup()` (design §Start-up).
- Rows 0–15 hold only the status bar or full-screen flashes (two-tone panels are yellow there).
- Never hold `logMutex` while drawing.
- Tap judging, saving and uploading are unchanged; "Already in" taps are still saved and uploaded.
- Timeline (ms from the tap): Grow 0–200, Fold 200–450, Rise 450–700, Hold 700–2500, Leave 2500–2800. Already in: Rise 0–300, Hold 300–1500, Leave 1500–1800. Reader full / Storage error on a tap: shown 0–2500, no flash.
- Bright from 30 min before each of today's tap windows opens until 60 min after it closes; otherwise dim; no windows or no valid clock = bright; a tap keeps it bright for 10 s.
- Wi-Fi bars: RSSI ≥ −60 dBm → 3, ≥ −72 → 2, else 1; hotspot icon when only the hotspot is on; No Wi-Fi otherwise.
- Problem order (idle button roll): Key not accepted > Clock not set > No Wi-Fi (hotspot fallback counts as No Wi-Fi).
- Band texts exactly: `ON TIME · 7:12`, `LATE · 7:41`, `RECORDED · 3:05 PM`, `SHOW YOUR ADVISER`, `ALREADY IN · 7:12`, `SAVED · CHECK THE TIME`, `CONNECT TO WI-FI`, `RESTART THE READER`. Idle button: `TAP YOUR CARD`, problems `NO WI-FI · TAPS KEPT`, `CLOCK NOT SET`, `KEY NOT ACCEPTED`.
- Names: ≤ 10 characters big face; 11–18 small face; > 18 cut to 15 characters + `...`. Characters are counted as UTF-8 code points.
- No real learner names in tests (use made-up ones).

## Review Focus

1. **A tap during any animation** (mid-Leave, mid digit roll, mid message roll): its own sequence starts at once from Grow. Pinned in Task 3 (`a new tap cuts in from any phase`).
2. **A queue at the door** (a card every second for 10 s): every tap gets its own result and feedback stays under 500 ms. Pinned in Task 5 (on-board timing over 10 quick taps).
3. **Clock not set:** Already in still works (uptime), the band says `SAVED · CHECK THE TIME`, the date shows `-- --- ---`, the screen stays bright. Pinned in Tasks 2 and 3.
4. **Names with ñ or long names** ("Peña", "Maria Concepcion S."): counted by characters, drawn with the UTF-8 font, never overflowing. Pinned in Task 2 (`name faces count characters, not bytes`).
5. **Uptime wrap** (`millis()` passes 2³² after 49 days): phases and frame timing still correct. Pinned in Task 3 (`timing survives millis wrap`).

---

### Task 1: The class list keeps its repeat minutes

**Files:**
- Modify: `firmware/lib/core/src/roster.h`, `firmware/lib/core/src/roster.cpp`, `firmware/src/rostercache.{h,cpp}`, `firmware/src/net/rosterfetch.cpp`
- Test: `firmware/test/test_core/test_main.cpp`

**Interfaces:**
- Produces: `bool parseRoster(const char* json, Card* cards, size_t maxCards, size_t& nCards, Window* windows, size_t maxWindows, size_t& nWindows, uint16_t& repeatMinutes)` — `repeatMinutes` = `ignoreRepeatMinutes` when it is 1, 3, 5 or 10, else 3. `rostercache::set(..., uint16_t repeatMinutes)` and `uint16_t rostercache::repeatMinutes()` (3 before any roster).

- [ ] **Step 1: Write the failing tests** — extend `test_parse_roster_maps_names_and_windows` to assert `repeatMinutes == 3` for the existing JSON, and add `test_parse_roster_repeat_minutes`: JSON with `"ignoreRepeatMinutes":10` → 10; `7` → 3; missing → 3.
- [ ] **Step 2: Run to verify they fail** — `cd firmware && python -m platformio test -e esp32dev -f test_core --upload-port COM5 --test-port COM5`; Expected: build error (parseRoster has no 8th parameter).
- [ ] **Step 3: Implement** the parameter, the cache field and accessor, and pass it from `rosterfetch.cpp`.
- [ ] **Step 4: Run to verify they pass** — same command; Expected: `… Tests 0 Failures 0 Ignored`.
- [ ] **Step 5: Commit** — `git commit -m "feat(firmware): keep the class's repeat minutes from the roster"`

### Task 2: Screen helpers

**Files:**
- Create: `firmware/lib/core/src/screen.h`, `firmware/lib/core/src/screen.cpp`
- Modify: `firmware/lib/core/src/messages.h` (the new texts as `KL_MSG_*` defines)
- Test: `firmware/test/test_core/test_main.cpp`

**Interfaces:**
- Consumes: `Window`, `KL_NO_LATE` (roster.h), `manilaMinute`, `clockLooksValid` (timefmt.h).
- Produces (all in `screen.h`):
  - `enum class Wifi : uint8_t { Strong, Fair, Weak, Hotspot, None };` and `Wifi wifiFrom(bool online, bool hotspot, int rssi)`
  - `enum class Problem : uint8_t { None, NoWifi, Clock, Key };` and `Problem topProblem(bool keyRejected, bool clockValid, bool online)`
  - `bool isBright(bool clockValid, uint16_t minute, const Window* w, size_t n)`
  - `class RepeatGuard { public: bool isRepeat(const char* uid, uint32_t uptimeSec, uint16_t repeatMinutes); };` (32 cards remembered; a repeat does not move the card's last counted time)
  - `enum class Result : uint8_t { OnTime, Late, Recorded, Unknown, AlreadyIn, ClockNotSet, Full, StorageError };`
  - `void bandText(Result r, uint16_t minute, char out[28])` — the exact texts of Global Constraints; `minute` is Manila minutes; 12-hour clock with no leading zero.
  - `enum class NameFace : uint8_t { Big, Small };` and `NameFace fitName(const char* name, char* out, size_t cap)`
  - `void dateText(uint32_t unix, bool clockValid, char out[12])` — `THU 19 NOV` (Manila date) or `-- --- ---`
  - `const char* problemText(Problem p)` — the idle button texts.

- [ ] **Step 1: Write the failing tests**

```cpp
void test_wifi_bars() {                // -60 → Strong, -61 → Fair, -72 → Fair, -73 → Weak; offline+hotspot → Hotspot; offline → None
void test_top_problem_order() {        // key+clock+offline → Key; clock+offline → Clock; offline → NoWifi; none → None
void test_bright_around_windows() {    // window 06:00–08:00 (360..480): 329 → dim, 330 → bright, 540 → bright, 541 → dim; no windows → bright; clock invalid → bright
void test_repeat_counts_from_last_counted_tap() {  // 3 min: taps at 0, 120, 240 s → false, true, false; another uid at 120 → false
void test_band_texts() {               // OnTime 432 → "ON TIME · 7:12"; Late 461 → "LATE · 7:41"; Recorded 905 → "RECORDED · 3:05 PM"; Recorded 0 → "RECORDED · 12:00 AM"; Unknown → "SHOW YOUR ADVISER"; AlreadyIn 432 → "ALREADY IN · 7:12"; ClockNotSet → "SAVED · CHECK THE TIME"; Full → "CONNECT TO WI-FI"; StorageError → "RESTART THE READER"
void test_name_faces_count_characters_not_bytes() {  // "Ana R." → Big; "Peña A." (7 chars, 8 bytes) → Big; "Maria Concepcion S." (19) → Small "Maria Concepcio..."; "Juan Dela Cruz" (14) → Small, unchanged
void test_date_text() {                // 2026-11-18T16:30:00Z → "THU 19 NOV" (Manila); invalid → "-- --- ---"
void test_every_label_fits_the_band() { // each band and problem text ≤ 24 characters (124 px at 5 px per character)
```

- [ ] **Step 2: Run to verify they fail** — the test_core command; Expected: build error (`screen.h` missing).
- [ ] **Step 3: Implement** `screen.{h,cpp}` (no Arduino or U8g2 includes, so it stays pure) and the new `KL_MSG_*` texts; the middle dot is UTF-8 `"\xC2\xB7"`.
- [ ] **Step 4: Run to verify they pass** — Expected: `0 Failures`.
- [ ] **Step 5: Commit** — `git commit -m "feat(firmware): screen helpers (Wi-Fi bars, problems, brightness, repeats, texts)"`

### Task 3: Screen timeline

**Files:**
- Modify: `firmware/lib/core/src/screen.{h,cpp}`
- Test: `firmware/test/test_core/test_main.cpp`

**Interfaces:**
- Consumes: `Result`, `Problem` (Task 2).
- Produces:
  - `enum class Scene : uint8_t { Idle, Dim, Setup, Tap, Repeat, Blocked };` (`Blocked` = Reader full / Storage error take-over)
  - `enum class Phase : uint8_t { None, Grow, Fold, Rise, Hold, Leave };`
  - `struct Frame { Scene scene; Phase phase; float t; Result result; uint8_t driftX, driftY; float digitRoll; float msgRoll; bool showProblem; };` — `t` and the rolls are 0–1 progress (0 = not rolling).
  - `class Screen { public: void tap(Result r, uint32_t ms); void block(Result r /* Full or StorageError */, uint32_t ms); Frame frame(uint32_t ms, uint16_t minute, bool bright, bool setup, bool full, Problem p); bool due(uint32_t ms) const; void drawn(uint32_t ms); };`
  - Rules: `Tap` for OnTime/Late/Recorded/Unknown/ClockNotSet uses Grow→Fold→Rise→Hold→Leave; `AlreadyIn` → `Scene::Repeat` with Rise→Hold→Leave; `block()` → `Scene::Blocked` for 2500 ms; after Leave → Idle (or Dim when not bright and no tap in the last 10 s; `setup` → Setup; `full` → `Blocked` with `result == Full` until it clears). Idle message roll cycle 6000 ms when `p != None`: tap text 0–2700, roll 2700–3000, problem 3000–5700, roll back 5700–6000. Digit roll 300 ms after the minute changes. Drift steps once a minute through (0,0),(1,0),(1,1),(0,1); Dim uses steps of 3 px. `due()`: true when ≥ 40 ms since the last frame while any phase, roll or drift step is moving, else ≥ 1000 ms. All time comparisons use `int32_t(ms - start)`.

- [ ] **Step 1: Write the failing tests**

```cpp
void test_tap_timeline() {              // tap(OnTime, 1000): 1100 → Tap/Grow t≈0.5; 1300 → Fold; 1500 → Rise; 2000 → Hold; 3600 → Leave; 3900 → Idle
void test_repeat_timeline() {           // tap(AlreadyIn, 0): 100 → Repeat/Rise; 1000 → Hold; 1600 → Leave; 1900 → Idle
void test_a_new_tap_cuts_in_from_any_phase() {  // tap at 0; second tap at 2600 (Leave) → 2650 is Tap/Grow of the new tap
void test_blocked_for_two_and_a_half_seconds() { // block(StorageError, 0): 2400 → Blocked; 2600 → Idle
void test_full_stays_until_space() {    // full=true and no tap → Blocked/Full; a tap still shows its own sequence; full=false → Idle
void test_idle_rolls_the_problem_message() {     // p=NoWifi: 1000 → showProblem false, msgRoll 0; 2850 → msgRoll≈0.5; 4000 → showProblem true; p=None → never
void test_dim_and_wake() {               // bright=false, no tap → Dim; tap at 5000 then 9000 (after Leave) → Idle (still within 10 s); 16000 → Dim
void test_setup_scene() {                // setup=true and no tap → Setup; a tap still shows Tap
void test_frame_rate() {                 // idle without rolls: due false at +500 ms, true at +1000; during Grow: true at +40, false at +20
void test_timing_survives_millis_wrap() { // tap at 0xFFFFFF00: at 0x00000064 (356 ms later) → Fold
```

- [ ] **Step 2: Run to verify they fail** — Expected: build error (`Screen` missing).
- [ ] **Step 3: Implement** `Screen` in `screen.cpp`.
- [ ] **Step 4: Run to verify they pass** — Expected: `0 Failures`.
- [ ] **Step 5: Commit** — `git commit -m "feat(firmware): screen timeline (tap sequence, rolls, drift, dim)"`

### Task 4: Drawing the screens

**Files:**
- Modify: `firmware/src/hw/display.h`, `firmware/src/hw/display.cpp`, `firmware/platformio.ini` (add `ricmoo/QRCode@0.0.1` to `lib_deps`)
- Create: `firmware/src/hw/icons.h` (9 × 9 XBM bitmaps from the boards: Wi-Fi 1–3 bars, no Wi-Fi, hotspot, up arrow, clock warning, key, reader full, card)

**Interfaces:**
- Consumes: `Frame`, `Scene`, `Phase`, `Wifi`, `Problem`, `Result`, `NameFace` (Tasks 2–3).
- Produces in `display.h`:
  - `struct View { Wifi wifi; uint32_t unsent; bool uploading; bool keyRejected; bool clockValid; char date[12]; char clock[6]; /* "7:12" */ bool pm; char name[28]; NameFace face; char band[28]; Problem problem; const char* hotspot; };`
  - `void display::begin();` (also sets pre-charge 0xF1 and VCOM 0x40 via `u8x8_cad_*`/`sendF`), `void display::bright(bool on);` (contrast 255 / 1), `void display::draw(const Frame& f, const View& v);`, `void display::boot(uint8_t step, uint8_t steps, float markT);` (start-up: `markT` 0–1 for the draw-in and wipe, then the bar at `step/steps`).
- Fonts: clock `u8g2_font_logisoso26_tn` (fall back to `logisoso24_tn` if the digits cross row 16), names `u8g2_font_helvB18_tf` / `u8g2_font_helvB12_tf`, labels `u8g2_font_5x8_tf`; text with `drawUTF8`.
- Each scene draws exactly as its board (positions in board pixels: status bar text at y 9, clock baseline 44, button 10.5–117.5 × 50.5–62.5 rounded, band 2–126 × 49–63 rounded r 4, name baseline 38 centred). Grow: lit disc radius 8 → 74 with the result's black icon; Fold: lit rectangle from 0,0,128,64 to 2,49,124,14; Rise: name offset +14 px → 0; Leave: everything up by 64 px while idle comes up from +64; digit roll and message roll clip to their boxes.

- [ ] **Step 1: Build** — `cd firmware && python -m platformio run`; Expected: `SUCCESS`.
- [ ] **Step 2: Check on the reader** with a temporary `firmware/test/test_hw` sketch (deleted before commit) that cycles every scene and phase with made-up texts, 3 s each, while the owner compares the screen with the boards; fix any difference.
- [ ] **Step 3: Commit** — `git commit -m "feat(firmware): draw the approved reader screens"` (without `test/test_hw`).

### Task 5: Wire it into the reader

**Files:**
- Modify: `firmware/src/main.cpp`, `firmware/src/net/wifi.{h,cpp}` (`int wifi::rssi()`, `bool wifi::hotspot()`), `firmware/src/net/uploader.{h,cpp}` (`bool uploader::busy()` true while a POST runs; `bool uploader::keyRejected()`), `firmware/src/hw/buzzer.{h,cpp}` (`void buzzer::tick()`: 15 ms), `docs/reader/bring-up.md` (step 5: what the screen shows)

**Interfaces:**
- Consumes: everything above; `rostercache::repeatMinutes()` (Task 1).
- `handleTap`: keep debounce → save → judge; then `RepeatGuard::isRepeat(uid, millis()/1000, rostercache::repeatMinutes())` picks `AlreadyIn` (only for a known card); beep first (`ok`/`unknown`/`tick`/`error`), then `screen.tap(...)` or `screen.block(...)`, then draw the first frame immediately; the serial `ms to feedback` line is printed after that first frame.
- `loop()`: poll the card reader; build the status snapshot (take `logMutex` only to read `unsentCount()`); `if (screen.due(ms)) { display::bright(...); display::draw(screen.frame(...), view); screen.drawn(ms); }`.
- `setup()`: `display::boot()` frames for the mark (about 1 s) before the slow steps, then one bar step after each of: screen and clock, card reader, tap log, class list, Wi-Fi started. A tap-log open failure latches Storage error (no polling of the card reader) until restart.
- Setup scene when `config::load().ssid` is empty; the QR payload `WIFI:T:nopass;S:<apName>;;`.

- [ ] **Step 1: Build** — `python -m platformio run`; Expected: `SUCCESS`.
- [ ] **Step 2: Run all on-board tests** — `python -m platformio test -e esp32dev -f test_core --upload-port COM5 --test-port COM5`; Expected: `0 Failures`.
- [ ] **Step 3: Upload and measure** — `python -m platformio run -t upload --upload-port COM5`, then 10 quick taps (one per second) with the serial monitor; Expected: every `ms to feedback` under 500 and each tap shows its own result.
- [ ] **Step 4: Check the remaining scenes on the reader** with the owner: start-up, idle digit roll at the minute, No Wi-Fi roll (Wi-Fi off), Card not registered, Already in (same card twice within the repeat time), setup (no Wi-Fi saved).
- [ ] **Step 5: Commit** — `git commit -m "feat(firmware): animated reader screen in the tap flow"`
