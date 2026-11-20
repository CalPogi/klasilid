// On-board tests for the tap log on real flash (LittleFS). They format the filesystem.
// Run at bring-up: python -m platformio test -e esp32dev
#include <Arduino.h>
#include <LittleFS.h>
#include <stdio.h>
#include <unistd.h>
#include <unity.h>
#include "littlefs_storage.h"
#include "taplog.h"

static constexpr uint32_t kCap = 8192;

void setUp() {}
void tearDown() {}

// Review C1: a tap must be on flash well inside the 0.5 s feedback budget, even with a full-size log.
void test_add_is_fast_on_a_full_size_log() {
  LittleFsStorage s(kCap);
  TEST_ASSERT_TRUE(s.begin("/t"));
  TapLog log(s, kCap);
  log.begin();
  uint32_t slowest = 0, seq = 0;
  for (int i = 0; i < 30; i++) {
    const uint32_t t0 = millis();
    TEST_ASSERT_TRUE(log.add("04A1B2C3", 1794525002 + i, 0, seq) == TapLog::Add::Ok);
    const uint32_t ms = millis() - t0;
    if (ms > slowest) slowest = ms;
  }
  char msg[32];
  snprintf(msg, sizeof msg, "slowest add: %lu ms", static_cast<unsigned long>(slowest));
  TEST_MESSAGE(msg);
  // 250 ms: each save opens and closes its shard (a kept-open file went stale online, see below); with the beep
  // (80 ms) and the first screen frame (33 ms) that still leaves room inside the 500 ms from card to feedback.
  TEST_ASSERT_LESS_THAN_UINT32(250, slowest);
}

// Found on the first reader online: after an HTTPS request, the network code can close a descriptor number that the
// tap log's open shard file held (seek then fails with EBADF, errno 9), and every later tap wasn't saved. Closing
// descriptors behind the log's back stands in for that: the next save and read must still work.
void test_save_survives_its_file_being_closed_behind_its_back() {
  LittleFsStorage s(kCap);
  TEST_ASSERT_TRUE(s.begin("/tf"));  // its own log, so the other tests' counts stay as they are
  TapLog log(s, kCap);
  log.begin();
  uint32_t seq = 0;
  TEST_ASSERT_TRUE(log.add("04A1B2C3", 1794525002, 0, seq) == TapLog::Add::Ok);
  for (int fd = 3; fd < 64; fd++) ::close(fd);  // what a double close in the network code does to our file
  uint32_t seq2 = 0;
  TEST_ASSERT_TRUE(log.add("04B2C3D4", 1794525010, 0, seq2) == TapLog::Add::Ok);
  TapRec out[2];
  TEST_ASSERT_EQUAL(2, log.unsent(out, 2));
  log.markSent(&seq, 1);
  TEST_ASSERT_EQUAL(1, log.unsentCount());
}

// Review C1: marking one tap sent (what the uploader does per seq, holding the log mutex) is just as quick.
void test_mark_sent_one_is_fast() {
  LittleFsStorage s(kCap);
  TEST_ASSERT_TRUE(s.begin("/t"));
  TapLog log(s, kCap);
  log.begin();
  TapRec out[1];
  TEST_ASSERT_EQUAL(1, log.unsent(out, 1));
  const uint32_t t0 = millis();
  log.markSent(&out[0].seq, 1);
  TEST_ASSERT_LESS_THAN_UINT32(150, millis() - t0);
}

// Review M8 / Focus 1 on real flash: taps survive reopening, sent flags too, and seqs continue.
void test_taps_survive_reopen() {
  uint32_t before, unsentBefore;
  {
    LittleFsStorage s(kCap);
    TEST_ASSERT_TRUE(s.begin("/t"));
    TapLog log(s, kCap);
    log.begin();
    before = log.nextSeq();
    unsentBefore = log.unsentCount();
  }
  LittleFsStorage s(kCap);
  TEST_ASSERT_TRUE(s.begin("/t"));
  TapLog log(s, kCap);
  log.begin();
  TEST_ASSERT_EQUAL_UINT32(before, log.nextSeq());
  TEST_ASSERT_EQUAL(unsentBefore, log.unsentCount());
  TEST_ASSERT_EQUAL(29, unsentBefore);  // 30 added, 1 marked sent
}

// Bring-up finding: after a brownout the reader took 18 s to take taps again. Now ~4 s (one read-only open per
// shard); under 2 s needs a saved index of unsent taps (follow-up). The limit catches a slide back.
void test_begin_is_quick_on_a_full_size_log() {
  const uint32_t t0 = millis();
  LittleFsStorage s(kCap);
  TEST_ASSERT_TRUE(s.begin("/t"));
  TapLog log(s, kCap);
  log.begin();
  const uint32_t ms = millis() - t0;
  char msg[40];
  snprintf(msg, sizeof msg, "begin on an existing log: %lu ms", static_cast<unsigned long>(ms));
  TEST_MESSAGE(msg);
  TEST_ASSERT_EQUAL(29, log.unsentCount());
  TEST_ASSERT_LESS_THAN_UINT32(5000, ms);
}

void setup() {
  delay(2000);
  UNITY_BEGIN();
  TEST_ASSERT_TRUE(LittleFS.begin(true));
  LittleFS.format();
  RUN_TEST(test_add_is_fast_on_a_full_size_log);
  RUN_TEST(test_save_survives_its_file_being_closed_behind_its_back);
  RUN_TEST(test_mark_sent_one_is_fast);
  RUN_TEST(test_taps_survive_reopen);
  RUN_TEST(test_begin_is_quick_on_a_full_size_log);
  LittleFS.format();  // leave no test taps behind for the real firmware to upload
  UNITY_END();
}

void loop() {}
