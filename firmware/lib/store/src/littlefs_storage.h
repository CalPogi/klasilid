#pragma once
#include <FS.h>
#include "taplog.h"

// Tap log on LittleFS. Records live in small shard files (<dir>/NNN.bin, 64 records = 2,304 bytes, under one
// 4 KB flash block), because littlefs rewrites everything after a changed byte when a file is synced: with one
// big file every tap rewrote up to 288 KB (review C1). <dir>/meta.bin holds the next seq.
// Call LittleFS.begin(true) before begin().
class LittleFsStorage : public Storage {
 public:
  static constexpr uint32_t kPerShard = 64;
  explicit LittleFsStorage(uint32_t capacity) : capacity_(capacity) {}
  bool begin(const char* dir = "/t");
  bool read(uint32_t slot, TapRec& r) override;
  bool write(uint32_t slot, const TapRec& r) override;
  bool loadMeta(uint32_t& nextSeq) override;
  bool saveMeta(uint32_t nextSeq) override;

 private:
  String shardPath(uint32_t shard) const;
  fs::File& shard(uint32_t slot);  // the open shard file for this slot (one kept open at a time)
  uint32_t capacity_;
  String dir_;
  fs::File open_;
  int32_t openShard_ = -1;
};
