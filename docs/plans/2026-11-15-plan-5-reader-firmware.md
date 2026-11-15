# Klasilid Plan 5: Door reader firmware

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Firmware for the ESP32 door reader that records every card tap, works with no network, uploads taps to the server, and gives the teacher a setup page. Also the server pieces it needs: a reader roster endpoint and a script that creates a reader's credentials.

**Architecture:**
- **Firmware:** a PlatformIO project in `firmware/` (Arduino framework).
- **Pure logic in `firmware/lib/core`:** tap log, debounce, time formatting, upload body and ack parsing, and on-screen status. It has no hardware calls, so its Unity tests run on the board itself.
- **Hardware and network code in `firmware/src`:** RC522, OLED, DS3231, buzzer, Wi-Fi, setup page, local API, uploader task.
- **Server additions:** a Deno function `roster` beside plan 1's `tap`, and a Node script `scripts/new-reader.mjs`, both tested with Vitest here.

**Tech Stack:**
- PlatformIO Core (installed with `python -m pip install --user platformio`), espressif32 platform, Arduino framework.
- Libraries: `miguelbalboa/MFRC522@^1.4.11`, `olikraus/U8g2@^2.35.19`, `adafruit/RTClib@^2.1.4`, `bblanchon/ArduinoJson@^7.2.1`.
- Unity for firmware tests; Vitest for the server pieces.

**Spec:** `docs/2026-11-15-klasilid-design.md` §8 (reader), §9 (offline), §6, §11. Also read plan 1's tap contract in `supabase/functions/tap/handler.ts`.

**Hardware (no soldering, owner decision):**
- ESP32 DevKit 30-pin, Type C;
- RC522, the pre-soldered variant;
- 0.96″ I2C OLED (SSD1306);
- DS3231 "Blue" (ZS-042);
- active buzzer module;
- female-to-female jumper wires;
- USB power from a power bank with pass-through charging;
- clear-cover junction box.

## Testing constraint (read first)

This PC has no host C++ compiler. Firmware tests are Unity tests that run **on the ESP32** (`pio test -e esp32dev`), so they need the board.

Until it arrives:
- every firmware task's RED/GREEN steps are replaced by `pio test -e esp32dev --without-uploading --without-testing`, which compiles the tests;
- the tests are written in full now and run on the board in Task 7's bring-up.

Server tasks (Task 1) follow normal TDD here.

## Global Constraints

- **Recording:** the reader always records, with no network needed. Every tap is appended to a flash log before any feedback. (spec §8)
- **Tap feedback** on the OLED and buzzer within 0.5 s. Network calls never block tap handling: uploads run in their own FreeRTOS task. (spec §8)
- **Tap ID:** the reader sends `seq` (survives reboots). The server builds `deviceId-seq-tappedAtMillis`. (plan 1 + review fix)
- **Upload contract (plan 1):**
  - `POST <server>/functions/v1/tap`, header `x-device-key`;
  - body `{deviceId, taps:[{seq, cardUid, tappedAt, clockSyncedAt}]}` with times as ISO 8601 ending in `Z`;
  - response `{acked:[seq], rejected:[seq]}`. Both lists leave the queue; `rejected` means the card UID was unreadable.
  - At most 500 taps per request; the reader sends 100.
- **Clock:** DS3231 is the time source, resynced from NTP whenever online.
  - Each tap stores the last-sync time; `clockSyncedAt` is `null` if the clock was never synced.
  - A clock before 2026-01-01 counts as "not set". (spec §8)
- **Network:** join the configured Wi-Fi. If it fails for 30 s, also run the hotspot **"Klasilid-Diamond"** (AP+STA), and keep retrying the Wi-Fi. (spec §8, owner decision: Wi-Fi, not Bluetooth)
- **Local API** requires header `x-pairing-token`. Keys and tokens are stored only in ESP32 NVS (Preferences), never in source code. (spec §8, §11)
- **Capacity:** at least 30 school days × 50 learners × 4 taps = 6,000 taps; use 8,192 records. Never overwrite an unsent tap. (spec §8)
- **Learner names on the screen:** short form ("Ana A."), from the class's own roster. (spec §11)
- **Inputs on the setup page** are dropdowns where there's a choice (Wi-Fi network from a scan); free text only for the password and credentials. (owner rule)

## Review Focus

