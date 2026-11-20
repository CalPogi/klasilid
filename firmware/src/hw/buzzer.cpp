#include "buzzer.h"
#include <Arduino.h>
#include "pins.h"

static void level(bool on) { digitalWrite(PIN_BUZZER, on != BUZZER_ACTIVE_LOW ? HIGH : LOW); }
static void beep(uint32_t ms) {
  level(true);
  delay(ms);
  level(false);
}

void buzzer::begin() {
  pinMode(PIN_BUZZER, OUTPUT);
  level(false);
}
void buzzer::ok() { beep(80); }
void buzzer::unknown() {
  beep(80);
  delay(80);
  beep(80);
}
void buzzer::error() { beep(600); }
void buzzer::tick() { beep(15); }
