// Unity tests for lib/core. They run on the ESP32: python -m platformio test -e esp32dev
#include <Arduino.h>
#include <unity.h>
#include "debounce.h"
#include "messages.h"
#include "roster.h"
#include "setupcheck.h"
#include "taplog.h"
#include "timefmt.h"
#include "upload.h"
#include <stdio.h>
#include <string.h>

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

// ---- Task 3: tap log ----
static uint32_t addTap(TapLog& log, const char* uid, uint32_t unix = 1794525002) {
  uint32_t seq = 0;
  TEST_ASSERT_TRUE(log.add(uid, unix, 1794517200, seq) == TapLog::Add::Ok);
  return seq;
}

void test_add_then_unsent_oldest_first() {
  MemoryStorage s(16);
  TapLog log(s, 16);
  TEST_ASSERT_TRUE(log.begin());
  uint32_t a = addTap(log, "04A1B2C3", 100), b = addTap(log, "04B2C3D4", 200);
  TEST_ASSERT_EQUAL_UINT32(a + 1, b);
  TapRec out[4];
  TEST_ASSERT_EQUAL(2, log.unsent(out, 4));
  TEST_ASSERT_EQUAL_UINT32(a, out[0].seq);
  TEST_ASSERT_EQUAL_STRING("04A1B2C3", out[0].uid);
  TEST_ASSERT_EQUAL_UINT32(100, out[0].unix);
  TEST_ASSERT_EQUAL_UINT32(1794517200, out[0].syncedUnix);
  TEST_ASSERT_EQUAL_UINT32(b, out[1].seq);
  TEST_ASSERT_EQUAL(1, log.unsent(out, 1));  // respects max
}

void test_mark_sent_removes_exactly_those_and_repeats_are_harmless() {  // Review Focus 3
  MemoryStorage s(16);
  TapLog log(s, 16);
  log.begin();
  uint32_t a = addTap(log, "04A1B2C3"), b = addTap(log, "04B2C3D4"), c = addTap(log, "04C3D4E5");
  uint32_t ack[] = {a, c, 9999};  // 9999 was never sent: ignored
  log.markSent(ack, 3);
  log.markSent(ack, 3);
  TEST_ASSERT_EQUAL(1, log.unsentCount());
  TapRec out[4];
  TEST_ASSERT_EQUAL(1, log.unsent(out, 4));
  TEST_ASSERT_EQUAL_UINT32(b, out[0].seq);
}

void test_seq_survives_reboot() {
  MemoryStorage s(16);
  uint32_t last;
  {
    TapLog log(s, 16);
    log.begin();
    addTap(log, "04A1B2C3");
    last = addTap(log, "04B2C3D4");
    uint32_t ack[] = {last};
    log.markSent(ack, 1);
  }
  TapLog again(s, 16);
  TEST_ASSERT_TRUE(again.begin());
  TEST_ASSERT_EQUAL_UINT32(last + 1, again.nextSeq());
  TEST_ASSERT_EQUAL(1, again.unsentCount());  // the sent one stays sent after the reboot
  TEST_ASSERT_EQUAL_UINT32(last + 1, addTap(again, "04C3D4E5"));
}

void test_torn_unsent_record_is_ignored() {  // Review Focus 1: power cut while writing a tap never uploaded
  MemoryStorage s(16);
  uint32_t c;
  {
    TapLog log(s, 16);
    log.begin();
    addTap(log, "04A1B2C3");
    addTap(log, "04B2C3D4");
    c = addTap(log, "04C3D4E5");
  }
  s.corrupt(c % 16);
  TapLog again(s, 16);
  TEST_ASSERT_TRUE(again.begin());
  TEST_ASSERT_EQUAL(2, again.unsentCount());
  TapRec out[4];
  TEST_ASSERT_EQUAL(2, again.unsent(out, 4));
  TEST_ASSERT_EQUAL_STRING("04B2C3D4", out[1].uid);
}

void test_torn_uploaded_record_never_reuses_seq() {  // the server holds an uploaded seq; a torn mark-as-sent must not free it
  MemoryStorage s(16);
  uint32_t c;
  {
    TapLog log(s, 16);
    log.begin();
    addTap(log, "04A1B2C3");
    addTap(log, "04B2C3D4");
    c = addTap(log, "04C3D4E5");
    uint32_t ack[] = {c};
    log.markSent(ack, 1);
  }
  s.corrupt(c % 16);  // power cut in the middle of rewriting c as sent
  TapLog again(s, 16);
  TEST_ASSERT_TRUE(again.begin());
  TEST_ASSERT_TRUE(again.nextSeq() > c);
}

