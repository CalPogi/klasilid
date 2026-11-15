#pragma once
#include <stddef.h>
#include <stdint.h>
#include "taplog.h"

// POST /functions/v1/tap body (plan 1 contract). Returns the length, or 0 if it doesn't fit in `cap`.
size_t buildBody(const char* deviceId, const TapRec* recs, size_t n, char* out, size_t cap);
// Seqs that may leave the queue: acked ∪ rejected. 0 on malformed JSON.
size_t parseAck(const char* json, uint32_t* seqsOut, size_t max);
