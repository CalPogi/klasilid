#include "roster.h"

const char* statusFor(uint16_t minute, const Window* w, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (w[i].kind != 'i' || minute < w[i].opens || minute > w[i].closes) continue;
    return (w[i].lateAfter == KL_NO_LATE || minute <= w[i].lateAfter) ? "On time" : "Late";
  }
  return "Recorded";
}
