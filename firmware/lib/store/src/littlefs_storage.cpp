#include "littlefs_storage.h"
#include <LittleFS.h>
#include <stdio.h>
#include <string.h>

static constexpr size_t kShardBytes = LittleFsStorage::kPerShard * sizeof(TapRec);

// Shards sit in small sub-folders (<dir>/NN/SSS.bin, kPerFolder each). Every tap write commits to its folder's
// metadata, and littlefs compacts a folder's metadata from time to time: with all 128 shards in one folder that
// took ~700 ms on about one tap in sixteen (on-board timing, Nov 2026); small folders compact quickly.
String LittleFsStorage::folderPath(uint32_t shard) const {
  char name[8];
  snprintf(name, sizeof name, "/%02lu", static_cast<unsigned long>(shard / kPerFolder));
  return dir_ + name;
}

String LittleFsStorage::shardPath(uint32_t shard) const {
  char name[12];
  snprintf(name, sizeof name, "/%03lu.bin", static_cast<unsigned long>(shard));
  return folderPath(shard) + name;
}

bool LittleFsStorage::begin(const char* dir) {
  dir_ = dir;
  if (open_) open_.close();
  openShard_ = -1;
  cacheShard_ = -1;
  if (!LittleFS.exists(dir_) && !LittleFS.mkdir(dir_)) return false;
  // Every shard exists at full size once <dir>/ready is there (written last, below): skip checking them on each boot.
  const String ready = dir_ + "/ready";
  if (LittleFS.exists(ready)) return true;
  uint8_t* blank = cache_;  // the cache is free until the first read
  memset(blank, 0xFF, kShardBytes);  // TapLog reads erased records as empty slots
  const uint32_t shards = (capacity_ + kPerShard - 1) / kPerShard;
  for (uint32_t i = 0; i < shards; i++) {
    if (i % kPerFolder == 0 && !LittleFS.exists(folderPath(i)) && !LittleFS.mkdir(folderPath(i))) return false;
    const String p = shardPath(i);
    fs::File probe = LittleFS.open(p, "r");
    const bool ok = probe && probe.size() == kShardBytes;
    if (probe) probe.close();
    if (ok) continue;
    // First boot, or a shard torn while being created: start it empty.
    fs::File w = LittleFS.open(p, "w");
    if (!w || w.write(blank, kShardBytes) != kShardBytes) return false;
    w.close();
  }
  fs::File done = LittleFS.open(ready, "w");
  if (done) done.close();
  return true;
}

// Reads open the shard read-only (on-board timing: about a third quicker than "r+", which matters for the 128
// reads at boot); a write reopens it for writing. Taps go to the same shard one after another, so that's rare.
fs::File& LittleFsStorage::shard(uint32_t slot, bool forWrite) {
  const int32_t want = static_cast<int32_t>(slot / kPerShard);
  if (want != openShard_ || (forWrite && !openRw_)) {
    if (open_) open_.close();
    open_ = LittleFS.open(shardPath(want), forWrite ? "r+" : "r");
    openShard_ = open_ ? want : -1;
    openRw_ = forWrite;
  }
  return open_;
}

bool LittleFsStorage::read(uint32_t slot, TapRec& r) {
  if (slot >= capacity_) return false;
  const int32_t want = static_cast<int32_t>(slot / kPerShard);
  if (want != cacheShard_) {
    fs::File& f = shard(slot, false);
    cacheShard_ = -1;
    if (!f || !f.seek(0) || f.read(cache_, kShardBytes) != kShardBytes) return false;
    cacheShard_ = want;
  }
  memcpy(&r, cache_ + (slot % kPerShard) * sizeof(TapRec), sizeof r);
  return true;
}

bool LittleFsStorage::write(uint32_t slot, const TapRec& r) {
  if (slot >= capacity_) return false;
  fs::File& f = shard(slot, true);
  if (!f || !f.seek((slot % kPerShard) * sizeof(TapRec))) return false;
  const bool ok = f.write(reinterpret_cast<const uint8_t*>(&r), sizeof r) == sizeof r;
  f.flush();  // on flash before the beep (spec §8); rewrites one small shard, not the whole log
  if (static_cast<int32_t>(slot / kPerShard) == cacheShard_) {
    if (ok) memcpy(cache_ + (slot % kPerShard) * sizeof(TapRec), &r, sizeof r);
    else cacheShard_ = -1;  // unsure what reached flash: read it again next time
  }
  return ok;
}

// meta = next seq + its bitwise complement, so a torn write reads as "no meta" rather than a wrong number.
// Kept beside the shard folder, not in it: rewriting a file inside the 128-file folder made littlefs compact the
// folder's metadata often, which slowed the tap writes too (on-board timing, Nov 2026).
String LittleFsStorage::metaPath() const { return dir_ + ".meta"; }

bool LittleFsStorage::loadMeta(uint32_t& nextSeq) {
  fs::File m = LittleFS.open(metaPath(), "r");
  uint32_t v[2];
  const bool ok = m && m.read(reinterpret_cast<uint8_t*>(v), sizeof v) == sizeof v && v[1] == ~v[0];
  if (m) m.close();
  if (ok) nextSeq = v[0];
  return ok;
}

bool LittleFsStorage::saveMeta(uint32_t nextSeq) {
  fs::File m = LittleFS.open(metaPath(), "w");
  if (!m) return false;
  const uint32_t v[2] = {nextSeq, ~nextSeq};
  const bool ok = m.write(reinterpret_cast<const uint8_t*>(v), sizeof v) == sizeof v;
  m.close();
  return ok;
}
