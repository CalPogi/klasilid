#pragma once
#include <FS.h>
#include "taplog.h"

// Tap log on LittleFS. Records live in small shard files (<dir>/NN/NNN.bin, 64 records = 2,304 bytes, under one
// 4 KB flash block), because littlefs rewrites everything after a changed byte when a file is synced: with one
// big file every tap rewrote up to 288 KB (review C1). <dir>.meta (beside the folder) holds the next seq.
// Call LittleFS.begin(true) before begin().
class LittleFsStorage : public Storage {
 public:
  static constexpr uint32_t kPerShard = 64;
  static constexpr uint32_t kPerFolder = 4;  // shards per sub-folder (see folderPath)
  explicit LittleFsStorage(uint32_t capacity) : capacity_(capacity), cache_(new uint8_t[kPerShard * sizeof(TapRec)]) {}
  ~LittleFsStorage() override { delete[] cache_; }
  LittleFsStorage(const LittleFsStorage&) = delete;
  LittleFsStorage& operator=(const LittleFsStorage&) = delete;
  bool begin(const char* dir = "/t");
  bool read(uint32_t slot, TapRec& r) override;
  bool write(uint32_t slot, const TapRec& r) override;
  bool loadMeta(uint32_t& nextSeq) override;
  bool saveMeta(uint32_t nextSeq) override;

 private:
  String shardPath(uint32_t shard) const;
  String metaPath() const;
  String folderPath(uint32_t shard) const;
  fs::File& shard(uint32_t slot, bool forWrite);  // the open shard file for this slot (one kept open at a time)
  uint32_t capacity_;
  String dir_;
  fs::File open_;
  int32_t openShard_ = -1;
  bool openRw_ = false;
  // The last shard read, whole: TapLog::begin() reads all 8,192 slots, and one read per slot took ~18 s at boot.
  uint8_t* cache_;
  int32_t cacheShard_ = -1;
};
