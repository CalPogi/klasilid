#pragma once
#include "config.h"

namespace rosterfetch {
void loadCached();  // at boot, from /roster.json, so names show offline
void begin(const Config& c);
void tick();  // on connect and every 10 minutes
}
