#include "uploader.h"
#include <atomic>
#include <time.h>
#include "../app.h"
#include "http.h"
#include "timefmt.h"
#include "upload.h"
#include "wifi.h"

static constexpr size_t kBatch = 100;  // the server takes up to 500
static Config cfg;
static TapRec recs[kBatch];
static char body[kBatch * 130];  // ~105 bytes per tap in JSON
static uint32_t seqs[kBatch];
static std::atomic<bool> kicked{false};
static std::atomic<bool> keyRejected{false};
static uint32_t nextAtMs = 0;
static int failures = 0;
static std::atomic<uint32_t> lastOkUnix{0};

void uploader::begin(const Config& c) { cfg = c; }
void uploader::kick() { kicked = true; }
uint32_t uploader::lastUploadAt() { return lastOkUnix; }
const char* uploader::note() { return keyRejected ? "Reader key not accepted" : nullptr; }

void uploader::tick() {
  if (cfg.server.isEmpty() || cfg.deviceKey.isEmpty() || !wifi::online()) return;
  // Without a real date TLS can't check the server's certificate; NTP fixes this right after connecting.
  if (!clockLooksValid(static_cast<uint32_t>(time(nullptr)))) return;
  const bool due = static_cast<int32_t>(millis() - nextAtMs) >= 0;
  if (!due && !(kicked && failures == 0 && !keyRejected)) return;
  kicked = false;

  xSemaphoreTake(logMutex, portMAX_DELAY);
  const size_t n = tapLog.unsent(recs, kBatch);
  xSemaphoreGive(logMutex);
  if (n == 0) {
    nextAtMs = millis() + 10000;
    return;
  }
  const size_t len = buildBody(cfg.deviceId.c_str(), recs, n, body, sizeof body);
  String resp;
  const int code = len ? http::request(cfg, "POST", "/functions/v1/tap", body, len, resp) : -1;
  if (code == 200) {
    const size_t m = parseAck(resp.c_str(), seqs, kBatch);
    xSemaphoreTake(logMutex, portMAX_DELAY);
    tapLog.markSent(seqs, m);
    xSemaphoreGive(logMutex);
    failures = 0;
    keyRejected = false;
    lastOkUnix = static_cast<uint32_t>(time(nullptr));
    nextAtMs = millis() + (n == kBatch ? 0 : 10000);  // a full batch means more are waiting
    Serial.printf("upload: %u sent, %u acked\n", static_cast<unsigned>(n), static_cast<unsigned>(m));
  } else if (code == 401) {
    keyRejected = true;
    nextAtMs = millis() + 5 * 60000;
    Serial.println("upload: reader key not accepted");
  } else {
    static const uint32_t backoff[] = {10, 30, 60, 120, 300};  // seconds
    nextAtMs = millis() + backoff[failures < 4 ? failures : 4] * 1000;
    failures++;
    Serial.printf("upload failed (%d), retrying later\n", code);
  }
}
