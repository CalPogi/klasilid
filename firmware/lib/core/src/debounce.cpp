#include "debounce.h"
#include <string.h>

bool Debounce::accept(const char* uid, uint32_t unix) {
  for (auto& s : seen_) {
    if (s.uid[0] && strcmp(s.uid, uid) == 0) {
      // A clock that jumped backwards (NTP resync) must not block a card for hours.
      if (unix >= s.at && unix - s.at < seconds_) return false;
      s.at = unix;
      return true;
    }
  }
  Seen& s = seen_[next_];
  next_ = (next_ + 1) % kSlots;
  strncpy(s.uid, uid, sizeof s.uid - 1);
  s.uid[sizeof s.uid - 1] = '\0';
  s.at = unix;
  return true;
}
