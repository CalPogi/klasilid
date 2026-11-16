#pragma once
#include <Arduino.h>

// Saved in ESP32 NVS (namespace "kl"), never in source code (spec §11).
struct Config {
  String ssid, pass, server, deviceId, deviceKey, pairToken, apName;
};

namespace config {
Config load();
void save(const Config& c);
bool tokenMatches(const Config& c, const String& given);  // constant-time; false when no code is set
}
