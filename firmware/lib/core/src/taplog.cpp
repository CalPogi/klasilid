#include "taplog.h"
#include <stddef.h>
#include <string.h>

uint8_t tapCrc(const TapRec& r) {  // CRC-8, polynomial 0x07
  const uint8_t* p = reinterpret_cast<const uint8_t*>(&r);
  uint8_t crc = 0;
  for (size_t i = 0; i < offsetof(TapRec, crc); i++) {
    crc ^= p[i];
    for (int b = 0; b < 8; b++) crc = (crc & 0x80) ? static_cast<uint8_t>((crc << 1) ^ 0x07) : static_cast<uint8_t>(crc << 1);
  }
  return crc;
}

// The uid checks reject both erased flash (all 0xFF) and zeroed memory, whose crc could otherwise match.
bool tapValid(const TapRec& r) { return r.crc == tapCrc(r) && r.uid[0] != '\0' && r.uid[sizeof r.uid - 1] == '\0'; }

MemoryStorage::MemoryStorage(uint32_t capacity) : slots_(new TapRec[capacity]), capacity_(capacity) {
  memset(slots_, 0xFF, sizeof(TapRec) * capacity);
}
MemoryStorage::~MemoryStorage() { delete[] slots_; }
bool MemoryStorage::read(uint32_t slot, TapRec& r) {
  if (slot >= capacity_) return false;
  r = slots_[slot];
  return true;
}
bool MemoryStorage::write(uint32_t slot, const TapRec& r) {
  if (slot >= capacity_) return false;
  slots_[slot] = r;
  return true;
}
bool MemoryStorage::loadMeta(uint32_t& nextSeq) {
  if (hasMeta_) nextSeq = meta_;
  return hasMeta_;
}
bool MemoryStorage::saveMeta(uint32_t nextSeq) {
  if (failMetaWrites) return false;
  meta_ = nextSeq;
  hasMeta_ = true;
  return true;
}
void MemoryStorage::corrupt(uint32_t slot) { reinterpret_cast<uint8_t*>(&slots_[slot])[5] ^= 0x5A; }

TapLog::TapLog(Storage& s, uint32_t capacity) : s_(s), capacity_(capacity), bits_(new uint8_t[(capacity + 7) / 8]()) {}
TapLog::~TapLog() { delete[] bits_; }

void TapLog::setUnsent(uint32_t slot, bool on) {
  if (on) bits_[slot >> 3] |= static_cast<uint8_t>(1u << (slot & 7));
  else bits_[slot >> 3] &= static_cast<uint8_t>(~(1u << (slot & 7)));
}

bool TapLog::begin() {
  memset(bits_, 0, (capacity_ + 7) / 8);
  unsentCount_ = 0;
  uint32_t meta = 1;
  s_.loadMeta(meta);
  uint32_t highest = 0;
  TapRec r;
  for (uint32_t slot = 0; slot < capacity_; slot++) {
    if (!s_.read(slot, r) || !tapValid(r) || r.seq % capacity_ != slot) continue;
    if (r.seq > highest) highest = r.seq;
    if (!r.sent) {
      setUnsent(slot, true);
      unsentCount_++;
    }
  }
  // A power cut between the record write and the meta write must never hand out a seq twice.
  nextSeq_ = meta > highest + 1 ? meta : highest + 1;
  if (nextSeq_ == 0) nextSeq_ = 1;
  return true;
}

TapLog::Add TapLog::add(const char* uid, uint32_t unix, uint32_t syncedUnix, uint32_t& seqOut) {
  const uint32_t slot = nextSeq_ % capacity_;
  if (isUnsent(slot)) return Add::Full;
  TapRec r;
  memset(&r, 0, sizeof r);
  r.seq = nextSeq_;
  r.unix = unix;
  r.syncedUnix = syncedUnix;
  strncpy(r.uid, uid, sizeof r.uid - 1);
  r.crc = tapCrc(r);
  if (!s_.write(slot, r)) return Add::Error;
  s_.saveMeta(nextSeq_ + 1);  // a failed meta write is recovered by begin() from the record itself
  seqOut = nextSeq_++;
  setUnsent(slot, true);
  unsentCount_++;
  return Add::Ok;
}

size_t TapLog::unsent(TapRec* out, size_t max) {
  size_t n = 0;
  for (uint32_t seq = windowStart(); seq < nextSeq_ && n < max; seq++) {
    const uint32_t slot = seq % capacity_;
    if (!isUnsent(slot)) continue;
    if (s_.read(slot, out[n]) && tapValid(out[n]) && out[n].seq == seq) n++;
  }
  return n;
}

void TapLog::markSent(const uint32_t* seqs, size_t n) {
  for (size_t i = 0; i < n; i++) {
    const uint32_t seq = seqs[i];
    if (seq < windowStart() || seq >= nextSeq_) continue;
    const uint32_t slot = seq % capacity_;
    if (!isUnsent(slot)) continue;
    TapRec r;
    if (!s_.read(slot, r) || !tapValid(r) || r.seq != seq) continue;
    r.sent = 1;
    r.crc = tapCrc(r);
    if (!s_.write(slot, r)) continue;  // stays unsent; the server ignores the duplicate next time
    setUnsent(slot, false);
    unsentCount_--;
  }
}
