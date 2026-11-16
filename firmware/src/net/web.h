#pragma once
#include "config.h"

// Port 80: the setup page (GET /, POST /, POST /setup) and the local API (GET /status, GET /taps) for plan 6.
namespace web {
void begin(const Config& c);
void tick();
}
