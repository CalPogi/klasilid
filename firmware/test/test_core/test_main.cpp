// Unity tests for lib/core. They run on the ESP32: python -m platformio test -e esp32dev
#include <Arduino.h>
#include <unity.h>
#include "debounce.h"
#include "roster.h"
#include "timefmt.h"

void setUp() {}
void tearDown() {}

void test_iso_utc() { char b[21]; isoUtc(1794525002, b); TEST_ASSERT_EQUAL_STRING("2026-11-12T23:10:02Z", b); }
void test_clock_valid() { TEST_ASSERT_FALSE(clockLooksValid(946684805)); TEST_ASSERT_TRUE(clockLooksValid(KL_EARLIEST)); }  // Review Focus 5
void test_manila_minute() { TEST_ASSERT_EQUAL_UINT16(7 * 60 + 10, manilaMinute(1794525002)); }
void test_debounce_same_card_once() {  // Review Focus 4
  Debounce d(3);
  TEST_ASSERT_TRUE(d.accept("AB", 100));
  TEST_ASSERT_FALSE(d.accept("AB", 101));
  TEST_ASSERT_TRUE(d.accept("CD", 101));
  TEST_ASSERT_TRUE(d.accept("AB", 104));
}
void test_status_for() {
  Window w[] = {{'a', 'i', 390, 435, 480}};
  TEST_ASSERT_EQUAL_STRING("On time", statusFor(435, w, 1));
  TEST_ASSERT_EQUAL_STRING("Late", statusFor(436, w, 1));
  TEST_ASSERT_EQUAL_STRING("Recorded", statusFor(600, w, 1));
}

void setup() {
  delay(2000);  // let the serial monitor attach
  UNITY_BEGIN();
  RUN_TEST(test_iso_utc);
  RUN_TEST(test_clock_valid);
  RUN_TEST(test_manila_minute);
  RUN_TEST(test_debounce_same_card_once);
  RUN_TEST(test_status_for);
  UNITY_END();
}

void loop() {}
