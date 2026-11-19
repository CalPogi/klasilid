#include "rosterfetch.h"
#include <LittleFS.h>
#include <time.h>
#include "../rostercache.h"
#include "http.h"
#include "roster.h"
#include "timefmt.h"
#include "wifi.h"

static Config cfg;
static Card cards[120];
static Window windows[8];
static bool fetchedThisConnection = false;
static uint32_t lastFetchMs = 0;
static volatile uint32_t checkUntilMs = 0;  // set by the tap loop (core 1), read here (core 0)
static volatile bool checkNow = false;

void rosterfetch::checkSoon() {
  checkUntilMs = millis() + 20000;
  checkNow = true;
}

static bool apply(const char* json) {
  size_t nc = 0, nw = 0;
  uint16_t repeat = 3;
  if (!parseRoster(json, cards, 120, nc, windows, 8, nw, repeat)) return false;
  rostercache::set(cards, nc, windows, nw, repeat);
  return true;
}

void rosterfetch::loadCached() {
  fs::File f = LittleFS.open("/roster.json", "r");
  if (!f) return;
  const String json = f.readString();
  f.close();
  Serial.printf("roster: cached copy %s\n", apply(json.c_str()) ? "loaded" : "unreadable");
}

void rosterfetch::begin(const Config& c) { cfg = c; }

void rosterfetch::tick() {
  if (!wifi::online()) {
    fetchedThisConnection = false;
    return;
  }
  if (cfg.server.isEmpty() || cfg.deviceKey.isEmpty() || !clockLooksValid(static_cast<uint32_t>(time(nullptr)))) return;
  const bool checking = static_cast<int32_t>(checkUntilMs - millis()) > 0;
  const uint32_t every = checking ? 3000 : 10 * 60000;
  if (fetchedThisConnection && !checkNow && millis() - lastFetchMs < every) return;
  checkNow = false;
  fetchedThisConnection = true;
  lastFetchMs = millis();
  String resp;
  const int code = http::request(cfg, "GET", "/functions/v1/roster?deviceId=" + cfg.deviceId, nullptr, 0, resp);
  if (code != 200 || !apply(resp.c_str())) {
    Serial.printf("roster: fetch failed (%d)\n", code);
    return;
  }
  fs::File f = LittleFS.open("/roster.json", "w");
  if (f) {
    f.print(resp);
    f.close();
  }
  Serial.println("roster: updated");
}
