#include "display.h"
#include <U8g2lib.h>
#include <math.h>
#include <qrcode.h>
#include <stdio.h>
#include <string.h>
#include "messages.h"

// Positions are the boards' pixels (128 × 64). Rows 0–15 hold only the status bar or a full-screen flash: on
// yellow-and-blue panels those rows are always yellow.
static U8G2_SSD1306_128X64_NONAME_F_2ND_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);  // Wire1: the screen's own bus

#define LABEL u8g2_font_5x8_tf        // small capitals; has the middle dot
#define CLOCK u8g2_font_logisoso26_tn // digits and ':'
#define CLOCK_DIM u8g2_font_logisoso20_tr
#define NAME_BIG u8g2_font_helvB18_tf
#define NAME_SMALL u8g2_font_helvB12_tf
#define TITLE u8g2_font_helvB10_tf
#define BRAND u8g2_font_helvB14_tf
#define SMALLNAME u8g2_font_helvB08_tf

static float easeOut(float t) { return 1 - (1 - t) * (1 - t) * (1 - t); }
static float easeInOut(float t) { return t < .5f ? 4 * t * t * t : 1 - powf(-2 * t + 2, 3) / 2; }

static void centered(const char* s, int y) {
  const int w = oled.getUTF8Width(s);
  oled.drawUTF8(w < 128 ? (128 - w) / 2 : 0, y, s);
}

// A thick line with round ends: discs along it (U8g2 has only 1-pixel lines).
static void thick(int x0, int y0, int x1, int y1, int w) {
  const int n = max(abs(x1 - x0), abs(y1 - y0));
  for (int i = 0; i <= n; i++) {
    const int x = x0 + (x1 - x0) * i / max(n, 1), y = y0 + (y1 - y0) * i / max(n, 1);
    oled.drawDisc(x, y, w / 2);
  }
}

// ---- status bar (rows 0–15) ----
static void wifiIcon(Wifi w) {
  switch (w) {
    case Wifi::Strong: oled.drawBox(117, 7, 2, 2); oled.drawBox(120, 5, 2, 4); oled.drawBox(123, 2, 2, 7); break;
    case Wifi::Fair: oled.drawBox(117, 7, 2, 2); oled.drawBox(120, 5, 2, 4); oled.drawBox(123, 8, 2, 1); break;
    case Wifi::Weak: oled.drawBox(117, 7, 2, 2); oled.drawBox(120, 8, 2, 1); oled.drawBox(123, 8, 2, 1); break;
    case Wifi::Hotspot:
      oled.drawBox(121, 4, 2, 2); oled.drawVLine(119, 3, 4); oled.drawVLine(124, 3, 4); oled.drawVLine(117, 2, 6); oled.drawVLine(126, 2, 6);
      break;
    case Wifi::None:
      oled.drawBox(117, 8, 2, 1); oled.drawBox(120, 8, 2, 1);
      oled.drawLine(122, 1, 127, 6); oled.drawLine(127, 1, 122, 6);
      break;
  }
}

static void upArrow(int x, int y) {  // tip at (x, y), 7 rows tall
  oled.drawTriangle(x, y, x + 3, y + 3, x - 3, y + 3);
  oled.drawBox(x - 1, y + 3, 2, 4);
}

static void statusBar(const View& v, int dy) {
  oled.setFont(LABEL);
  oled.drawUTF8(2, 9 + dy, v.clockValid ? v.date : "-- --- ---");
  wifiIcon(v.wifi);
  int right = 112;  // the slot left of Wi-Fi ends here
  if (!v.clockValid) {  // clock warning replaces count and arrow
    oled.drawCircle(105, 5, 3);
    oled.drawPixel(105, 4); oled.drawPixel(105, 5); oled.drawPixel(106, 5);
    oled.drawVLine(111, 2, 4); oled.drawPixel(111, 8);
    return;
  }
  if (v.keyRejected) {  // key replaces the arrow
    oled.drawCircle(101, 5, 2);
    oled.drawHLine(103, 5, 6); oled.drawVLine(107, 5, 3); oled.drawVLine(105, 5, 2);
    oled.drawLine(109, 1, 111, 3); oled.drawLine(111, 1, 109, 3);
    right = 96;
  } else if (v.unsent > 0) {
    upArrow(108, (v.uploading && (millis() / 1000) % 2) ? 1 : 2);  // the arrow steps while an upload runs
    right = 104;
  }
  if (v.unsent > 0) {
    char n[8];
    snprintf(n, sizeof n, "%lu", static_cast<unsigned long>(v.unsent));
    oled.drawUTF8(right - oled.getUTF8Width(n), 9 + dy, n);
  }
}

// ---- idle: the clock and the "Tap your card" button ----
static void cardIcon(int x, int y) { oled.drawRFrame(x, y, 10, 7, 1); oled.drawHLine(x + 1, y + 2, 8); }

