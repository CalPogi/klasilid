#include "wifi.h"
#include "http.h"
#include <WiFi.h>
#include <esp_sntp.h>
#include <time.h>
#include "../hw/clock.h"
#include "timefmt.h"

static Config cfg;
static bool apOn = false;
static bool wasOnline = false;
static uint32_t lastOnlineMs = 0;
static uint32_t lastRetryMs = 0;

static void startHotspot() {
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(cfg.apName.c_str());  // open: the setup page asks for the pairing code once one is set
  apOn = true;
  Serial.printf("hotspot %s at %s\n", cfg.apName.c_str(), WiFi.softAPIP().toString().c_str());
}

void wifi::begin(const Config& c) {
  cfg = c;
  WiFi.persistent(false);  // the network lives in our own NVS namespace
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  lastOnlineMs = lastRetryMs = millis();
  if (cfg.ssid.isEmpty()) startHotspot();  // not set up yet
  else WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
}

void wifi::tick() {
  const bool on = WiFi.status() == WL_CONNECTED;
  const uint32_t now = millis();
  if (on) {
    lastOnlineMs = now;
    if (!wasOnline) {
      Serial.printf("wifi: connected to %s, %s\n", cfg.ssid.c_str(), WiFi.localIP().toString().c_str());
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      http::reset();  // a connection kept from before the drop would only time out (10 s) before the retry
      if (apOn) {  // back on the school network: close the open hotspot
        WiFi.softAPdisconnect(true);
        WiFi.mode(WIFI_STA);
        apOn = false;
      }
    }
  } else {
    if (!apOn && now - lastOnlineMs > 30000) startHotspot();
    if (!cfg.ssid.isEmpty() && now - lastRetryMs > 60000) {
      lastRetryMs = now;
      WiFi.disconnect();
      WiFi.begin(cfg.ssid.c_str(), cfg.pass.c_str());
    }
  }
  wasOnline = on;
  // The SNTP client resyncs on its own (hourly); copy every completed sync into the DS3231.
  if (sntp_get_sync_status() == SNTP_SYNC_STATUS_COMPLETED) {
    const uint32_t t = static_cast<uint32_t>(time(nullptr));
    if (clockLooksValid(t)) {
      rtc::set(t);
      Serial.println("clock synced from NTP");
    }
  }
}

bool wifi::online() { return WiFi.status() == WL_CONNECTED; }
int wifi::rssi() { return WiFi.RSSI(); }
bool wifi::hotspot() { return apOn; }
const char* wifi::state() { return online() ? "Wi-Fi" : apOn ? "Hotspot" : "No Wi-Fi"; }
const char* wifi::mode() { return apOn ? "ap+sta" : "sta"; }
