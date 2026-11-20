#pragma once
// The reader screen's logic, apart from drawing (docs/2026-11-19-reader-screen-design.md). No Arduino or U8g2 here,
// so it is tested on the board with Unity; src/hw/display.cpp draws what it decides.
#include <stddef.h>
#include <stdint.h>
#include "roster.h"

// Status bar: Wi-Fi bars from RSSI (>= -60 dBm: 3, >= -72: 2, else 1), the hotspot icon, or no Wi-Fi.
enum class Wifi : uint8_t { Strong, Fair, Weak, Hotspot, None };
Wifi wifiFrom(bool online, bool hotspot, int rssi);

// Problems that keep taps working; the idle button rolls to the most urgent one (Key > Clock > No Wi-Fi).
enum class Problem : uint8_t { None, NoWifi, Clock, Key };
Problem topProblem(bool keyRejected, bool clockValid, bool online);
const char* problemText(Problem p);  // the idle button's text for it

// Bright from 30 minutes before each tap window opens to 60 minutes after it closes; bright when there are no
// windows or the clock isn't set.
bool isBright(bool clockValid, uint16_t minute, const Window* w, size_t n);

// "Already in": the app's dropRepeats rule, by uptime. A tap within repeatMinutes of the card's last counted tap is a
// repeat, and a repeat doesn't move that card's window.
class RepeatGuard {
 public:
  bool isRepeat(const char* uid, uint32_t uptimeSec, uint16_t repeatMinutes);

 private:
  static constexpr int kSlots = 64;  // cards remembered; a class is about 40-50
  struct Seen { char uid[21]; uint32_t at; bool used; };
  Seen seen_[kSlots] = {};
  int next_ = 0;
};

// Checking: an unknown card while online, until the class list is fetched again; Registered: it was there.
enum class Result : uint8_t { OnTime, Late, Recorded, Unknown, AlreadyIn, ClockNotSet, Full, StorageError, Registered, Checking,
                              TimeOut, AlreadyOut };
constexpr uint16_t kNoTime = 0xFFFF;  // minute when the clock isn't set: "ALREADY IN" shows no time
void bandText(Result r, uint16_t minute, char out[28]);  // the result band, e.g. "ON TIME · 7:12"

// Names up to 10 letters use the big face, up to 18 the small one; longer ones are cut to 15 letters and "...".
enum class NameFace : uint8_t { Big, Small };
NameFace fitName(const char* name, char* out, size_t cap);

void dateText(uint32_t unix, bool clockValid, char out[12]);  // "THU 19 NOV" (Manila), or "-- --- ---"

// ---- The timeline: which scene shows and where each animation is (design §5, boards "Reader screen: …") ----
enum class Scene : uint8_t { Idle, Dim, Setup, Tap, Repeat, Blocked, Checking };  // Blocked: Reader full / Storage error
enum class Phase : uint8_t { None, Grow, Fold, Rise, Hold, Leave };
// t: progress 0–1 within the phase. digitRoll / msgRoll: progress 0–1 of a roll, 0 when not rolling.
// showProblem: the idle button shows the problem (or rolls back from it when msgRoll > 0).
struct Frame {
  Scene scene; Phase phase; float t; Result result;
  uint8_t driftX, driftY; float digitRoll; float msgRoll; bool showProblem;
};

class Screen {
 public:
  void tap(Result r, uint32_t ms);    // a tap's result (AlreadyIn: the shorter Repeat sequence); cuts in at once
  void block(Result r, uint32_t ms);  // Full or StorageError on a tap: shown 2.5 s, no flash
  void checking(uint32_t ms);         // "Checking card" until tap() gives the answer (t: a 1.2 s spinner cycle)
  // minute: Manila minute of the day (drift and digit roll); full: the log is full (Reader full until it clears).
  Frame frame(uint32_t ms, uint16_t minute, bool bright, bool setup, bool full, Problem p);
  bool due(uint32_t ms) const;  // time to draw again: 40 ms while anything moves, else at the next change or 1 s
  void drawn(uint32_t ms);      // the frame from the last frame() call went out at ms

 private:
  enum class Seq : uint8_t { None, Tap, Repeat, Block, Check };
  Seq seq_ = Seq::None;
  Result result_ = Result::OnTime;
  uint32_t start_ = 0;
  bool tapped_ = false;
  uint32_t lastTap_ = 0;
  bool knowMinute_ = false;
  uint16_t minute_ = 0;
  bool rolling_ = false;
  uint32_t rollStart_ = 0;
  bool moving_ = false;
  uint32_t nextEvent_ = 0;
  bool hasNext_ = false;
  bool force_ = true;
  uint32_t nextDue_ = 0;
};
size_t utf8Len(const char* s);

// What the app will make of a tap (packages/core status.ts computeDay), so the screen agrees with the records: each
// card gets one morning time-in, one time-out, one afternoon time-in and one time-out a day.
//   in-window: first tap of the session OnTime/Late, then AlreadyIn;  out-window: first tap after a time-in TimeOut,
//   then AlreadyOut (no time-in yet: Recorded, the app lists it for review);  after an in-window closed with no time-in:
//   Late;  anything else: Recorded. A tap within repeatMinutes of the card's last counted tap is a repeat (AlreadyIn,
//   or AlreadyOut after a time-out) and doesn't count, as the app's dropRepeats. Needs a real date; starts over each
//   Manila day. 128 cards, more than the class list holds (120); past that, taps are judged but not remembered.
class DayBook {
 public:
  Result judge(const char* uid, uint32_t unix, uint16_t repeatMinutes, const Window* w, size_t n);

 private:
  struct Entry { char uid[21]; uint8_t used; bool lastOut; uint32_t lastUnix; };  // used: am in, am out, pm in, pm out
  static constexpr int kCards = 128;
  Entry e_[kCards] = {};
  int count_ = 0;
  uint32_t day_ = 0xFFFFFFFF;
};

// A window of `len` ms on millis(), safe across its wrap: never running before start(), and once over, over for good.
class Countdown {
 public:
  void start(uint32_t ms, uint32_t len) { start_ = ms; len_ = len; on_ = true; }
  bool running(uint32_t ms) {
    if (on_ && ms - start_ >= len_) on_ = false;
    return on_;
  }

 private:
  volatile uint32_t start_ = 0, len_ = 0;
  volatile bool on_ = false;
};                                 // letters, not bytes