static void button(const View& v, const Frame& f, int dy) {
  oled.drawRFrame(10, 50 + dy, 108, 13, 6);
  oled.setClipWindow(11, 51 + dy, 117, 62 + dy);
  oled.setFont(LABEL);
  const bool toProblem = !f.showProblem;  // rolling from the tap text to the problem, or back
  const float r = easeInOut(f.msgRoll);
  const int up = static_cast<int>(roundf(r * 12));
  const auto tapText = [&](int y) {
    const int nudge = (millis() / 1000) % 2 ? 1 : -2;  // the card glides toward the reader once a second
    cardIcon(18 + nudge, y - 7);
    if (nudge > 0) { oled.drawVLine(31, y - 6, 3); oled.drawVLine(34, y - 7, 5); }
    oled.drawUTF8(38, y, KL_MSG_BTN_TAP);
  };
  const auto problemLine = [&](int y) {
    const char* t = problemText(v.problem);
    oled.drawUTF8((128 - oled.getUTF8Width(t)) / 2, y, t);
  };
  const int y = 60 + dy;
  if (f.msgRoll == 0) {
    if (f.showProblem) problemLine(y);
    else tapText(y);
  } else if (toProblem) {
    tapText(y - up);
    problemLine(y + 12 - up);
  } else {
    problemLine(y - up);
    tapText(y + 12 - up);
  }
  oled.setMaxClipWindow();
}

static void clockFace(const View& v, const Frame& f, int dx, int dy) {
  oled.setFont(CLOCK);
  const char* c = v.clockValid ? v.clock : "--:--";
  // This font's ':' is wide; set it 3 px tighter on each side, as on the board ("7:12", not "7: 12").
  constexpr int kTight = 3;
  const char* colon = strchr(c, ':');
  char hours[4] = {0}, mins[4] = {0};
  memcpy(hours, c, colon - c);
  strcpy(mins, colon + 1);
  char last[2] = {mins[strlen(mins) - 1], 0};
  mins[strlen(mins) - 1] = 0;
  const int wH = oled.getStrWidth(hours), wC = oled.getStrWidth(":"), wM = oled.getStrWidth(mins);
  const int wHead = wH + wC - 2 * kTight + wM, wLast = oled.getStrWidth(last);
  const int x = 60 - (wHead + wLast) / 2 + dx, y = 44 + dy;
  oled.drawStr(x, y, hours);
  oled.drawStr(x + wH - kTight, y, ":");
  oled.drawStr(x + wH + wC - 2 * kTight, y, mins);
  if (f.digitRoll > 0 && v.clockValid) {  // the old digit rolls up out of its cell, the new one rolls in
    const int up = static_cast<int>(roundf(easeInOut(f.digitRoll) * 30));
    char prev[2] = {static_cast<char>(last[0] == '0' ? '9' : last[0] - 1), 0};
    oled.setClipWindow(x + wHead, 16 + dy, x + wHead + wLast + 2, 46 + dy);
    oled.drawStr(x + wHead, y - up, prev);
    oled.drawStr(x + wHead, y + 30 - up, last);
    oled.setMaxClipWindow();
  } else {
    oled.drawStr(x + wHead, y, last);
  }
  if (v.clockValid) {
    oled.setFont(LABEL);
    oled.drawUTF8(x + wHead + wLast + 3, 25 + dy, v.pm ? "PM" : "AM");
  }
}

static void idleScene(const View& v, const Frame& f, int dy) {
  statusBar(v, dy);
  clockFace(v, f, f.driftX, dy + f.driftY);
  button(v, f, dy);
}

static void dimScene(const View& v, const Frame& f) {
  oled.setFont(CLOCK_DIM);
  char t[12];
  snprintf(t, sizeof t, "%s %s", v.clockValid ? v.clock : "--:--", v.pm ? "PM" : "AM");
  const int w = oled.getStrWidth(t);
  oled.drawStr((128 - w) / 2 + f.driftX - 3, 35 + f.driftY - 3, t);
  if (v.opens[0]) {
    oled.setFont(LABEL);
    char o[24];
    snprintf(o, sizeof o, "OPENS %s", v.opens);
    oled.drawUTF8((128 - oled.getUTF8Width(o)) / 2 + f.driftX - 3, 51 + f.driftY - 3, o);
  }
}

// ---- tap results ----
static void bigIcon(Result r) {  // drawn in black on the lit flash
  oled.setDrawColor(0);
  if (r == Result::Late) {
    for (int i = 0; i < 5; i++) oled.drawCircle(64, 32, 17 + i);
    thick(64, 22, 64, 33, 4);
    thick(64, 33, 73, 33, 4);
  } else if (r == Result::Unknown) {
    thick(50, 18, 78, 46, 7);
    thick(78, 18, 50, 46, 7);
  } else {
    thick(44, 33, 57, 45, 7);
    thick(57, 45, 85, 18, 7);
  }
  oled.setDrawColor(1);
}