1. **Power cut during a flash write.** On reboot the log keeps every complete tap; a torn last record is ignored, not read as garbage. Test in Task 3.
2. **Weeks offline until the log is full of unsent taps.** Unsent taps are never overwritten; the screen says "Reader full — connect to Wi-Fi" with the error beep. Test in Task 3.
3. **The server acks only some taps, or acks the same tap twice.** Exactly the acked and rejected seqs leave the queue; repeated acks are harmless. Test in Task 4.
4. **The RC522 reads the same card several times in one tap.** One tap is recorded. Test in Task 2.
5. **The RTC lost power (year 2000).** Taps are still recorded and uploaded with `clockSyncedAt: null`, and the screen shows "Clock not set". Test in Tasks 2 and 4.

---

## File structure

```
supabase/functions/roster/handler.ts   GET roster for a reader (pure, tested)
supabase/functions/roster/index.ts     Deno wrapper (service role)
supabase/tests/roster-handler.test.ts
scripts/new-reader.mjs                 makes deviceId/key/pairing token + the SQL to register the reader
scripts/new-reader.test.mjs            (vitest)
firmware/
  platformio.ini
  partitions.csv                       app 1.5 MB, LittleFS ~2.3 MB
  lib/core/src/timefmt.h/.cpp          isoUtc(), clockLooksValid(), manilaMinute()
  lib/core/src/debounce.h/.cpp         Debounce
  lib/core/src/roster.h/.cpp           Window, statusFor(), shortName lookup
  lib/core/src/taplog.h/.cpp           TapLog over a Storage interface; MemoryStorage for tests
  lib/core/src/upload.h/.cpp           buildBody(), parseAck()
  src/main.cpp                         setup/loop: read card → log → feedback
  src/hw/pins.h                        pin map (one place)
  src/hw/rfid.cpp  display.cpp  buzzer.cpp  clock.cpp
  src/net/config.cpp  wifi.cpp  web.cpp  uploader.cpp  rosterfetch.cpp
  src/store/littlefs_storage.cpp       LittleFS-backed Storage
  test/test_core/test_main.cpp         Unity tests for lib/core
docs/reader/wiring.md                  wiring table + SVG diagram (for the owner)
docs/reader/bring-up.md                step-by-step first power-on and on-board test run
```

---

### Task 1: Server pieces: reader roster endpoint and reader credentials script

**Files:**
- Create: `supabase/functions/roster/handler.ts`, `supabase/functions/roster/index.ts`, `supabase/tests/roster-handler.test.ts`, `scripts/new-reader.mjs`, `scripts/new-reader.test.mjs`
- Modify: root `vitest.config.ts` (the node project includes `scripts/**/*.test.mjs`)

**Interfaces:**
- Produces:
  - **Roster request:** `GET /functions/v1/roster?deviceId=KD-0001`, header `x-device-key`.
  - **Responses:**
    - `200 {"cards":[{"uid":"04A1B2C3","name":"Ana A."}],"windows":[{"session":"am","kind":"in","opens":390,"lateAfter":435,"closes":480}],"ignoreRepeatMinutes":3}`;
    - `401` for an unknown device or wrong key.
  - **What's included:** only active cards of learners enrolled in the device's class today (Manila). `name` is first name plus last initial. `windows` are the ones in effect today.
  - Signatures:
    - `export interface RosterDeps { findDevice(id): Promise<{ keyHash: string; classId: string } | null>; activeCards(classId: string, today: string): Promise<{ uid: string; firstName: string; lastName: string }[]>; windows(classId: string): Promise<TapWindowRow[]>; ignoreRepeat(classId: string): Promise<number>; now(): Date }`
    - `export async function handleRoster(headers: Headers, url: URL, deps: RosterDeps): Promise<{ status: number; body: unknown }>`
    - It reuses `sha256Hex` and the constant-time comparison from `../tap/handler.ts`, exporting `sameHash` from there.
  - **`scripts/new-reader.mjs <class-uuid> [--id KD-0002]`** prints:
    - the device id;
    - a 32-byte random key (base64url);
    - an 8-digit pairing token;
    - one SQL statement `insert into devices(id, class_id, key_hash, pairing_token_hash) values (...)` with sha256 hex hashes.
    - The plain key and token appear only in the printed "type these into the reader's setup page" block, never in the SQL.
    - Exported for tests: `export function makeReader(classId, id?): Promise<{ id, key, token, sql }>`.