void test_tap_save_writes_no_meta_and_upload_saves_it_once() {  // a tap at the door is one flash write
  MemoryStorage s(16);
  TapLog log(s, 16);
  log.begin();
  uint32_t a = addTap(log, "04A1B2C3"), b = addTap(log, "04B2C3D4");
  TEST_ASSERT_EQUAL(0, s.metaWrites);
  log.markSent(&a, 1);
  log.markSent(&b, 1);  // the uploader marks one seq at a time
  TEST_ASSERT_EQUAL(1, s.metaWrites);
  addTap(log, "04C3D4E5");
  uint32_t c = log.nextSeq() - 1;
  log.markSent(&c, 1);
  TEST_ASSERT_EQUAL(2, s.metaWrites);
}

void test_lost_meta_write_never_reuses_seq() {  // Review Focus 1: power cut after the record, before the meta
  MemoryStorage s(16);
  uint32_t b;
  {
    TapLog log(s, 16);
    log.begin();
    addTap(log, "04A1B2C3");
    s.failMetaWrites = true;
    b = addTap(log, "04B2C3D4");
  }
  s.failMetaWrites = false;
  TapLog again(s, 16);
  again.begin();
  TEST_ASSERT_EQUAL_UINT32(b + 1, again.nextSeq());
  TEST_ASSERT_EQUAL(2, again.unsentCount());
}

void test_full_when_every_slot_is_unsent_and_sent_slots_are_reused() {  // Review Focus 2
  MemoryStorage s(4);
  TapLog log(s, 4);
  log.begin();
  uint32_t first = addTap(log, "04000001");
  addTap(log, "04000002");
  addTap(log, "04000003");
  addTap(log, "04000004");
  uint32_t seq = 0;
  TEST_ASSERT_TRUE(log.add("04000005", 1794525002, 0, seq) == TapLog::Add::Full);
  TEST_ASSERT_EQUAL(4, log.unsentCount());
  TapRec out[4];
  log.unsent(out, 4);
  TEST_ASSERT_EQUAL_STRING("04000001", out[0].uid);  // nothing unsent was overwritten
  uint32_t ack[] = {first};
  log.markSent(ack, 1);
  TEST_ASSERT_TRUE(log.add("04000005", 1794525002, 0, seq) == TapLog::Add::Ok);
  TEST_ASSERT_EQUAL_UINT32(first + 4, seq);  // a Full attempt does not use up a seq
  TEST_ASSERT_EQUAL(4, log.unsentCount());
}

// ---- Task 4: upload body and ack ----
static TapRec rec(uint32_t seq, const char* uid, uint32_t unix, uint32_t synced) {
  TapRec r;
  memset(&r, 0, sizeof r);
  r.seq = seq;
  r.unix = unix;
  r.syncedUnix = synced;
  strncpy(r.uid, uid, sizeof r.uid - 1);
  return r;
}

void test_body_matches_contract() {
  TapRec r[] = {rec(41, "04A1B2C3", 1794525002, 1794517200)};
  char out[512];
  size_t n = buildBody("KD-0001", r, 1, out, sizeof out);
  TEST_ASSERT_EQUAL_STRING(
      "{\"deviceId\":\"KD-0001\",\"taps\":[{\"seq\":41,\"cardUid\":\"04A1B2C3\",\"tappedAt\":\"2026-11-12T23:10:02Z\",\"clockSyncedAt\":\"2026-11-12T21:00:00Z\"}]}",
      out);
  TEST_ASSERT_EQUAL(strlen(out), n);
  TEST_ASSERT_EQUAL(0, buildBody("KD-0001", r, 1, out, 20));  // doesn't fit → 0
}

void test_never_synced_clock_sends_null() {  // Review Focus 5: RTC lost power, year 2000
  TapRec r[] = {rec(1, "04A1B2C3", 946684805, 0)};
  char out[512];
  buildBody("KD-0001", r, 1, out, sizeof out);
  TEST_ASSERT_NOT_NULL(strstr(out, "\"tappedAt\":\"2000-01-01T00:00:05Z\",\"clockSyncedAt\":null"));
}

void test_parse_ack_unions_acked_and_rejected() {
  uint32_t seqs[8];
  TEST_ASSERT_EQUAL(3, parseAck("{\"acked\":[1,2],\"rejected\":[3]}", seqs, 8));
  TEST_ASSERT_EQUAL_UINT32(1, seqs[0]);
  TEST_ASSERT_EQUAL_UINT32(2, seqs[1]);
  TEST_ASSERT_EQUAL_UINT32(3, seqs[2]);
  TEST_ASSERT_EQUAL(2, parseAck("{\"acked\":[1,2],\"rejected\":[3]}", seqs, 2));  // respects max
}

