#include "timefmt.h"
#include <stdio.h>

// Days since 1970-01-01 → civil date (Howard Hinnant's algorithm); no libc timezone state involved.
static void civil(int32_t days, int32_t& y, unsigned& m, unsigned& d) {
  days += 719468;
  const int32_t era = (days >= 0 ? days : days - 146096) / 146097;
  const unsigned doe = static_cast<unsigned>(days - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  d = doy - (153 * mp + 2) / 5 + 1;
  m = mp < 10 ? mp + 3 : mp - 9;
  y = static_cast<int32_t>(yoe) + era * 400 + (m <= 2);
}

void isoUtc(uint32_t unix, char out[21]) {
  int32_t y;
  unsigned m, d;
  civil(static_cast<int32_t>(unix / 86400), y, m, d);
  const uint32_t s = unix % 86400;
  snprintf(out, 21, "%04d-%02u-%02uT%02u:%02u:%02uZ", static_cast<int>(y), m, d,
           static_cast<unsigned>(s / 3600), static_cast<unsigned>(s / 60 % 60), static_cast<unsigned>(s % 60));
}

bool clockLooksValid(uint32_t unix) { return unix >= KL_EARLIEST; }

uint16_t manilaMinute(uint32_t unix) { return static_cast<uint16_t>(((unix + 8UL * 3600) % 86400) / 60); }
