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
  static constexpr int kSlots = 32;  // cards remembered; a class is about 40
  struct Seen { char uid[21]; uint32_t at; bool used; };
  Seen seen_[kSlots] = {};
  int next_ = 0;
};

enum class Result : uint8_t { OnTime, Late, Recorded, Unknown, AlreadyIn, ClockNotSet, Full, StorageError };
void bandText(Result r, uint16_t minute, char out[28]);  // the result band, e.g. "ON TIME · 7:12"

// Names up to 10 letters use the big face, up to 18 the small one; longer ones are cut to 15 letters and "...".
enum class NameFace : uint8_t { Big, Small };
NameFace fitName(const char* name, char* out, size_t cap);

void dateText(uint32_t unix, bool clockValid, char out[12]);  // "THU 19 NOV" (Manila), or "-- --- ---"
size_t utf8Len(const char* s);                                 // letters, not bytes
