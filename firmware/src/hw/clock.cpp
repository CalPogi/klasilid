#include "clock.h"
#include <Preferences.h>
#include <RTClib.h>
#include <Wire.h>
#include <sys/time.h>
#include <time.h>
#include "timefmt.h"

static RTC_DS3231 ds;
static bool haveDs = false;
static uint32_t synced = 0;

static void setSystemTime(uint32_t unix) {
  timeval tv{static_cast<time_t>(unix), 0};
  settimeofday(&tv, nullptr);
}

void rtc::begin() {
  haveDs = ds.begin(&Wire);
  Preferences p;
  p.begin("kl", false);
  synced = p.getUInt("lastSync", 0);
  const uint32_t t = haveDs ? ds.now().unixtime() : 0;
  if (!haveDs || ds.lostPower() || !clockLooksValid(t)) {
    synced = 0;  // the time no longer comes from a sync; taps go up with clockSyncedAt null (spec §8)
    p.putUInt("lastSync", 0);
  }
  p.end();
  if (clockLooksValid(t)) setSystemTime(t);
}

uint32_t rtc::now() { return haveDs ? ds.now().unixtime() : static_cast<uint32_t>(time(nullptr)); }

void rtc::set(uint32_t unix) {
  if (haveDs) ds.adjust(DateTime(unix));  // also clears the DS3231's lost-power flag
  synced = unix;
  Preferences p;
  p.begin("kl", false);
  p.putUInt("lastSync", unix);
  p.end();
}

uint32_t rtc::lastSync() { return synced; }
