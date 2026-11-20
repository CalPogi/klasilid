// Klasilid door reader: read card → write to the flash log → feedback within 0.5 s (spec §8).
// The screen (plan 8): Screen (lib/core) decides what shows; display draws it from loop(), at most every 40 ms.
#include <Arduino.h>
#include <LittleFS.h>
#include <Wire.h>
#include <esp_timer.h>
#include <stdio.h>
#include <string.h>
#include "app.h"
#include "debounce.h"
#include "hw/buzzer.h"
#include "hw/clock.h"
#include "hw/display.h"
#include "hw/pins.h"
#include "hw/rfid.h"
#include "net/config.h"
#include "net/rosterfetch.h"
#include "net/uploader.h"
#include "net/web.h"
#include "net/wifi.h"
#include "messages.h"
#include "roster.h"
#include "rostercache.h"
#include "littlefs_storage.h"
#include "screen.h"
#include "timefmt.h"

static constexpr uint32_t kCapacity = 8192;  // ≥ 30 school days × 50 learners × 4 taps (spec §8)
static LittleFsStorage storage(kCapacity);
TapLog tapLog(storage, kCapacity);
SemaphoreHandle_t logMutex;

static Debounce debounce(3);
static RepeatGuard repeats;
static Screen screen;
static View view{};
static bool setupMode = false;     // no school Wi-Fi saved: the setup screen shows
static bool storageDead = false;   // the tap log couldn't open: Storage error until a restart
static String hotspotName;
// An unknown card while online: the screen says "Checking card" while the class list is fetched again (the teacher
// may be registering it in the app right now). Found: its name and "Card registered". Not by checkUntil: Unknown.
static char checkUid[21] = "";
static uint32_t checkUptime = 0;  // when that card was tapped (seconds since boot)
static uint32_t checkUntil = 0;
static constexpr uint32_t kCheckMs = 20000;

void timeText(uint32_t unix, char out[12]) {
  if (!clockLooksValid(unix)) {
    strcpy(out, "--:--");
    return;
  }
  const uint16_t m = manilaMinute(unix);
  const unsigned h = m / 60 % 12 == 0 ? 12 : m / 60 % 12;
  snprintf(out, 12, "%u:%02u %s", h, static_cast<unsigned>(m % 60), m < 720 ? "AM" : "PM");
}

static void clock12(uint16_t m, char* out, size_t cap) {
  const unsigned h = m / 60 % 12 == 0 ? 12 : m / 60 % 12;
  snprintf(out, cap, "%u:%02u", h, static_cast<unsigned>(m % 60));
}

// Draws the frame that is due now. Status is read fresh; logMutex is held only to count unsent taps.
static void drawNow(uint32_t ms) {
  const uint32_t now = rtc::now();
  const bool valid = clockLooksValid(now);
  const uint16_t minute = valid ? manilaMinute(now) : 0;
  xSemaphoreTake(logMutex, portMAX_DELAY);
  const uint32_t unsent = tapLog.unsentCount();
  xSemaphoreGive(logMutex);
  Window w[8];
  const size_t nw = rostercache::windows(w, 8);

  view.wifi = wifiFrom(wifi::online(), wifi::hotspot(), wifi::rssi());
  view.unsent = unsent;
  view.uploading = uploader::busy();
  view.keyRejected = uploader::rejected();
  view.clockValid = valid;
  dateText(now, valid, view.date);
  clock12(minute, view.clock, sizeof view.clock);
  view.pm = minute >= 720;
  view.opens[0] = 0;
  uint16_t first = 0xFFFF;
  for (size_t i = 0; i < nw; i++) first = w[i].opens < first ? w[i].opens : first;
  if (first != 0xFFFF) {
    clock12(first, view.opens, sizeof view.opens);
    strcat(view.opens, first < 720 ? " AM" : " PM");
  }
  view.problem = topProblem(view.keyRejected, valid, wifi::online());
  view.hotspot = hotspotName.c_str();

  Frame f;
  if (storageDead) {
    f = Frame{Scene::Blocked, Phase::None, 0, Result::StorageError, 0, 0, 0, 0, false};
    bandText(Result::StorageError, 0, view.band);
  } else {
    f = screen.frame(ms, minute, isBright(valid, minute, w, nw), setupMode, unsent >= kCapacity, view.problem);
    if (f.scene == Scene::Blocked && f.result == Result::Full) bandText(Result::Full, 0, view.band);
  }
  display::bright(f.scene != Scene::Dim);
  display::draw(f, view);
  screen.drawn(ms);
}

