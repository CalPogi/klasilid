// Klasilid door reader: read card → write to the flash log → feedback within 0.5 s (spec §8).
#include <Arduino.h>
#include <LittleFS.h>
#include <Wire.h>
#include <stdio.h>
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
#include "timefmt.h"

static constexpr uint32_t kCapacity = 8192;  // ≥ 30 school days × 50 learners × 4 taps (spec §8)
static LittleFsStorage storage(kCapacity);
TapLog tapLog(storage, kCapacity);
SemaphoreHandle_t logMutex;

static Debounce debounce(3);
static uint32_t showUntil = 0;  // millis() until which the tap result stays on screen
static uint32_t lastIdle = 0;

void timeText(uint32_t unix, char out[12]) {
  if (!clockLooksValid(unix)) {
    strcpy(out, "--:--");
    return;
  }
  const uint16_t m = manilaMinute(unix);
  const unsigned h = m / 60 % 12 == 0 ? 12 : m / 60 % 12;
  snprintf(out, 12, "%u:%02u %s", h, static_cast<unsigned>(m % 60), m < 720 ? "AM" : "PM");
}

static void handleTap(const char* uid) {
  const uint32_t t0 = millis();
  if (!debounce.accept(uid, t0 / 1000)) return;  // uptime, so a clock jump can't block or double a tap
  const uint32_t now = rtc::now();
  uint32_t seq = 0;
  xSemaphoreTake(logMutex, portMAX_DELAY);
  const TapLog::Add res = tapLog.add(uid, now, rtc::lastSync(), seq);
  xSemaphoreGive(logMutex);
  showUntil = millis() + 2500;
  if (res != TapLog::Add::Ok) {
    if (res == TapLog::Add::Full) display::message("Reader full", KL_MSG_CONNECT);
    else display::message("Storage error", KL_MSG_NOT_SAVED);
    buzzer::error();
    Serial.printf("tap %s NOT saved (%s)\n", uid, res == TapLog::Add::Full ? "full" : "storage error");
    return;
  }
  char name[24], when[12];
  timeText(now, when);
  const bool known = rostercache::nameFor(uid, name, sizeof name);
  const char* status = KL_MSG_CLOCK;
  if (clockLooksValid(now)) {
    Window w[8];
    status = statusFor(manilaMinute(now), w, rostercache::windows(w, 8));
  }
  display::tap(known ? name : "Card not registered", status, when);
  if (known) buzzer::ok();
  else buzzer::unknown();
  uploader::kick();
  Serial.printf("tap %s seq %lu: %lu ms to feedback\n", uid, static_cast<unsigned long>(seq), static_cast<unsigned long>(millis() - t0));
}

static void drawIdle() {
  const uint32_t now = rtc::now();
  char when[12];
  timeText(now, when);
  xSemaphoreTake(logMutex, portMAX_DELAY);
  const uint32_t unsent = tapLog.unsentCount();
  xSemaphoreGive(logMutex);
  const char* note = !clockLooksValid(now) ? KL_MSG_CLOCK : uploader::note();
  if (!note && unsent >= kCapacity) note = KL_MSG_FULL_IDLE;
  display::idle(when, wifi::state(), unsent, note);
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
  rtc::begin();
  rfid::begin();
  if (!LittleFS.begin(true) || !storage.begin()) {
    display::message("Storage error", KL_MSG_RESTART);
    buzzer::error();
  }
  tapLog.begin();
  Serial.printf("log: %u unsent, next seq %lu\n", static_cast<unsigned>(tapLog.unsentCount()), static_cast<unsigned long>(tapLog.nextSeq()));
  rosterfetch::loadCached();
  const Config cfg = config::load();
  wifi::begin(cfg);
  web::begin(cfg);
  uploader::begin(cfg);
  rosterfetch::begin(cfg);
  xTaskCreatePinnedToCore(netTask, "net", 12288, nullptr, 1, nullptr, 0);
}

void loop() {
  char uid[21];
  if (rfid::poll(uid)) handleTap(uid);
  if (static_cast<int32_t>(millis() - showUntil) >= 0 && millis() - lastIdle >= 1000) {
    lastIdle = millis();
    drawIdle();
  }
  delay(5);
}