- [ ] **Step 1: Write the failing tests.**

```ts
// roster-handler.test.ts
it('returns short names for active cards of enrolled learners and today’s windows', ...)  // name 'Ana A.'
it('wrong key or unknown device → 401', ...)
it('missing deviceId → 400', ...)
// new-reader.test.mjs
it('makes a KD-#### id, a 43-char base64url key and an 8-digit token', ...)
it('the SQL holds sha256 hashes and never the plain key or token', ...)
it('the key hash matches sha256Hex(key) so the tap endpoint accepts it', ...)
```

- [ ] **Step 2: Run `npx.cmd vitest run supabase/tests/roster-handler.test.ts scripts`.** Expected: FAIL.
- [ ] **Step 3: Implement** the handler, the Deno wrapper (supabase-js with the service role; deploy with `--no-verify-jwt` like `tap`), and the script (`node:crypto` `randomBytes`/`createHash`).
- [ ] **Step 4: Run `npx.cmd vitest run`.** Expected: all pass.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: reader roster endpoint and credentials script"`

---

### Task 2: Firmware project and small core pieces (time, debounce, on-screen status)

**Files:**
- Create: `firmware/platformio.ini`, `firmware/partitions.csv`, `firmware/lib/core/src/timefmt.*`, `debounce.*`, `roster.*`, `firmware/src/main.cpp` (stub that prints "Klasilid reader" on serial), `firmware/test/test_core/test_main.cpp`, `firmware/.gitignore` (`.pio/`)

**Interfaces:**
- Produces, in `lib/core`:

```cpp
// timefmt.h
constexpr uint32_t KL_EARLIEST = 1767225600;            // 2026-01-01T00:00:00Z
void isoUtc(uint32_t unix, char out[21]);                // "2026-11-12T23:10:02Z"
bool clockLooksValid(uint32_t unix);                     // unix >= KL_EARLIEST
uint16_t manilaMinute(uint32_t unix);                    // ((unix + 8*3600) % 86400) / 60
// debounce.h
class Debounce { public: explicit Debounce(uint32_t seconds = 3); bool accept(const char* uid, uint32_t unix); };   // same uid within `seconds` → false
// roster.h
struct Window { char session; char kind; uint16_t opens, lateAfter /*0xFFFF = none*/, closes; };   // session 'a'/'p', kind 'i'/'o'
const char* statusFor(uint16_t minute, const Window* w, size_t n);   // inside an in-window: "On time" (<= lateAfter) / "Late"; else "Recorded"
```

  - `platformio.ini`:
    - `[env:esp32dev]` with `platform = espressif32`, `board = esp32dev`, `framework = arduino`;
    - `board_build.filesystem = littlefs`, `board_build.partitions = partitions.csv`;
    - `monitor_speed = 115200`, `test_framework = unity`;
    - `lib_deps` as in the Tech Stack.

- [ ] **Step 1: Install PlatformIO** with `python -m pip install --user platformio`. Then run `python -m platformio --version`. Expected: it prints a version. Use `python -m platformio` wherever this plan says `pio`.
- [ ] **Step 2: Write the Unity tests** in `test/test_core/test_main.cpp`.

```cpp
void test_iso_utc() { char b[21]; isoUtc(1794525002, b); TEST_ASSERT_EQUAL_STRING("2026-11-12T23:10:02Z", b); }
void test_clock_valid() { TEST_ASSERT_FALSE(clockLooksValid(946684805)); TEST_ASSERT_TRUE(clockLooksValid(KL_EARLIEST)); }   // Review Focus 5
void test_manila_minute() { TEST_ASSERT_EQUAL_UINT16(7*60+10, manilaMinute(1794525002)); }
void test_debounce_same_card_once() { Debounce d(3); TEST_ASSERT_TRUE(d.accept("AB", 100)); TEST_ASSERT_FALSE(d.accept("AB", 101)); TEST_ASSERT_TRUE(d.accept("CD", 101)); TEST_ASSERT_TRUE(d.accept("AB", 104)); }  // Review Focus 4
void test_status_for() { Window w[] = {{'a','i',390,435,480}}; TEST_ASSERT_EQUAL_STRING("On time", statusFor(435, w, 1)); TEST_ASSERT_EQUAL_STRING("Late", statusFor(436, w, 1)); TEST_ASSERT_EQUAL_STRING("Recorded", statusFor(600, w, 1)); }
```

