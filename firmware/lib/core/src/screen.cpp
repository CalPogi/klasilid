#include "screen.h"
#include <stdio.h>
#include <string.h>
#include <time.h>
#include "messages.h"

Wifi wifiFrom(bool online, bool hotspot, int rssi) {
  if (online) return rssi >= -60 ? Wifi::Strong : rssi >= -72 ? Wifi::Fair : Wifi::Weak;
  return hotspot ? Wifi::Hotspot : Wifi::None;
}

Problem topProblem(bool keyRejected, bool clockValid, bool online) {
  if (keyRejected) return Problem::Key;
  if (!clockValid) return Problem::Clock;
  if (!online) return Problem::NoWifi;
  return Problem::None;
}

const char* problemText(Problem p) {
  switch (p) {
    case Problem::Key: return KL_MSG_BTN_KEY;
    case Problem::Clock: return KL_MSG_BTN_CLOCK;
    case Problem::NoWifi: return KL_MSG_BTN_NO_WIFI;
    default: return KL_MSG_BTN_TAP;
  }
}

bool isBright(bool clockValid, uint16_t minute, const Window* w, size_t n) {
  if (!clockValid || n == 0) return true;
  for (size_t i = 0; i < n; i++) {
    if (static_cast<int>(minute) >= static_cast<int>(w[i].opens) - 30 && minute <= w[i].closes + 60) return true;
  }
  return false;
}

bool RepeatGuard::isRepeat(const char* uid, uint32_t uptimeSec, uint16_t repeatMinutes) {
  for (Seen& s : seen_) {
    if (!s.used || strcmp(s.uid, uid) != 0) continue;
    if (uptimeSec - s.at < static_cast<uint32_t>(repeatMinutes) * 60) return true;
    s.at = uptimeSec;  // counts again: the window starts here
    return false;
  }
  Seen& s = seen_[next_];
  next_ = (next_ + 1) % kSlots;
  strncpy(s.uid, uid, sizeof s.uid - 1);
  s.uid[sizeof s.uid - 1] = '\0';
  s.at = uptimeSec;
  s.used = true;
  return false;
}

static void clock12(uint16_t minute, char* out, size_t cap, bool ampm) {
  const unsigned h = minute / 60 % 12 == 0 ? 12 : minute / 60 % 12;
  if (ampm) snprintf(out, cap, "%u:%02u %s", h, static_cast<unsigned>(minute % 60), minute < 720 ? "AM" : "PM");
  else snprintf(out, cap, "%u:%02u", h, static_cast<unsigned>(minute % 60));
}

void bandText(Result r, uint16_t minute, char out[28]) {
  char t[12];
  switch (r) {
    case Result::OnTime: clock12(minute, t, sizeof t, false); snprintf(out, 28, "ON TIME " KL_DOT " %s", t); break;
    case Result::Late: clock12(minute, t, sizeof t, false); snprintf(out, 28, "LATE " KL_DOT " %s", t); break;
    case Result::Recorded: clock12(minute, t, sizeof t, true); snprintf(out, 28, "RECORDED " KL_DOT " %s", t); break;
    case Result::AlreadyIn: clock12(minute, t, sizeof t, false); snprintf(out, 28, "ALREADY IN " KL_DOT " %s", t); break;
    case Result::Unknown: snprintf(out, 28, "%s", KL_MSG_BAND_UNKNOWN); break;
    case Result::ClockNotSet: snprintf(out, 28, "%s", KL_MSG_BAND_CLOCK); break;
    case Result::Full: snprintf(out, 28, "%s", KL_MSG_BAND_FULL); break;
    case Result::StorageError: snprintf(out, 28, "%s", KL_MSG_BAND_STORAGE); break;
  }
}

size_t utf8Len(const char* s) {
  size_t n = 0;
  for (; *s; s++) if ((static_cast<uint8_t>(*s) & 0xC0) != 0x80) n++;  // count lead bytes only
  return n;
}

NameFace fitName(const char* name, char* out, size_t cap) {
  const size_t letters = utf8Len(name);
  if (letters <= 18) {
    strncpy(out, name, cap - 1);
    out[cap - 1] = '\0';
    return letters <= 10 ? NameFace::Big : NameFace::Small;
  }
  size_t i = 0, kept = 0;
  while (name[i] && i < cap - 4) {  // room for "..." and the end
    if ((static_cast<uint8_t>(name[i]) & 0xC0) != 0x80 && kept++ == 15) break;  // stop before the 16th letter
    out[i] = name[i];
    i++;
  }
  strcpy(out + i, "...");
  return NameFace::Small;
}

void dateText(uint32_t unix, bool clockValid, char out[12]) {
  if (!clockValid) {
    strcpy(out, "-- --- ---");
    return;
  }
  static const char* const kDays[] = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"};
  static const char* const kMonths[] = {"JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"};
  const time_t t = static_cast<time_t>(unix) + 8 * 3600;  // Manila, no DST
  struct tm tm;
  gmtime_r(&t, &tm);
  snprintf(out, 12, "%s %d %s", kDays[tm.tm_wday], tm.tm_mday, kMonths[tm.tm_mon]);
}
