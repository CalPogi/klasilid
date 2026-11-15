#pragma once
#include <stddef.h>
#include <stdint.h>

// One tap as stored in flash. Fixed 36 bytes; crc is a CRC-8 over every byte before it.
struct TapRec {
  uint32_t seq;
  uint32_t unix;
  uint32_t syncedUnix;  // last NTP sync before the tap; 0 = never
  char uid[21];         // uppercase hex, NUL-terminated
  uint8_t sent;
  uint8_t crc;
};
static_assert(sizeof(TapRec) == 36, "TapRec is stored in flash; its size must not change");

class Storage {
 public:
  virtual bool read(uint32_t slot, TapRec& r) = 0;
  virtual bool write(uint32_t slot, const TapRec& r) = 0;
  virtual bool loadMeta(uint32_t& nextSeq) = 0;
  virtual bool saveMeta(uint32_t nextSeq) = 0;
  virtual ~Storage() = default;
};

// RAM-backed storage for the tests. corrupt() and failMetaWrites stand in for a power cut.
class MemoryStorage : public Storage {
 public:
  explicit MemoryStorage(uint32_t capacity);
  ~MemoryStorage() override;
  bool read(uint32_t slot, TapRec& r) override;
  bool write(uint32_t slot, const TapRec& r) override;
  bool loadMeta(uint32_t& nextSeq) override;
  bool saveMeta(uint32_t nextSeq) override;
  void corrupt(uint32_t slot);
  bool failMetaWrites = false;

 private:
  TapRec* slots_;
  uint32_t capacity_;
  uint32_t meta_ = 0;
  bool hasMeta_ = false;
};

// Ring log of taps. Slot = seq % capacity. An unsent tap is never overwritten: the log reports Full instead.
class TapLog {
 public:
  explicit TapLog(Storage& s, uint32_t capacity = 8192);
  ~TapLog();
  bool begin();  // rebuild state from storage; torn or empty records count as free slots
  enum class Add { Ok, Full, Error };
  Add add(const char* uid, uint32_t unix, uint32_t syncedUnix, uint32_t& seqOut);
  size_t unsent(TapRec* out, size_t max);  // oldest first
  size_t since(uint32_t afterSeq, TapRec* out, size_t max);  // sent or not, seq > afterSeq, oldest first (local API)
  void markSent(const uint32_t* seqs, size_t n);  // unknown seqs ignored; repeating is harmless
  size_t unsentCount() const { return unsentCount_; }
  uint32_t nextSeq() const { return nextSeq_; }

 private:
  bool isUnsent(uint32_t slot) const { return bits_[slot >> 3] & (1u << (slot & 7)); }
  void setUnsent(uint32_t slot, bool on);
  uint32_t windowStart() const { return nextSeq_ > capacity_ ? nextSeq_ - capacity_ : 0; }
  Storage& s_;
  uint32_t capacity_;
  uint8_t* bits_;  // one bit per slot: holds an unsent tap
  uint32_t nextSeq_ = 1;
  size_t unsentCount_ = 0;
};

uint8_t tapCrc(const TapRec& r);
bool tapValid(const TapRec& r);  // crc matches and the uid is a non-empty terminated string
