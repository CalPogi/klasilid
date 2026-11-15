#include "littlefs_storage.h"
#include <LittleFS.h>
#include <string.h>

static const char* TAPS = "/taps.bin";
static const char* META = "/meta.bin";

bool LittleFsStorage::begin() {
  const size_t want = static_cast<size_t>(capacity_) * sizeof(TapRec);
  fs::File probe = LittleFS.open(TAPS, "r");
  const bool ok = probe && probe.size() == want;
  if (probe) probe.close();
  if (!ok) {
    // First boot (or a capacity change): fill with 0xFF, which TapLog reads as empty slots.
    fs::File w = LittleFS.open(TAPS, "w");
    if (!w) return false;
    uint8_t blank[sizeof(TapRec) * 16];
    memset(blank, 0xFF, sizeof blank);
    for (size_t done = 0; done < want; done += sizeof blank) w.write(blank, want - done < sizeof blank ? want - done : sizeof blank);
    w.close();
  }
  f_ = LittleFS.open(TAPS, "r+");
  return static_cast<bool>(f_);
}

bool LittleFsStorage::read(uint32_t slot, TapRec& r) {
  if (slot >= capacity_ || !f_.seek(slot * sizeof(TapRec))) return false;
  return f_.read(reinterpret_cast<uint8_t*>(&r), sizeof r) == sizeof r;
}

bool LittleFsStorage::write(uint32_t slot, const TapRec& r) {
  if (slot >= capacity_ || !f_.seek(slot * sizeof(TapRec))) return false;
  const bool ok = f_.write(reinterpret_cast<const uint8_t*>(&r), sizeof r) == sizeof r;
  f_.flush();  // on flash before the beep (spec §8)
  return ok;
}

// meta = next seq + its bitwise complement, so a torn write reads as "no meta" rather than a wrong number.
bool LittleFsStorage::loadMeta(uint32_t& nextSeq) {
  fs::File m = LittleFS.open(META, "r");
  uint32_t v[2];
  const bool ok = m && m.read(reinterpret_cast<uint8_t*>(v), sizeof v) == sizeof v && v[1] == ~v[0];
  if (m) m.close();
  if (ok) nextSeq = v[0];
  return ok;
}

bool LittleFsStorage::saveMeta(uint32_t nextSeq) {
  fs::File m = LittleFS.open(META, "w");
  if (!m) return false;
  const uint32_t v[2] = {nextSeq, ~nextSeq};
  const bool ok = m.write(reinterpret_cast<const uint8_t*>(v), sizeof v) == sizeof v;
  m.close();
  return ok;
}
