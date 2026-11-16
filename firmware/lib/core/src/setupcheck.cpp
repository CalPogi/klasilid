#include "setupcheck.h"
#include <string.h>

static bool digits(const char* s, size_t n) {
  if (strlen(s) != n) return false;
  for (size_t i = 0; i < n; i++)
    if (s[i] < '0' || s[i] > '9') return false;
  return true;
}

const char* setupError(const SetupForm& f, const char* savedServer, bool keyTyped) {
  if (!f.ssid[0]) return "Choose a Wi-Fi network";
  if (strncmp(f.server, "https://", 8) != 0 || !f.server[8]) return "The server address starts with https://";
  if (strncmp(f.deviceId, "KD-", 3) != 0 || !digits(f.deviceId + 3, 4)) return "The reader ID looks like KD-0001";
  if (!f.deviceKey[0]) return "Enter the reader key";
  if (savedServer[0] && strcmp(savedServer, f.server) != 0 && !keyTyped) return "Type the reader key again when you change the server";
  if (!digits(f.pairToken, 8)) return "The pairing code has 8 digits";
  return nullptr;
}

bool Lockout::allowed(uint32_t nowMs) {
  if (!locked_) return true;
  if (static_cast<int32_t>(nowMs - until_) < 0) return false;
  locked_ = false;
  fails_ = 0;
  return true;
}

void Lockout::fail(uint32_t nowMs) {
  if (++fails_ >= 5) {
    locked_ = true;
    until_ = nowMs + 60000;
  }
}
