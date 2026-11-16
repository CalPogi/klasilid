#pragma once
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "taplog.h"

// The tap log is written by the tap flow (core 1) and read by the uploader and local API (core 0).
// Hold logMutex for every call on tapLog.
extern TapLog tapLog;
extern SemaphoreHandle_t logMutex;

void timeText(uint32_t unix, char out[12]);  // "7:10 AM" (Manila), "--:--" when the clock isn't set
