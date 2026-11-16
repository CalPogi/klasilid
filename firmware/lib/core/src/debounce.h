#pragma once
#include <stdint.h>

// The RC522 reads one card several times during a single tap; only the first read counts.
class Debounce {
 public:
  explicit Debounce(uint32_t seconds = 3) : seconds_(seconds) {}
  bool accept(const char* uid, uint32_t unix);  // false if the same uid was accepted less than `seconds` ago

 private:
  static constexpr int kSlots = 8;  // recent cards remembered; a queue at the door rarely has more in 3 s
  struct Seen { char uid[21]; uint32_t at; };
  Seen seen_[kSlots] = {};
  int next_ = 0;
  uint32_t seconds_;
};
