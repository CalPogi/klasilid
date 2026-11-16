#include "http.h"
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include "roots.h"

int http::request(const Config& c, const char* method, const String& path, const char* body, size_t len, String& response) {
  const String url = c.server + path;
  // https only, certificate checked: the device key travels in a header (review I1). Never setInsecure().
  if (!url.startsWith("https://")) return -1;
  WiFiClientSecure secure;
  secure.setCACert(KL_ROOT_CAS);
  HTTPClient h;
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
  h.end();
  return code;
}
