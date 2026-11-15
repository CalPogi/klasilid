#include "display.h"
#include <U8g2lib.h>
#include <stdio.h>

static U8G2_SSD1306_128X64_NONAME_F_HW_I2C oled(U8G2_R0, U8X8_PIN_NONE);

static void centered(const char* s, int y) {
  const int w = oled.getUTF8Width(s);
  oled.drawUTF8(w < 128 ? (128 - w) / 2 : 0, y, s);
}

void display::begin() {
  oled.begin();  // Wire is already started on the reader's pins by main.cpp
  oled.enableUTF8Print();
}

void display::idle(const char* timeText, const char* wifiState, uint32_t unsent, const char* note) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_6x12_tf);
  oled.drawUTF8(0, 10, wifiState);
  char q[16] = "";
  if (unsent) snprintf(q, sizeof q, "%lu to send", static_cast<unsigned long>(unsent));
  oled.drawUTF8(128 - oled.getUTF8Width(q), 10, q);
  oled.setFont(u8g2_font_helvB18_tf);
  centered(timeText, 38);
  oled.setFont(u8g2_font_6x12_tf);
  centered(note ? note : "Tap your card", 60);
  oled.sendBuffer();
}

void display::tap(const char* name, const char* status, const char* timeText) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_helvB12_tf);
  centered(name, 24);
  oled.setFont(u8g2_font_6x12_tf);
  centered(status, 44);
  centered(timeText, 60);
  oled.sendBuffer();
}

void display::message(const char* line1, const char* line2) {
  oled.clearBuffer();
  oled.setFont(u8g2_font_helvB12_tf);
  centered(line1, 28);
  oled.setFont(u8g2_font_6x12_tf);
  centered(line2, 50);
  oled.sendBuffer();
}
