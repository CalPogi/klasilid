#pragma once
#include <stdint.h>
namespace display {
void begin();
// Waiting screen. note (may be null) is a warning such as "Clock not set" or "Reader key not accepted".
void idle(const char* timeText, const char* wifiState, uint32_t unsent, const char* note);
void tap(const char* name, const char* status, const char* timeText);  // main.cpp keeps it up for 2.5 s
void message(const char* line1, const char* line2);
}
