#include "config.h"
#include <Preferences.h>

Config config::load() {
  Preferences p;
  p.begin("kl", true);
  Config c{p.getString("ssid"), p.getString("pass"), p.getString("server"), p.getString("deviceId"),
           p.getString("deviceKey"), p.getString("pairToken"), p.getString("apName", "Klasilid-Diamond")};
  p.end();
  return c;
}

void config::save(const Config& c) {
  Preferences p;
  p.begin("kl", false);
  p.putString("ssid", c.ssid);
  p.putString("pass", c.pass);
  p.putString("server", c.server);
  p.putString("deviceId", c.deviceId);
  p.putString("deviceKey", c.deviceKey);
  p.putString("pairToken", c.pairToken);
  p.putString("apName", c.apName);
  p.end();
}

bool config::tokenMatches(const Config& c, const String& given) {
  if (c.pairToken.isEmpty() || given.length() != c.pairToken.length()) return false;
  uint8_t diff = 0;
  for (size_t i = 0; i < given.length(); i++) diff |= given[i] ^ c.pairToken[i];
  return diff == 0;
}
