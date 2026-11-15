#include "http.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "roots.h"

int http::request(const Config& c, const char* method, const String& path, const char* body, size_t len, String& response) {
  const String url = c.server + path;
  WiFiClientSecure secure;
  WiFiClient plain;  // http:// only for a server on the local network during development
  HTTPClient h;
  h.setConnectTimeout(10000);
  h.setTimeout(10000);
  bool ok;
  if (url.startsWith("https://")) {
    secure.setCACert(KL_ROOT_CAS);  // certificates are checked; never setInsecure() (the key travels in a header)
    ok = h.begin(secure, url);
  } else {
    ok = h.begin(plain, url);
  }
  if (!ok) return -1;
  h.addHeader("x-device-key", c.deviceKey);
  int code;
  if (strcmp(method, "POST") == 0) {
    h.addHeader("Content-Type", "application/json");
    code = h.POST(reinterpret_cast<uint8_t*>(const_cast<char*>(body)), len);
  } else {
    code = h.GET();
  }
  if (code > 0) response = h.getString();
  h.end();
  return code;
}
