#pragma once
#include "config.h"

namespace wifi {
void begin(const Config& c);  // STA with the saved network; the hotspot after 30 s without one (spec §8)
void tick();                  // retries, hotspot, NTP → DS3231
bool online();
const char* state();  // for the screen: "Wi-Fi", "Hotspot", "No Wi-Fi"
const char* mode();   // for /status: "sta", "ap+sta"
}
