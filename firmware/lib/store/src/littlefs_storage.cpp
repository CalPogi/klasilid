#include "littlefs_storage.h"
#include <LittleFS.h>
#include <stdio.h>
#include <string.h>

static constexpr size_t kShardBytes = LittleFsStorage::kPerShard * sizeof(TapRec);

String LittleFsStorage::shardPath(uint32_t shard) const {
  char name[12];
  snprintf(name, sizeof name, "/%03lu.bin", static_cast<unsigned long>(shard));
  return dir_ + name;
}

bool LittleFsStorage::begin(const char* dir) {
  dir_ = dir;
  if (open_) open_.close();
  openShard_ = -1;
  if (!LittleFS.exists(dir_) && !LittleFS.mkdir(dir_)) return false;
  uint8_t blank[kShardBytes];
  memset(blank, 0xFF, sizeof blank);  // TapLog reads erased records as empty slots
  const uint32_t shards = (capacity_ + kPerShard - 1) / kPerShard;
  for (uint32_t i = 0; i < shards; i++) {
    const String p = shardPath(i);
    fs::File probe = LittleFS.open(p, "r");
    const bool ok = probe && probe.size() == kShardBytes;
    if (probe) probe.close();
    if (ok) continue;
    // First boot, or a shard torn while being created: start it empty.
    fs::File w = LittleFS.open(p, "w");
    if (!w || w.write(blank, sizeof blank) != sizeof blank) return false;
    w.close();
  }
  return true;
}

fs::File& LittleFsStorage::shard(uint32_t slot) {
  const int32_t want = static_cast<int32_t>(slot / kPerShard);
  if (want != openShard_) {
    if (open_) open_.close();
    open_ = LittleFS.open(shardPath(want), "r+");
    openShard_ = open_ ? want : -1;
  }
  return open_;
}

bool LittleFsStorage::read(uint32_t slot, TapRec& r) {
  if (slot >= capacity_) return false;
  fs::File& f = shard(slot);
  if (!f || !f.seek((slot % kPerShard) * sizeof(TapRec))) return false;
  return f.read(reinterpret_cast<uint8_t*>(&r), sizeof r) == sizeof r;
}

bool LittleFsStorage::write(uint32_t slot, const TapRec& r) {
  if (slot >= capacity_) return false;
  fs::File& f = shard(slot);
  if (!f || !f.seek((slot % kPerShard) * sizeof(TapRec))) return false;
  const bool ok = f.write(reinterpret_cast<const uint8_t*>(&r), sizeof r) == sizeof r;
  f.flush();  // on flash before the beep (spec §8); rewrites one small shard, not the whole log
  return ok;
}

// meta = next seq + its bitwise complement, so a torn write reads as "no meta" rather than a wrong number.
bool LittleFsStorage::loadMeta(uint32_t& nextSeq) {
  fs::File m = LittleFS.open(dir_ + "/meta.bin", "r");
  uint32_t v[2];
  const bool ok = m && m.read(reinterpret_cast<uint8_t*>(v), sizeof v) == sizeof v && v[1] == ~v[0];
  if (m) m.close();
  if (ok) nextSeq = v[0];
  return ok;
}

bool LittleFsStorage::saveMeta(uint32_t nextSeq) {
  fs::File m = LittleFS.open(dir_ + "/meta.bin", "w");
  if (!m) return false;
  const uint32_t v[2] = {nextSeq, ~nextSeq};
  const bool ok = m.write(reinterpret_cast<const uint8_t*>(v), sizeof v) == sizeof v;
  m.close();
  return ok;
}
