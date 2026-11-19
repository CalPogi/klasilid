#pragma once
#include "config.h"

namespace rosterfetch {
void loadCached();  // at boot, from /roster.json, so names show offline
void begin(const Config& c);
void tick();  // on connect and every 10 minutes, and every 3 s while checkSoon() asks
// An unknown card was tapped: fetch the class list now and every 3 s for 20 s, in case the app just registered it.
void checkSoon();
}
