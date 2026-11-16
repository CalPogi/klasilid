#pragma once
#include <stdint.h>

constexpr uint32_t KL_EARLIEST = 1767225600;  // 2026-01-01T00:00:00Z; an earlier clock counts as "not set"

void isoUtc(uint32_t unix, char out[21]);  // "2026-11-12T23:10:02Z"
bool clockLooksValid(uint32_t unix);
uint16_t manilaMinute(uint32_t unix);  // minutes after Manila midnight (UTC+8, no DST)