static void bandContent(const View& v, Result r, bool outlined, int dy) {
  if (outlined) oled.drawRFrame(2, 49 + dy, 124, 14, 4);
  else oled.drawRBox(2, 49 + dy, 124, 14, 4);
  oled.setFont(LABEL);
  oled.setDrawColor(outlined ? 1 : 0);
  const int w = oled.getUTF8Width(v.band);
  const bool icon = !outlined && (r == Result::OnTime || r == Result::Late);
  const int x = (128 - w - (icon ? 10 : 0)) / 2;
  if (r == Result::OnTime) { oled.drawLine(x, 56 + dy, x + 2, 58 + dy); oled.drawLine(x + 2, 58 + dy, x + 6, 54 + dy); }
  if (r == Result::Late) { oled.drawCircle(x + 3, 56 + dy, 3); oled.drawVLine(x + 3, 54 + dy, 2); oled.drawPixel(x + 4, 56 + dy); }
  oled.drawUTF8(x + (icon ? 10 : 0), 60 + dy, v.band);
  oled.setDrawColor(1);
}

static void nameLines(const View& v, Result r, int dy) {
  if (r == Result::Unknown) {
    oled.setFont(NAME_SMALL);
    centered("Card not", 29 + dy);
    centered("registered", 43 + dy);
    return;
  }
  // fitName chose the face by letters; a wide name can still overflow 124 px, so step down and cut by width.
  char n[28];
  strcpy(n, v.name);
  oled.setFont(v.face == NameFace::Big ? NAME_BIG : NAME_SMALL);
  if (oled.getUTF8Width(n) > 124) oled.setFont(NAME_SMALL);
  if (oled.getUTF8Width(n) > 124) oled.setFont(TITLE);
  while (oled.getUTF8Width(n) > 124 && strlen(n) > 4) {
    char* end = n + strlen(n) - (strstr(n, "...") ? 4 : 1);  // drop one letter before the "..."
    while (end > n && (static_cast<uint8_t>(*end) & 0xC0) == 0x80) end--;
    strcpy(end, "...");
  }
  centered(n, (v.face == NameFace::Big ? 38 : 36) + dy);
}

// The result screen, moved up by `lift` px (Leave) and with the name `rise` px below its place (Rise).
static void resultScene(const View& v, Result r, bool repeat, int lift, int rise) {
  statusBar(v, -lift);
  oled.setClipWindow(0, 14 - lift < 0 ? 0 : 14 - lift, 127, 47 - lift < 0 ? 0 : 47 - lift);
  nameLines(v, r, rise - lift);
  oled.setMaxClipWindow();
  bandContent(v, r, repeat, -lift);
}

static void tapScene(const View& v, const Frame& f) {
  const bool repeat = f.scene == Scene::Repeat;
  switch (f.phase) {
    case Phase::Grow: {
      oled.drawDisc(64, 32, 8 + static_cast<int>(roundf(66 * easeOut(f.t))));
      bigIcon(f.result);
      break;
    }
    case Phase::Fold: {
      const float e = easeInOut(f.t);
      const int x = roundf(2 * e), y = roundf(49 * e), w = roundf(128 - 4 * e), h = roundf(64 - 50 * e);
      oled.drawRBox(x, y, w, h, roundf(4 * e));
      break;
    }
    case Phase::Rise: resultScene(v, f.result, repeat, 0, roundf(14 * (1 - easeOut(f.t)))); break;
    case Phase::Hold: resultScene(v, f.result, repeat, 0, 0); break;
    case Phase::Leave: {
      const int up = roundf(64 * easeInOut(f.t));
      resultScene(v, f.result, repeat, up, 0);
      Frame idle = f;
      idle.msgRoll = 0;
      idle.showProblem = false;
      idleScene(v, idle, 64 - up);
      break;
    }
    default: break;
  }
}

// ---- problems that stop taps ----
static void blockedScene(const View& v, const Frame& f) {
  const bool full = f.result == Result::Full;
  if (full) statusBar(v, 0);
  const int top = 19;
  oled.drawRBox(4, top, 24, 24, 5);
  oled.setDrawColor(0);
  if (full) { oled.drawFrame(9, top + 5, 14, 14); oled.drawBox(11, top + 7, 10, 4); oled.drawBox(11, top + 13, 10, 4); }
  else { thick(10, top + 6, 22, top + 18, 4); thick(22, top + 6, 10, top + 18, 4); }
  oled.setDrawColor(1);
  const char* title = full ? "Reader full" : "Storage error";
  oled.setFont(TITLE);
  if (oled.getUTF8Width(title) > 94) oled.setFont(SMALLNAME);  // the room right of the icon
  oled.drawUTF8(33, 30, title);
  oled.setFont(LABEL);
  oled.drawUTF8(33, 41, "TAP NOT SAVED");
  bandContent(v, f.result, false, 0);
}