- [ ] **Step 3: Compile the tests** with `pio test -e esp32dev --without-uploading --without-testing` (in `firmware/`). Expected: compile errors, because the functions don't exist yet. This stands in for RED.
- [ ] **Step 4: Implement** the three modules.
- [ ] **Step 5: Run `pio test -e esp32dev --without-uploading --without-testing` and `pio run`.** Expected: both build. GREEN happens on the board in Task 7.
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat(firmware): project, time, debounce and status helpers"`

---

### Task 3: Tap log

**Files:**
- Create: `firmware/lib/core/src/taplog.h/.cpp`, `firmware/src/store/littlefs_storage.cpp`
- Modify: `firmware/test/test_core/test_main.cpp`

**Interfaces:**
- Produces:

```cpp
struct TapRec { uint32_t seq; uint32_t unix; uint32_t syncedUnix /*0 = never*/; char uid[21]; uint8_t sent; uint8_t crc; };   // fixed 36 bytes
class Storage { public: virtual bool read(uint32_t slot, TapRec& r) = 0; virtual bool write(uint32_t slot, const TapRec& r) = 0;
                virtual bool loadMeta(uint32_t& nextSeq) = 0; virtual bool saveMeta(uint32_t nextSeq) = 0; virtual ~Storage() = default; };
class MemoryStorage : public Storage { /* fixed array, for tests; can simulate a torn write */ };
class TapLog {
 public:
  TapLog(Storage& s, uint32_t capacity = 8192);
  bool begin();                                            // rebuild state from storage; records with bad crc are empty slots
  enum class Add { Ok, Full };
  Add add(const char* uid, uint32_t unix, uint32_t syncedUnix, uint32_t& seqOut);   // writes the record, then meta; Full = every slot holds an unsent tap
  size_t unsent(TapRec* out, size_t max);                  // oldest first
  void markSent(const uint32_t* seqs, size_t n);           // unknown seqs ignored; repeating is harmless
  size_t unsentCount() const;
  uint32_t nextSeq() const;
};
```

  - **Slot choice:** a ring; the next slot is `seq % capacity`. If that slot holds an unsent record, the log is `Full`.
  - **CRC:** a CRC-8 over every byte before `crc`.
  - **Seq after power loss:** `nextSeq` restored on `begin()` is `max(meta.nextSeq, highest valid seq + 1)`, so a lost meta write never reuses a seq.

- [ ] **Step 1: Write the Unity tests.**

```cpp
void test_add_then_unsent_oldest_first()
void test_mark_sent_removes_exactly_those_and_repeats_are_harmless()
void test_seq_survives_reboot()                              // new TapLog on the same MemoryStorage continues the sequence
void test_torn_last_write_is_ignored_and_seq_not_reused()   // Review Focus 1: corrupt the last record's crc
void test_full_when_every_slot_is_unsent_and_sent_slots_are_reused()   // Review Focus 2: capacity 4
```

- [ ] **Step 2: Compile the tests.** Expected: errors.
- [ ] **Step 3: Implement** `TapLog`, `MemoryStorage`, and `LittleFsStorage`. The LittleFS storage uses a preallocated file `/taps.bin` of `capacity * 36` bytes plus `/meta.bin`, with an `fflush` after each write.
- [ ] **Step 4: Run** `pio test -e esp32dev --without-uploading --without-testing` and `pio run`. Expected: both build.
- [ ] **Step 5: Commit.** `git commit -am "feat(firmware): crash-safe tap log"` (add the new files first).

---

### Task 4: Upload body and ack parsing

**Files:**
- Create: `firmware/lib/core/src/upload.h/.cpp`
- Modify: `test_main.cpp`

**Interfaces:**
- Produces:

```cpp
size_t buildBody(const char* deviceId, const TapRec* recs, size_t n, char* out, size_t cap);   // JSON per the plan-1 contract; returns length or 0 if it doesn't fit
size_t parseAck(const char* json, uint32_t* seqsOut, size_t max);                              // acked ∪ rejected; 0 on malformed JSON
```

  - `buildBody` uses ArduinoJson. `clockSyncedAt` is `null` when `syncedUnix == 0`, otherwise `isoUtc(syncedUnix)`. `tappedAt` is `isoUtc(unix)` even when the clock looks invalid, because the server flags it.

- [ ] **Step 1: Write the Unity tests.**

