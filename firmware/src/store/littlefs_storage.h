#pragma once
#include <FS.h>
#include "taplog.h"

// Tap log on LittleFS: /taps.bin holds capacity fixed-size records (preallocated), /meta.bin the next seq.
// Call LittleFS.begin(true) before begin().
class LittleFsStorage : public Storage {
 public:
  explicit LittleFsStorage(uint32_t capacity) : capacity_(capacity) {}
  bool begin();
  bool read(uint32_t slot, TapRec& r) override;
  bool write(uint32_t slot, const TapRec& r) override;
  bool loadMeta(uint32_t& nextSeq) override;
  bool saveMeta(uint32_t nextSeq) override;

 private:
  uint32_t capacity_;
  fs::File f_;
};
