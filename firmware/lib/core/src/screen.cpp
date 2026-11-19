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
    case Result::Registered: snprintf(out, 28, "%s", KL_MSG_BAND_REGISTERED); break;
    case Result::Checking: snprintf(out, 28, "%s", KL_MSG_BAND_CHECKING); break;
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

// ---- timeline ----
static constexpr uint32_t kFrameMs = 40;      // 25 frames a second
static constexpr uint32_t kRollMs = 300;      // digit and message rolls
static constexpr uint32_t kMsgCycleMs = 6000; // tap text 0–2700, roll, problem 3000–5700, roll back
static constexpr uint32_t kWakeMs = 10000;    // a tap keeps a dim screen bright this long

static int32_t since(uint32_t now, uint32_t then) { return static_cast<int32_t>(now - then); }  // safe across millis wrap

void Screen::tap(Result r, uint32_t ms) {
  seq_ = r == Result::AlreadyIn ? Seq::Repeat : Seq::Tap;
  result_ = r;
  start_ = ms;
  tapped_ = true;
  lastTap_ = ms;
  force_ = true;
}

void Screen::block(Result r, uint32_t ms) {
  seq_ = Seq::Block;
  result_ = r;
  start_ = ms;
  tapped_ = true;
  lastTap_ = ms;
  force_ = true;
}

void Screen::checking(uint32_t ms) {
  seq_ = Seq::Check;
  result_ = Result::Checking;
  start_ = ms;
  tapped_ = true;
  lastTap_ = ms;
  force_ = true;
}

Frame Screen::frame(uint32_t ms, uint16_t minute, bool bright, bool setup, bool full, Problem p) {
  Frame f{Scene::Idle, Phase::None, 0, result_, 0, 0, 0, 0, false};
  moving_ = false;
  hasNext_ = false;
  const auto until = [&](uint32_t at) { nextEvent_ = at; hasNext_ = true; };

  // A running sequence: [phase, end ms] in order.
  struct Step { Phase phase; int32_t end; };
  static const Step kTap[] = {{Phase::Grow, 200}, {Phase::Fold, 450}, {Phase::Rise, 700}, {Phase::Hold, 2500}, {Phase::Leave, 2800}};
  static const Step kRepeat[] = {{Phase::Rise, 300}, {Phase::Hold, 1500}, {Phase::Leave, 1800}};
  static const Step kBlock[] = {{Phase::Hold, 2500}};
  const Step* steps = seq_ == Seq::Tap ? kTap : seq_ == Seq::Repeat ? kRepeat : kBlock;
  const size_t n = seq_ == Seq::Tap ? 5 : seq_ == Seq::Repeat ? 3 : 1;
  if (seq_ == Seq::Check) {
    static constexpr uint32_t kSpinMs = 1200;
    f.scene = Scene::Checking;
    f.t = static_cast<float>(static_cast<uint32_t>(since(ms, start_)) % kSpinMs) / kSpinMs;
    lastTap_ = ms;  // keeps a dim screen awake while it checks
    moving_ = true;
  } else if (seq_ != Seq::None) {
    const int32_t el = since(ms, start_);
    int32_t begin = 0;
    for (size_t i = 0; i < n && seq_ != Seq::None; i++) {
      if (el < steps[i].end) {
        f.scene = seq_ == Seq::Tap ? Scene::Tap : seq_ == Seq::Repeat ? Scene::Repeat : Scene::Blocked;
        f.phase = steps[i].phase;
        f.t = static_cast<float>(el - begin) / static_cast<float>(steps[i].end - begin);
        if (f.phase == Phase::Hold) until(start_ + steps[i].end);
        else moving_ = true;
        break;
      }
      begin = steps[i].end;
      if (i == n - 1) seq_ = Seq::None;  // finished
    }
  }

  // Minute changes: the clock's last digit rolls; drift steps once a minute.
  if (knowMinute_ && minute != minute_) {
    rolling_ = true;
    rollStart_ = ms;
  }
  knowMinute_ = true;
  minute_ = minute;
  if (rolling_) {
    const int32_t r = since(ms, rollStart_);
    if (r < static_cast<int32_t>(kRollMs)) {
      f.digitRoll = static_cast<float>(r) / kRollMs;
      moving_ = true;
    } else {
      rolling_ = false;
    }
  }

  if (seq_ == Seq::None) {
    const bool awake = tapped_ && since(ms, lastTap_) < static_cast<int32_t>(kWakeMs);
    if (full) f.scene = Scene::Blocked, f.result = Result::Full;
    else if (setup) f.scene = Scene::Setup;
    else if (!bright && !awake) f.scene = Scene::Dim;
    else f.scene = Scene::Idle;
    if (!bright && awake) until(lastTap_ + kWakeMs);
    if (f.scene == Scene::Idle && p != Problem::None) {
      const uint32_t c = ms % kMsgCycleMs;
      if (c < 2700) until(ms + (2700 - c));
      else if (c < 3000) f.msgRoll = static_cast<float>(c - 2700) / kRollMs, moving_ = true;
      else if (c < 5700) f.showProblem = true, until(ms + (5700 - c));
      else f.showProblem = true, f.msgRoll = static_cast<float>(c - 5700) / kRollMs, moving_ = true;
    }
  }

  static const uint8_t kDrift[4][2] = {{0, 0}, {1, 0}, {1, 1}, {0, 1}};
  const uint8_t step = f.scene == Scene::Dim ? 3 : 1;
  f.driftX = kDrift[minute % 4][0] * step;
  f.driftY = kDrift[minute % 4][1] * step;
  return f;
}

bool Screen::due(uint32_t ms) const { return force_ || since(ms, nextDue_) >= 0; }

void Screen::drawn(uint32_t ms) {
  force_ = false;
  nextDue_ = ms + (moving_ ? kFrameMs : 1000);
  if (!moving_ && hasNext_ && since(nextDue_, nextEvent_) > 0) nextDue_ = nextEvent_;
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
