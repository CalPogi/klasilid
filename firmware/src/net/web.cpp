#include "web.h"
#include <ArduinoJson.h>
#include <WebServer.h>
#include <WiFi.h>
#include <time.h>
#include "../app.h"
#include "../hw/clock.h"
#include "timefmt.h"
#include "upload.h"
#include "uploader.h"
#include "wifi.h"

static const char* FIRMWARE = "0.1.0";
static WebServer server(80);
static Config cfg;
static uint32_t restartAtMs = 0;

static String esc(const String& s) {
  String o;
  o.reserve(s.length() + 8);
  for (char ch : s) {
    if (ch == '&') o += "&amp;";
    else if (ch == '<') o += "&lt;";
    else if (ch == '>') o += "&gt;";
    else if (ch == '"') o += "&quot;";
    else if (ch == '\'') o += "&#39;";
    else o += ch;
  }
  return o;
}

static String page(const String& body) {
  return String(F("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>"
                  "<title>Klasilid reader</title><style>"
                  "body{font-family:system-ui,sans-serif;margin:0;background:#FFF8F2;color:#2B2118}"
                  "main{max-width:420px;margin:0 auto;padding:20px 16px}"
                  "h1{font-size:20px;color:#B04A00;margin:0 0 4px}p{margin:0 0 16px;color:#6B5B4E}"
                  "label{display:block;font-weight:600;font-size:14px;margin:14px 0 6px}"
                  "input,select{width:100%;box-sizing:border-box;padding:10px 12px;font-size:16px;border:1px solid #E5D3C3;border-radius:10px;background:#fff}"
                  "button{margin-top:20px;width:100%;padding:12px;font-size:16px;font-weight:600;color:#fff;background:#FF7A1A;border:0;border-radius:10px}"
                  ".err{color:#B42318;font-weight:600}.hint{font-size:13px;color:#8A7A6D;margin-top:4px}"
                  "</style></head><body><main>")) +
         body + F("</main></body></html>");
}

static void sendPairing(const char* error) {
  String b = F("<h1>Klasilid reader</h1><p>Enter the pairing code to change this reader's settings.</p>");
  if (error) b += String("<p class=err>") + error + "</p>";
  b += F("<form method=post action='/'><label for=code>Pairing code</label>"
         "<input id=code name=code inputmode=numeric autocomplete=off required><button>Continue</button></form>");
  server.send(error ? 401 : 200, "text/html", page(b));
}

static void sendSetup(const String& code, const char* error) {
  String b = F("<h1>Klasilid reader setup</h1><p>Reader ");
  b += esc(cfg.deviceId.isEmpty() ? String("not set up yet") : cfg.deviceId) + "</p>";
  if (error) b += String("<p class=err>") + error + "</p>";
  b += F("<form method=post action='/setup'><input type=hidden name=code value='");
  b += esc(code) + F("'><label for=ssid>Wi-Fi network</label><select id=ssid name=ssid onchange=\"o.hidden=this.value!='__other__'\">");
  const int n = WiFi.scanNetworks();  // a few seconds; only when the page is opened
  bool savedListed = false;
  for (int i = 0; i < n; i++) {
    const String s = WiFi.SSID(i);
    if (s.isEmpty()) continue;
    const bool sel = s == cfg.ssid;
    savedListed |= sel;
    b += "<option value='" + esc(s) + "'" + (sel ? " selected" : "") + ">" + esc(s) + "</option>";
  }
  WiFi.scanDelete();
  if (!cfg.ssid.isEmpty() && !savedListed) b += "<option value='" + esc(cfg.ssid) + "' selected>" + esc(cfg.ssid) + "</option>";
  b += F("<option value='__other__'>Other…</option></select>"
         "<input id=o name=ssidOther placeholder='Network name' hidden style='margin-top:8px'>"
         "<label for=pass>Wi-Fi password</label><input id=pass name=pass type=password autocomplete=off>"
         "<div class=hint>Leave empty to keep the saved password.</div>"
         "<label for=server>Server address</label><input id=server name=server placeholder='https://xxxx.supabase.co' value='");
  b += esc(cfg.server) + F("'><label for=deviceId>Reader ID</label><input id=deviceId name=deviceId placeholder='KD-0001' value='");
  b += esc(cfg.deviceId) + F("'><label for=deviceKey>Reader key</label><input id=deviceKey name=deviceKey type=password autocomplete=off>"
                             "<div class=hint>Leave empty to keep the saved key.</div>"
                             "<label for=pairToken>Pairing code</label><input id=pairToken name=pairToken inputmode=numeric autocomplete=off value='");
  b += esc(cfg.pairToken.isEmpty() ? String("") : code) + F("'><button>Save</button></form>");
  server.send(error ? 400 : 200, "text/html", page(b));
}

static bool unlocked(const String& code) { return cfg.pairToken.isEmpty() || config::tokenMatches(cfg, code); }

static void wrongCode() {
  delay(1000);  // slows down guessing the 8-digit code
  sendPairing("Wrong pairing code");
}

