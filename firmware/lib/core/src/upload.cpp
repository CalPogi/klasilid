#include "upload.h"
#include <ArduinoJson.h>
#include "timefmt.h"

size_t buildBody(const char* deviceId, const TapRec* recs, size_t n, char* out, size_t cap) {
  JsonDocument doc;
  doc["deviceId"] = deviceId;
  JsonArray taps = doc["taps"].to<JsonArray>();
  for (size_t i = 0; i < n; i++) {
    JsonObject t = taps.add<JsonObject>();
    t["seq"] = recs[i].seq;
    t["cardUid"] = recs[i].uid;
    char at[21];
    isoUtc(recs[i].unix, at);  // sent even when the clock looks wrong: the server flags it (spec §8)
    t["tappedAt"] = at;        // char* (not const): ArduinoJson copies it
    if (recs[i].syncedUnix == 0) {
      t["clockSyncedAt"] = nullptr;
    } else {
      char synced[21];
      isoUtc(recs[i].syncedUnix, synced);
      t["clockSyncedAt"] = synced;
    }
  }
  if (doc.overflowed() || measureJson(doc) + 1 > cap) return 0;
  return serializeJson(doc, out, cap);
}

size_t parseAck(const char* json, uint32_t* seqsOut, size_t max) {
  JsonDocument doc;
  if (deserializeJson(doc, json)) return 0;
  size_t n = 0;
  for (const char* key : {"acked", "rejected"}) {
    for (JsonVariant v : doc[key].as<JsonArray>()) {
      if (n == max) return n;
      if (v.is<uint32_t>()) seqsOut[n++] = v.as<uint32_t>();
    }
  }
  return n;
}