```cpp
void test_body_matches_contract()              // {"deviceId":"KD-0001","taps":[{"seq":41,"cardUid":"04A1B2C3","tappedAt":"2026-11-12T23:10:02Z","clockSyncedAt":"2026-11-12T21:00:00Z"}]}
void test_never_synced_clock_sends_null()      // Review Focus 5
void test_parse_ack_unions_acked_and_rejected()   // {"acked":[1,2],"rejected":[3]} → 1,2,3
void test_parse_ack_bad_json_returns_zero()
void test_partial_ack_leaves_the_rest_queued() // Review Focus 3: TapLog + parseAck together; ack 1 of 3 → unsentCount 2; same ack again → still 2
```

- [ ] **Step 2: Compile the tests.** Expected: errors.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Compile the tests and run `pio run`.** Expected: both build.
- [ ] **Step 5: Commit.** `git commit -am "feat(firmware): upload body and ack parsing"` (add the new files first).

---

### Task 5: Hardware: card reader, clock, screen, buzzer, tap handling

**Files:**
- Create: `firmware/src/hw/pins.h`, `rfid.cpp`, `display.cpp`, `buzzer.cpp`, `clock.cpp` (with headers)
- Modify: `firmware/src/main.cpp`

**Interfaces:**
- **Pins** (`pins.h`, the only place pins are named):
  - RC522: SS 5, SCK 18, MOSI 23, MISO 19, RST 27, powered from 3V3.
  - I2C (OLED and DS3231 share the bus): SDA 21, SCL 22, both at 3V3.
  - Buzzer: signal on 25, VCC on VIN (5 V).
  - `constexpr bool BUZZER_ACTIVE_LOW = false;`, flipped at bring-up if the buzzer beeps all the time.
- **Functions:**
  - `rfid::begin()` and `bool rfid::poll(char uid[21])`: uppercase hex UID, no separators.
  - `clock::begin()`, `uint32_t clock::now()` (DS3231 unix), `void clock::set(uint32_t)`, `uint32_t clock::lastSync()` (stored in NVS key `lastSync`).
  - `display::idle(timeText, wifiState, unsent)`, `display::tap(name, status, timeText)` (shown 2.5 s), `display::message(line1, line2)`.
  - `buzzer::ok()` (one 80 ms beep), `buzzer::unknown()` (two 80 ms beeps), `buzzer::error()` (one 600 ms beep).
- **Tap flow in `loop()`:**
  1. Poll the card reader.
  2. Debounce.
  3. `TapLog::add(uid, clock::now(), clock::lastSync())`.
     - If the log is full: `display::message("Reader full", "Connect to Wi-Fi")` and the error beep.
  4. Look the UID up in the cached roster:
     - found: show the name and `statusFor(manilaMinute(now), windows)`, then the ok beep;
     - not found: "Card not registered", then the unknown beep.
  5. If `!clockLooksValid(now)`, the status line reads "Clock not set".
- Feedback must happen within 0.5 s of the read.

- [ ] **Step 1: Implement.** Log the time from read to beep on serial so bring-up can measure it.
- [ ] **Step 2: Run `pio run`.** Expected: it builds.
- [ ] **Step 3: Commit.** `git commit -am "feat(firmware): card reader, clock, screen, buzzer and tap flow"` (add the new files first).

---

### Task 6: Network: Wi-Fi, setup page, local API, uploader, roster cache

**Files:**
- Create: `firmware/src/net/config.cpp`, `wifi.cpp`, `web.cpp`, `uploader.cpp`, `rosterfetch.cpp` (with headers)
- Modify: `firmware/src/main.cpp`

**Interfaces:**
- **Config** (NVS namespace `kl`): `ssid`, `pass`, `server` (e.g. `https://xyz.supabase.co`), `deviceId`, `deviceKey`, `pairToken`, `apName` (default `Klasilid-Diamond`).
- **Wi-Fi:**
  - Start in STA mode with the saved network.
  - After 30 s without a connection, switch to AP+STA with the hotspot `apName` at 192.168.4.1, open, so the teacher can reach the setup page.
  - Keep retrying STA every 60 s.
  - On connect, sync NTP (`pool.ntp.org`, `time.google.com`). If the year is at least 2026, run `clock::set` and save `lastSync`.
