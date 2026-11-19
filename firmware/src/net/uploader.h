#pragma once
#include <stdint.h>
#include "config.h"

namespace uploader {
void begin(const Config& c);
void tick();              // runs on the network task (core 0); never called from the tap flow
void kick();              // a tap was recorded: try soon
uint32_t lastUploadAt();  // unix, 0 = never
const char* note();       // warning for the idle screen, or nullptr
bool busy();              // a batch of taps is being sent right now (the status bar's arrow moves)
bool rejected();          // the server refused this reader's key
}
