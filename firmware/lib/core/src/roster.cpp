#include "roster.h"
#include <ArduinoJson.h>
#include <string.h>

const char* statusFor(uint16_t minute, const Window* w, size_t n) {
  for (size_t i = 0; i < n; i++) {
    if (w[i].kind != 'i' || minute < w[i].opens || minute > w[i].closes) continue;
    return (w[i].lateAfter == KL_NO_LATE || minute <= w[i].lateAfter) ? "On time" : "Late";
  }
  return "Recorded";
}

bool parseRoster(const char* json, Card* cards, size_t maxCards, size_t& nCards, Window* windows, size_t maxWindows, size_t& nWindows,
                 uint16_t& repeatMinutes) {
  JsonDocument doc;
  if (deserializeJson(doc, json) || !doc["cards"].is<JsonArray>() || !doc["windows"].is<JsonArray>()) return false;
  nCards = 0;
  for (JsonObject c : doc["cards"].as<JsonArray>()) {
    if (nCards == maxCards) break;
    Card& out = cards[nCards];
    strncpy(out.uid, c["uid"] | "", sizeof out.uid - 1);
    out.uid[sizeof out.uid - 1] = '\0';
    strncpy(out.name, c["name"] | "", sizeof out.name - 1);
    out.name[sizeof out.name - 1] = '\0';
    if (out.uid[0]) nCards++;
  }
  nWindows = 0;
  for (JsonObject w : doc["windows"].as<JsonArray>()) {
    if (nWindows == maxWindows) break;
    windows[nWindows++] = Window{strcmp(w["session"] | "", "pm") == 0 ? 'p' : 'a', strcmp(w["kind"] | "", "out") == 0 ? 'o' : 'i',
                                 w["opens"] | uint16_t(0), w["lateAfter"].isNull() ? KL_NO_LATE : (w["lateAfter"] | KL_NO_LATE),
                                 w["closes"] | uint16_t(0)};
  }
  const uint16_t r = doc["ignoreRepeatMinutes"] | uint16_t(0);
  repeatMinutes = (r == 1 || r == 3 || r == 5 || r == 10) ? r : 3;  // the app's allowed values; anything else: its default
  return true;
}
