#pragma once
#include <Arduino.h>
#include "config.h"

namespace http {
// Request to <server><path> with x-device-key and a 10 s timeout. Returns the HTTP status, or < 0 on a network error.
int request(const Config& c, const char* method, const String& path, const char* body, size_t len, String& response);
}