void test_parse_ack_bad_json_returns_zero() {
  uint32_t seqs[8];
  TEST_ASSERT_EQUAL(0, parseAck("{\"acked\":[1,", seqs, 8));
  TEST_ASSERT_EQUAL(0, parseAck("<html>502 Bad Gateway</html>", seqs, 8));
}

void test_partial_ack_leaves_the_rest_queued() {  // Review Focus 3
  MemoryStorage s(16);
  TapLog log(s, 16);
  log.begin();
  uint32_t a = addTap(log, "04A1B2C3");
  addTap(log, "04B2C3D4");
  addTap(log, "04C3D4E5");
  char ack[64];
  snprintf(ack, sizeof ack, "{\"acked\":[%lu],\"rejected\":[]}", static_cast<unsigned long>(a));
  uint32_t seqs[8];
  log.markSent(seqs, parseAck(ack, seqs, 8));
  TEST_ASSERT_EQUAL(2, log.unsentCount());
  log.markSent(seqs, parseAck(ack, seqs, 8));  // the same ack again
  TEST_ASSERT_EQUAL(2, log.unsentCount());
}

// ---- Task 6: local API history and roster parsing ----
void test_since_returns_sent_and_unsent_after_seq() {
  MemoryStorage s(16);
  TapLog log(s, 16);
  log.begin();
  uint32_t a = addTap(log, "04A1B2C3"), b = addTap(log, "04B2C3D4"), c = addTap(log, "04C3D4E5");
  log.markSent(&b, 1);
  TapRec out[4];
  TEST_ASSERT_EQUAL(2, log.since(a, out, 4));  // b (sent) and c (unsent), oldest first
  TEST_ASSERT_EQUAL_UINT32(b, out[0].seq);
  TEST_ASSERT_EQUAL_UINT32(c, out[1].seq);
  TEST_ASSERT_EQUAL(1, log.since(0, out, 1));  // respects max
  TEST_ASSERT_EQUAL_UINT32(a, out[0].seq);
  TEST_ASSERT_EQUAL(0, log.since(c, out, 4));
}

void test_parse_roster_maps_names_and_windows() {
  Card cards[4];
  Window w[4];
  size_t nc = 0, nw = 0;
  TEST_ASSERT_TRUE(parseRoster(
      "{\"cards\":[{\"uid\":\"04A1B2C3\",\"name\":\"Ana A.\"},{\"uid\":\"04B2C3D4\",\"name\":\"Maria Concepcion Josefina Z.\"}],"
      "\"windows\":[{\"session\":\"am\",\"kind\":\"in\",\"opens\":390,\"lateAfter\":435,\"closes\":480},"
      "{\"session\":\"pm\",\"kind\":\"out\",\"opens\":960,\"lateAfter\":null,\"closes\":1050}],\"ignoreRepeatMinutes\":3}",
      cards, 4, nc, w, 4, nw));
  TEST_ASSERT_EQUAL(2, nc);
  TEST_ASSERT_EQUAL_STRING("04A1B2C3", cards[0].uid);
  TEST_ASSERT_EQUAL_STRING("Ana A.", cards[0].name);
  TEST_ASSERT_EQUAL(23, strlen(cards[1].name));  // long names are cut, never overflow
  TEST_ASSERT_EQUAL(2, nw);
  TEST_ASSERT_EQUAL('a', w[0].session);
  TEST_ASSERT_EQUAL('i', w[0].kind);
  TEST_ASSERT_EQUAL_UINT16(435, w[0].lateAfter);
  TEST_ASSERT_EQUAL('p', w[1].session);
  TEST_ASSERT_EQUAL('o', w[1].kind);
  TEST_ASSERT_EQUAL_UINT16(KL_NO_LATE, w[1].lateAfter);
  TEST_ASSERT_EQUAL_UINT16(1050, w[1].closes);
}

void test_parse_roster_bad_json_is_false() {
  Card cards[2];
  Window w[2];
  size_t nc = 9, nw = 9;
  TEST_ASSERT_FALSE(parseRoster("{\"cards\":[", cards, 2, nc, w, 2, nw));
  TEST_ASSERT_FALSE(parseRoster("{\"error\":\"unauthorized\"}", cards, 2, nc, w, 2, nw));
}