static void handleRoot() {
  if (cfg.pairToken.isEmpty()) sendSetup("", nullptr);
  else sendPairing(nullptr);
}

static void handleUnlock() {
  const String code = server.arg("code");
  if (!unlocked(code)) return wrongCode();
  sendSetup(code, nullptr);
}

static bool digitsOnly(const String& s) {
  for (char ch : s)
    if (ch < '0' || ch > '9') return false;
  return true;
}

static void handleSave() {
  const String code = server.arg("code");
  if (!unlocked(code)) return wrongCode();
  Config c = cfg;
  c.ssid = server.arg("ssid") == "__other__" ? server.arg("ssidOther") : server.arg("ssid");
  if (server.arg("pass").length()) c.pass = server.arg("pass");
  c.server = server.arg("server");
  c.server.trim();
  while (c.server.endsWith("/")) c.server.remove(c.server.length() - 1);
  c.deviceId = server.arg("deviceId");
  c.deviceId.trim();
  c.deviceId.toUpperCase();
  if (server.arg("deviceKey").length()) c.deviceKey = server.arg("deviceKey");
  c.deviceKey.trim();
  c.pairToken = server.arg("pairToken");
  c.pairToken.trim();

  const char* error = nullptr;
  if (c.ssid.isEmpty()) error = "Choose a Wi-Fi network";
  else if (!c.server.startsWith("https://") && !c.server.startsWith("http://")) error = "The server address starts with https://";
  else if (c.deviceId.length() != 7 || !c.deviceId.startsWith("KD-") || !digitsOnly(c.deviceId.substring(3))) error = "The reader ID looks like KD-0001";
  else if (c.deviceKey.isEmpty()) error = "Enter the reader key";
  else if (c.pairToken.length() != 8 || !digitsOnly(c.pairToken)) error = "The pairing code has 8 digits";
  if (error) return sendSetup(code, error);

  config::save(c);
  server.send(200, "text/html", page(F("<h1>Saved</h1><p>Saved. The reader restarts and joins the Wi-Fi.</p>")));
  restartAtMs = millis() + 1500;  // let the response reach the phone first
}

static bool apiAllowed() {
  if (config::tokenMatches(cfg, server.header("x-pairing-token"))) return true;
  server.send(401, "application/json", "{\"error\":\"unauthorized\"}");
  return false;
}

static void handleStatus() {
  if (!apiAllowed()) return;
  JsonDocument doc;
  char t[21];
  const uint32_t now = rtc::now();
  doc["deviceId"] = cfg.deviceId;
  doc["firmware"] = FIRMWARE;
  isoUtc(now, t);
  doc["time"] = t;
  doc["clockOk"] = clockLooksValid(now);
  if (rtc::lastSync()) {
    char s[21];
    isoUtc(rtc::lastSync(), s);
    doc["lastSync"] = s;
  } else {
    doc["lastSync"] = nullptr;
  }
  xSemaphoreTake(logMutex, portMAX_DELAY);
  doc["unsent"] = tapLog.unsentCount();
  xSemaphoreGive(logMutex);
  if (uploader::lastUploadAt()) {
    char u[21];
    isoUtc(uploader::lastUploadAt(), u);
    doc["lastUploadAt"] = u;
  } else {
    doc["lastUploadAt"] = nullptr;
  }
  JsonObject w = doc["wifi"].to<JsonObject>();
  w["ssid"] = cfg.ssid;
  w["rssi"] = wifi::online() ? WiFi.RSSI() : 0;
  w["mode"] = wifi::mode();
  String out;
  serializeJson(doc, out);
  server.send(200, "application/json", out);
}

static void handleTaps() {
  if (!apiAllowed()) return;
  static constexpr size_t kMax = 200;
  const uint32_t since = strtoul(server.arg("since").c_str(), nullptr, 10);
  TapRec* recs = new TapRec[kMax];
  xSemaphoreTake(logMutex, portMAX_DELAY);
  const size_t n = tapLog.since(since, recs, kMax);
  xSemaphoreGive(logMutex);
  const size_t cap = kMax * 130 + 64;
  char* body = new char[cap];
  const size_t len = buildBody(cfg.deviceId.c_str(), recs, n, body, cap);  // same shape as the upload body
  if (len) server.send(200, "application/json", body);
  else server.send(500, "application/json", "{\"error\":\"too large\"}");
  delete[] body;
  delete[] recs;
}

void web::begin(const Config& c) {
  cfg = c;
  const char* headers[] = {"x-pairing-token"};
  server.collectHeaders(headers, 1);
  server.on("/", HTTP_GET, handleRoot);
  server.on("/", HTTP_POST, handleUnlock);
  server.on("/setup", HTTP_POST, handleSave);
  server.on("/status", HTTP_GET, handleStatus);
  server.on("/taps", HTTP_GET, handleTaps);
  server.onNotFound([] { server.send(404, "text/plain", "Not found"); });
  server.begin();
}

void web::tick() {
  server.handleClient();
  if (restartAtMs && static_cast<int32_t>(millis() - restartAtMs) >= 0) ESP.restart();
}