// ---- setup: QR code to join the hotspot, and where to go ----
static void setupScene(const View& v) {
  char payload[64];
  snprintf(payload, sizeof payload, "WIFI:T:nopass;S:%s;;", v.hotspot ? v.hotspot : "");
  QRCode qr;
  uint8_t buf[qrcode_getBufferSize(3)];
  qrcode_initText(&qr, buf, 3, ECC_LOW, payload);  // version 3: 29 modules, 2 px each, 1-module light border
  oled.drawRBox(1, 1, 62, 62, 2);
  oled.setDrawColor(0);
  for (uint8_t y = 0; y < qr.size; y++)
    for (uint8_t x = 0; x < qr.size; x++)
      if (qrcode_getModule(&qr, x, y)) oled.drawBox(3 + x * 2, 3 + y * 2, 2, 2);
  oled.setDrawColor(1);
  oled.setFont(LABEL);
  oled.drawUTF8(67, 11, "SETUP");
  oled.setFont(SMALLNAME);
  const char* name = v.hotspot ? v.hotspot : "";
  const char* dash = strchr(name, '-');
  if (dash) {  // "Klasilid-" / "Diamond" on two lines
    char first[24];
    const size_t n = min(static_cast<size_t>(dash - name + 1), sizeof first - 1);
    memcpy(first, name, n);
    first[n] = 0;
    oled.drawUTF8(67, 24, first);
    oled.drawUTF8(67, 34, dash + 1);
  } else {
    oled.drawUTF8(67, 29, name);
  }
  oled.setFont(LABEL);
  oled.drawUTF8(67, 48, "THEN OPEN");
  oled.drawUTF8(67, 58, "192.168.4.1");
}

// ---- public ----
void display::begin() {
  oled.begin();  // Wire1 is already started on the screen's pins by main.cpp
  oled.enableUTF8Print();
  oled.sendF("ca", 0xD9, 0xF1);  // pre-charge: brightest
  oled.sendF("ca", 0xDB, 0x40);  // VCOMH: brightest
  oled.setContrast(255);
}

void display::bright(bool on) {
  static int last = -1;
  if (last == on) return;
  last = on;
  oled.setContrast(on ? 255 : 1);
}

void display::draw(const Frame& f, const View& v) {
  oled.clearBuffer();
  switch (f.scene) {
    case Scene::Idle: idleScene(v, f, 0); break;
    case Scene::Dim: dimScene(v, f); break;
    case Scene::Setup: setupScene(v); break;
    case Scene::Tap:
    case Scene::Repeat: tapScene(v, f); break;
    case Scene::Blocked: blockedScene(v, f); break;
  }
  oled.sendBuffer();
}

void display::boot(uint8_t step, uint8_t steps, float markT) {
  oled.clearBuffer();
  if (markT < 0.75f) {
    // The upright draws down, then the chevron draws in, centred (board "Start-up 1").
    const float a = min(markT / 0.35f, 1.0f), b = markT < 0.35f ? 0 : min((markT - 0.35f) / 0.4f, 1.0f);
    if (a > 0) thick(53, 19, 53, 19 + static_cast<int>(26 * easeOut(a)), 6);
    if (b > 0) {
      const float e = easeOut(b);
      thick(77, 19, 77 - static_cast<int>(15 * min(e * 2, 1.0f)), 19 + static_cast<int>(13 * min(e * 2, 1.0f)), 6);
      if (e > 0.5f) thick(62, 32, 62 + static_cast<int>(15 * (e - 0.5f) * 2), 32 + static_cast<int>(13 * (e - 0.5f) * 2), 6);
    }
  } else {
    // The mark at the left, the name wiping in (board "Start-up 2"), then the bar (board "Start-up 3").
    oled.drawBox(27, 19, 4, 19);
    thick(45, 20, 35, 28, 4);
    thick(35, 29, 45, 37, 4);
    oled.setFont(BRAND);
    const float w = step == 0 ? easeInOut(min((markT - 0.75f) / 0.25f, 1.0f)) : 1;
    oled.setClipWindow(52, 16, 52 + static_cast<int>(72 * w), 40);
    oled.drawUTF8(52, 34, "Klasilid");
    oled.setMaxClipWindow();
    if (step > 0) {
      oled.setFont(LABEL);
      centered("GETTING READY", 48);
      oled.drawRFrame(14, 52, 100, 8, 3);
      oled.drawBox(17, 55, 94 * step / steps, 2);
    }
  }
  oled.sendBuffer();
}