- **Web server** (`WebServer`, port 80):
  - `GET /` serves the setup page: plain HTML styled in the Klasilid orange.
    - Fields: "Wi-Fi network" (a `<select>` from `WiFi.scanNetworks()` plus an "Other…" option that reveals a text box), Password, Server address, Reader ID, Reader key, Pairing code.
    - If a pairing code is already set, the page asks for it before showing or saving anything.
  - `POST /setup` saves, shows "Saved. The reader restarts…", and restarts.
  - `GET /status` (header `x-pairing-token`) returns `{deviceId, firmware, time, clockOk, lastSync, unsent, lastUploadAt, wifi:{ssid, rssi, mode}}`.
  - `GET /taps?since=<seq>` (header `x-pairing-token`) returns `{taps:[{seq, cardUid, tappedAt, clockSyncedAt}]}` with taps whose seq is above `since`, at most 200. This is for plan 6's local relay.
  - A wrong or missing token gets `401`.
- **Uploader:** a FreeRTOS task pinned to core 0.
  - Every 10 s, or right after a tap, while online: take `unsent(100)`, then `buildBody`, then `POST <server>/functions/v1/tap` with `x-device-key` and a 10 s timeout.
  - On 200: `parseAck`, then `markSent`.
  - On a network error or 5xx: back off 10 s, 30 s, 60 s, up to 5 min.
  - On 401: show "Reader key not accepted" on the idle screen and retry every 5 min.
  - It reads the log through a mutex shared with the tap flow.
- **Roster cache:**
  - On connect and every 10 min, `GET <server>/functions/v1/roster?deviceId=…`.
  - Save the response body to `/roster.json` on LittleFS and parse it into a UID → name map plus `Window[]`.
  - Load it from LittleFS at boot, so names show offline.

- [ ] **Step 1: Implement.**
- [ ] **Step 2: Run `pio run`.** Expected: it builds, and the flash use report shows the app under the 1.5 MB partition.
- [ ] **Step 3: Commit.** `git commit -am "feat(firmware): Wi-Fi, setup page, local API, uploader and roster cache"` (add the new files first).

---

### Task 7: Wiring guide, bring-up checklist, spec update

**Files:**
- Create: `docs/reader/wiring.md` (a pin table plus an inline SVG wiring diagram), `docs/reader/bring-up.md`
- Modify: `docs/2026-11-15-klasilid-design.md` §8 (see the bullets below), `docs/plans/backlog.md`

**What the documents contain:**
- **`wiring.md`**, written for the owner in plain language:
  - one row per jumper wire: from (ESP32 pin label printed on the board) to (part, pin label);
  - the 3.3 V-only warning for the RC522;
  - the buzzer on VIN;
  - how to tape the parts inside the clear-cover box, with the RC522 under the tap zone and the OLED behind the cover.
- **`bring-up.md`**, the first time the parts arrive:
  1. Install the CH340 driver if Windows doesn't see the board.
  2. `pio run -t upload`.
  3. `pio device monitor` shows "Klasilid reader".
  4. **Run the firmware tests on the board:** `pio test -e esp32dev`. Expected: all Unity tests pass. This is the GREEN run that Tasks 2–4 deferred; record the output in the ledger.
  5. **Check each part:** tap the test card (beep and screen), unplug the USB to check the DS3231 keeps time, and flip `BUZZER_ACTIVE_LOW` if needed.
  6. Run `node scripts/new-reader.mjs <class id>`, run the SQL in Supabase, then join the "Klasilid-Diamond" hotspot and fill in the setup page.
  7. Tap a card and see it appear in the app after the next sync.
  8. Measure tap-to-beep time on serial; it should be under 500 ms.
- **Spec §8 update:**
  - The roster is pulled from the server (`roster` function) and cached on the reader, instead of pushed by the app.
  - There is no separate "register mode": registration uses ordinary taps of unregistered cards (plan 2b).
  - The setup page is protected by the pairing code once one is set.

- [ ] **Step 1: Write both documents and the spec changes.**
- [ ] **Step 2: Run `npx.cmd vitest run` and `pio run`.** Expected: unchanged results.
- [ ] **Step 3: Commit.** `git commit -am "docs: reader wiring guide, bring-up checklist, spec §8 update"` (add the new files first).

---

## After this plan

- **Plan 6:** Windows/Android packaging with Tauri. The app reads `GET /taps` over local Wi-Fi when there's no internet, and relays those taps to the server.
- **Before the pilot:** an over-the-air firmware update. Until then, updates are done by USB.
