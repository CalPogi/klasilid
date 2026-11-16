#pragma once
#include <stdint.h>
// "clock" collides with the C library's clock(); hence rtc.
namespace rtc {
void begin();             // also sets the ESP32 system time from the DS3231 (TLS needs a real date)
uint32_t now();           // unix seconds from the DS3231 (system time if the DS3231 is missing)
void set(uint32_t unix);  // after an NTP sync: writes the DS3231 and saves lastSync
uint32_t lastSync();      // 0 = never synced since the DS3231 last lost power
}
