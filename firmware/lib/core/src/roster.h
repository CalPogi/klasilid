#pragma once
#include <stddef.h>
#include <stdint.h>

constexpr uint16_t KL_NO_LATE = 0xFFFF;

// One tap window from the server roster. session 'a'/'p' (am/pm), kind 'i'/'o' (in/out), times in Manila minutes.
struct Window { char session; char kind; uint16_t opens, lateAfter /* KL_NO_LATE = none */, closes; };

// The line under the learner's name: inside an in-window "On time" (<= lateAfter) or "Late"; anything else "Recorded".
// Same boundaries as packages/core status.ts (opens <= m <= closes).
const char* statusFor(uint16_t minute, const Window* w, size_t n);

// One registered card from the server roster, with the short name shown on the screen ("Ana A.").
struct Card { char uid[21]; char name[24]; };

// Parses the server's roster response (supabase/functions/roster). false if it isn't a roster.
bool parseRoster(const char* json, Card* cards, size_t maxCards, size_t& nCards, Window* windows, size_t maxWindows, size_t& nWindows);
