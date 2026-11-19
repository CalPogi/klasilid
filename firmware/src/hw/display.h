#pragma once
#include <stdint.h>
#include "screen.h"

// Draws the approved reader screens (canvas boards "Reader screen: …", docs/2026-11-19-reader-screen-design.md).
// What to show and where each animation is comes from Screen (lib/core/src/screen.h); this file only draws.
struct View {
  Wifi wifi;
  uint32_t unsent;
  bool uploading;
  bool keyRejected;
  bool clockValid;
  char date[12];   // "THU 19 NOV"
  char clock[6];   // "7:12"
  bool pm;
  char opens[12];  // dim screen: "6:00 AM", or "" when unknown
  char name[28];
  NameFace face;
  char band[28];
  Problem problem;
  const char* hotspot;  // the hotspot's network name, for the setup screen
};

namespace display {
void begin();
void bright(bool on);                          // full brightness, or the lowest (dim scene)
void draw(const Frame& f, const View& v);      // one frame of any scene
void boot(uint8_t step, uint8_t steps, float markT);  // start-up: markT 0–1 draws the mark and name, then the bar

// The plain screens of plan 5, used by main.cpp until plan 8 Task 5 switches it to draw().
void idle(const char* timeText, const char* wifiState, uint32_t unsent, const char* note);
void tap(const char* name, const char* status, const char* timeText);
void message(const char* line1, const char* line2);
}
