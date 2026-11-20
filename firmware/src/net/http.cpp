#include "http.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "roots.h"

// One TLS connection kept open between requests (all of them run on the network task): a new handshake with the
// certificate check took seconds on the ESP32, so every upload and class-list fetch waited that long.
// The HTTPClient is kept too: its destructor stops the client it used, which closed the connection after every
// request (review #2).
static WiFiClientSecure secure;
static HTTPClient h;

void http::reset() { secure.stop(); }

static int once(const Config& c, const char* method, const String& url, const char* body, size_t len, String& response) {
  h.setReuse(true);
  h.setConnectTimeout(10000);
  h.setTimeout(10000);
  if (!h.begin(secure, url)) return -1;
  h.addHeader("x-device-key", c.deviceKey);
  int code;
  if (strcmp(method, "POST") == 0) {
    h.addHeader("Content-Type", "application/json");
    code = h.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(body)), len);
  } else {
    code = h.GET();
  }
  if (code > 0) response = h.getString();
  h.end();  // keeps the connection open when the server allows it
  return code;
}

int http::request(const Config& c, const char* method, const String& path, const char* body, size_t len, String& response) {
  const String url = c.server + path;
  // https only, certificate checked: the device key travels in a header (review I1). Never setInsecure().
  if (!url.startsWith("https://")) return -1;
  static bool caSet = false;
  if (!caSet) secure.setCACert(KL_ROOT_CAS), caSet = true;
  const uint32_t t0 = millis();
  const bool warm = secure.connected();
  int code = once(c, method, url, body, len, response);
  if (code < 0 && warm) {  // the server closed the idle connection: start a fresh one and try again once
    secure.stop();
    code = once(c, method, url, body, len, response);
  }
  if (code < 0) secure.stop();
  Serial.printf("http %s %s: %d in %lu ms%s\n", method, path.substring(0, path.indexOf('?') < 0 ? path.length() : path.indexOf('?')).c_str(),
                code, static_cast<unsigned long>(millis() - t0), warm ? " (kept open)" : "");
  return code;
}
