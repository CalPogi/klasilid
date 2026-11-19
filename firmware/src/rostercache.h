#pragma once
#include <stddef.h>
#include "roster.h"

// The class roster in RAM, shared by the tap flow (core 1) and the roster fetch (core 0).
namespace rostercache {
void begin();
void set(const Card* cards, size_t nCards, const Window* windows, size_t nWindows, uint16_t repeatMinutes);
uint16_t repeatMinutes();  // the class's repeat time for "Already in"; 3 before any roster
bool nameFor(const char* uid, char* out, size_t cap);  // false: card not registered
size_t windows(Window* out, size_t max);
}