static Result judge(const char* uid, uint32_t now, bool known, uint32_t uptimeSec) {
  if (!known) return Result::Unknown;
  if (repeats.isRepeat(uid, uptimeSec, rostercache::repeatMinutes())) return Result::AlreadyIn;
  if (!clockLooksValid(now)) return Result::ClockNotSet;
  Window w[8];
  const char* s = statusFor(manilaMinute(now), w, rostercache::windows(w, 8));
  return strcmp(s, "On time") == 0 ? Result::OnTime : strcmp(s, "Late") == 0 ? Result::Late : Result::Recorded;
}

// Seconds since boot from the 64-bit timer: millis()/1000 wrapped at 4,294,967 s (49.7 days), and a card held on
// the reader was then saved twice (review #9). Uptime, so a clock jump can't block or double a tap.
static uint32_t uptimeSec() { return static_cast<uint32_t>(esp_timer_get_time() / 1000000); }

static void handleTap(const char* uid) {
  const uint32_t t0 = millis();
  const uint32_t up = uptimeSec();
  if (!debounce.accept(uid, up)) return;
  checkUid[0] = 0;  // any new tap ends a check, before its own result or error shows (review #5)
  const uint32_t now = rtc::now();
  uint32_t seq = 0;
  xSemaphoreTake(logMutex, portMAX_DELAY);
  const TapLog::Add res = tapLog.add(uid, now, rtc::lastSync(), seq);
  xSemaphoreGive(logMutex);
  if (res != TapLog::Add::Ok) {
    const Result r = res == TapLog::Add::Full ? Result::Full : Result::StorageError;
    buzzer::error();
    bandText(r, 0, view.band);
    screen.block(r, millis());
    drawNow(millis());
    Serial.printf("tap %s NOT saved (%s)\n", uid, res == TapLog::Add::Full ? "full" : "storage error");
    return;
  }
  char name[24];
  const bool known = rostercache::nameFor(uid, name, sizeof name);
  const Result r = judge(uid, now, known, up);
  if (r == Result::Unknown && rosterfetch::canFetch() && !uploader::rejected()) {
    buzzer::tick();
    strncpy(checkUid, uid, sizeof checkUid - 1);
    checkUptime = up;
    checkUntil = millis() + kCheckMs;
    rosterfetch::checkSoon();
    bandText(Result::Checking, 0, view.band);
    screen.checking(millis());
    drawNow(millis());
    uploader::kick();  // the app needs this tap to register the card
    Serial.printf("tap %s seq %lu: unknown, checking (%lu ms to feedback)\n", uid, static_cast<unsigned long>(seq),
                  static_cast<unsigned long>(millis() - t0));
    return;
  }
  if (r == Result::Unknown) buzzer::unknown();
  else if (r == Result::AlreadyIn) buzzer::tick();
  else buzzer::ok();
  view.face = fitName(known ? name : "", view.name, sizeof view.name);
  bandText(r, clockLooksValid(now) ? manilaMinute(now) : kNoTime, view.band);
  screen.tap(r, millis());
  drawNow(millis());  // the first flash frame, before anything else
  uploader::kick();
  Serial.printf("tap %s seq %lu: %lu ms to feedback\n", uid, static_cast<unsigned long>(seq), static_cast<unsigned long>(millis() - t0));
}

