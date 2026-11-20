#include "rosterfetch.h"
#include <LittleFS.h>
#include <time.h>
#include "../rostercache.h"
#include "http.h"
#include "roster.h"
#include "screen.h"
#include "timefmt.h"
#include "wifi.h"

static Config cfg;
static Card cards[120];
static Window windows[8];
static bool fetchedThisConnection = false;
static volatile uint32_t lastFetchMs = 0;  // checkSoon() (tap loop) sets it too
static Countdown checking;  // started by the tap loop (core 1), read here (core 0); safe across millis() wrap
static uint32_t savedHash = 0;  // of the class list last written to /roster.json

// The first fetch waits 1 s like the rest: the tap goes up first (uploader), and the app needs it before it can
// register the card.
void rosterfetch::checkSoon() {
  lastFetchMs = millis();
  checking.start(millis(), 20000);
}

bool rosterfetch::canFetch() {
  return wifi::online() && !cfg.server.isEmpty() && !cfg.deviceKey.isEmpty() &&
         clockLooksValid(static_cast<uint32_t>(time(nullptr)));
}

static uint32_t fnv1a(const String& s) {
  uint32_t h = 2166136261u;
  for (size_t i = 0; i < s.length(); i++) h = (h ^ static_cast<uint8_t>(s[i])) * 16777619u;
  return h;
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
  savedHash = fnv1a(json);
  Serial.printf("roster: cached copy %s\n", apply(json.c_str()) ? "loaded" : "unreadable");
}

void rosterfetch::begin(const Config& c) { cfg = c; }

void rosterfetch::tick() {
  if (!wifi::online()) {
    fetchedThisConnection = false;
    return;
  }
  if (!canFetch()) return;
  const uint32_t every = checking.running(millis()) ? 1000 : 10 * 60000;
  if (fetchedThisConnection && millis() - lastFetchMs < every) return;
  fetchedThisConnection = true;
  lastFetchMs = millis();
  String resp;
  const int code = http::request(cfg, "GET", "/functions/v1/roster?deviceId=" + cfg.deviceId, nullptr, 0, resp);
  if (code != 200 || !apply(resp.c_str())) {
    Serial.printf("roster: fetch failed (%d)\n", code);
    return;
  }
  // Written only when it changed (it's fetched every second while Checking), and whole or not at all: a power cut
  // mid-write left an unreadable copy and no names offline (review #3).
  const uint32_t hash = fnv1a(resp);
  if (hash == savedHash) return;
  fs::File f = LittleFS.open("/roster.tmp", "w");
  const bool whole = f && f.print(resp) == resp.length();
  if (f) f.close();
  if (whole && LittleFS.rename("/roster.tmp", "/roster.json")) savedHash = hash;
  Serial.println("roster: updated");
}
