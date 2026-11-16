#pragma once
#include <stdint.h>

// The reader's setup page, after merging empty fields with the saved values.
struct SetupForm {
  const char* ssid;
  const char* server;
  const char* deviceId;
  const char* deviceKey;
  const char* pairToken;
};

// nullptr when the form can be saved, otherwise the message to show. https only, and a changed server needs the
// key typed again, so someone with the pairing code can't send the saved key to their own server (review I1).
const char* setupError(const SetupForm& f, const char* savedServer, bool keyTyped);

// Wrong pairing codes, shared by the setup page and the local API: 5 in a row lock both for 60 s (review I1).
class Lockout {
 public:
  bool allowed(uint32_t nowMs);
  void fail(uint32_t nowMs);
  void success() { fails_ = 0; }

 private:
  uint8_t fails_ = 0;
  bool locked_ = false;
  uint32_t until_ = 0;
};