// Network work runs here, on core 0, so a slow upload or page never delays a tap (spec §8).
static void netTask(void*) {
  for (;;) {
    wifi::tick();
    web::tick();
    uploader::tick();
    rosterfetch::tick();
    vTaskDelay(pdMS_TO_TICKS(10));
  }
}

static constexpr uint8_t kBootSteps = 5;  // clock, card reader, tap log, class list, Wi-Fi

void setup() {
  Serial.begin(115200);
  Serial.println("Klasilid reader");
  logMutex = xSemaphoreCreateMutex();
  rostercache::begin();
  // Power the DS3231 and the OLED from GPIO pairs (see pins.h), at full drive strength, before talking to them.
  for (int pin : {PIN_I2C_POWER, PIN_I2C_GROUND, PIN_OLED_POWER, PIN_OLED_GROUND}) {
    pinMode(pin, OUTPUT);
    gpio_set_drive_capability(static_cast<gpio_num_t>(pin), GPIO_DRIVE_CAP_3);
  }
  digitalWrite(PIN_I2C_GROUND, LOW);
  digitalWrite(PIN_OLED_GROUND, LOW);
  digitalWrite(PIN_I2C_POWER, HIGH);
  digitalWrite(PIN_OLED_POWER, HIGH);
  delay(50);  // let the OLED power up
  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire1.begin(PIN_OLED_SDA, PIN_OLED_SCL);
  buzzer::begin();
  display::begin();
  // The mark draws itself and the name wipes in (about 1 s), then the bar follows the real start-up steps.
  for (int i = 0; i <= 25; i++) {
    const uint32_t t = millis();
    display::boot(0, kBootSteps, i / 25.0f);
    while (millis() - t < 40) delay(1);
  }
  rtc::begin();
  display::boot(1, kBootSteps, 1);
  rfid::begin();
  display::boot(2, kBootSteps, 1);
  if (!LittleFS.begin(true) || !storage.begin()) {
    storageDead = true;
    buzzer::error();
  }
  tapLog.begin();
  display::boot(3, kBootSteps, 1);
  Serial.printf("log: %u unsent, next seq %lu\n", static_cast<unsigned>(tapLog.unsentCount()), static_cast<unsigned long>(tapLog.nextSeq()));
  rosterfetch::loadCached();
  display::boot(4, kBootSteps, 1);
  const Config cfg = config::load();
  setupMode = cfg.ssid.isEmpty();
  hotspotName = cfg.apName;
  wifi::begin(cfg);
  web::begin(cfg);
  uploader::begin(cfg);
  rosterfetch::begin(cfg);
  xTaskCreatePinnedToCore(netTask, "net", 12288, nullptr, 1, nullptr, 0);
  display::boot(kBootSteps, kBootSteps, 1);
}

// While "Checking card": the answer shows as soon as the fetched class list has the card, or Unknown at the deadline.
static void checkTick() {
  if (!checkUid[0]) return;
  char name[24];
  const bool found = rostercache::nameFor(checkUid, name, sizeof name);
  if (!found && static_cast<int32_t>(millis() - checkUntil) < 0) return;
  const Result r = found ? Result::Registered : Result::Unknown;
  if (found) {
    buzzer::ok();
    // The app counts this tap: remember it, so a second tap within the repeat minutes shows Already in (review #7).
    repeats.isRepeat(checkUid, checkUptime, rostercache::repeatMinutes());
  } else {
    buzzer::unknown();
  }
  view.face = fitName(found ? name : "", view.name, sizeof view.name);
  bandText(r, 0, view.band);
  screen.tap(r, millis());
  Serial.printf("card %s: %s\n", checkUid, found ? "registered" : "still not registered");
  checkUid[0] = 0;
}

void loop() {
  char uid[21];
  if (!storageDead && rfid::poll(uid)) handleTap(uid);
  checkTick();
  const uint32_t ms = millis();
  if (screen.due(ms)) drawNow(ms);
  delay(2);
}