// ---- Review I1: setup form checks and pairing-code lockout ----
void test_setup_needs_https_and_the_key_again_when_the_server_changes() {
  SetupForm ok{"SchoolWiFi", "https://abc.supabase.co", "KD-0001", "k3y", "12345678"};
  TEST_ASSERT_NULL(setupError(ok, "", false));
  TEST_ASSERT_NULL(setupError(ok, "https://abc.supabase.co", false));  // same server: the saved key is kept
  SetupForm http = ok;
  http.server = "http://192.168.1.50";
  TEST_ASSERT_EQUAL_STRING("The server address starts with https://", setupError(http, "", true));
  TEST_ASSERT_EQUAL_STRING("Type the reader key again when you change the server",
                           setupError(ok, "https://old.supabase.co", false));
  TEST_ASSERT_NULL(setupError(ok, "https://old.supabase.co", true));
  SetupForm bad = ok;
  bad.ssid = "";
  TEST_ASSERT_EQUAL_STRING("Choose a Wi-Fi network", setupError(bad, "", true));
  bad = ok;
  bad.deviceId = "KD-12";
  TEST_ASSERT_EQUAL_STRING("The reader ID looks like KD-0001", setupError(bad, "", true));
  bad = ok;
  bad.deviceKey = "";
  TEST_ASSERT_EQUAL_STRING("Enter the reader key", setupError(bad, "", true));
  bad = ok;
  bad.pairToken = "1234567a";
  TEST_ASSERT_EQUAL_STRING("The pairing code has 8 digits", setupError(bad, "", true));
}

void test_lockout_after_five_wrong_codes_for_a_minute() {
  Lockout l;
  for (int i = 0; i < 4; i++) l.fail(1000);
  TEST_ASSERT_TRUE(l.allowed(1000));
  l.fail(1000);  // fifth wrong code
  TEST_ASSERT_FALSE(l.allowed(1000));
  TEST_ASSERT_FALSE(l.allowed(60999));
  TEST_ASSERT_TRUE(l.allowed(61000));
  l.fail(61000);  // the count started over after the lockout
  TEST_ASSERT_TRUE(l.allowed(61000));
  l.success();
  for (int i = 0; i < 4; i++) l.fail(62000);
  TEST_ASSERT_TRUE(l.allowed(62000));
}

// ---- Review I4: every small-font screen line fits 128 px (21 characters of the 6x12 font) ----
void test_screen_lines_fit_the_display() {
  const char* lines[] = {KL_MSG_FULL_IDLE, KL_MSG_KEY_REJECTED, KL_MSG_CLOCK, KL_MSG_TAP_HERE, KL_MSG_CONNECT,
                         KL_MSG_NOT_SAVED, KL_MSG_RESTART};
  for (const char* l : lines) TEST_ASSERT_LESS_OR_EQUAL_MESSAGE(KL_SCREEN_CHARS, strlen(l), l);
}

void setup() {
  delay(2000);  // let the serial monitor attach
  UNITY_BEGIN();
  RUN_TEST(test_iso_utc);
  RUN_TEST(test_clock_valid);
  RUN_TEST(test_manila_minute);
  RUN_TEST(test_debounce_same_card_once);
  RUN_TEST(test_status_for);
  RUN_TEST(test_add_then_unsent_oldest_first);
  RUN_TEST(test_mark_sent_removes_exactly_those_and_repeats_are_harmless);
  RUN_TEST(test_seq_survives_reboot);
  RUN_TEST(test_torn_unsent_record_is_ignored);
  RUN_TEST(test_torn_uploaded_record_never_reuses_seq);
  RUN_TEST(test_tap_save_writes_no_meta_and_upload_saves_it_once);
  RUN_TEST(test_lost_meta_write_never_reuses_seq);
  RUN_TEST(test_full_when_every_slot_is_unsent_and_sent_slots_are_reused);
  RUN_TEST(test_body_matches_contract);
  RUN_TEST(test_never_synced_clock_sends_null);
  RUN_TEST(test_parse_ack_unions_acked_and_rejected);
  RUN_TEST(test_parse_ack_bad_json_returns_zero);
  RUN_TEST(test_partial_ack_leaves_the_rest_queued);
  RUN_TEST(test_since_returns_sent_and_unsent_after_seq);
  RUN_TEST(test_parse_roster_maps_names_and_windows);
  RUN_TEST(test_parse_roster_bad_json_is_false);
  RUN_TEST(test_setup_needs_https_and_the_key_again_when_the_server_changes);
  RUN_TEST(test_lockout_after_five_wrong_codes_for_a_minute);
  RUN_TEST(test_screen_lines_fit_the_display);
  UNITY_END();
}

void loop() {}
