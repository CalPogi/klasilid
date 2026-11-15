#include "rostercache.h"
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <string.h>

static constexpr size_t kMaxCards = 120;  // ponytail: fixed table; a class is ~50 learners, replaced cards stay inactive server-side
static constexpr size_t kMaxWindows = 8;
static Card cards_[kMaxCards];
static size_t nCards_ = 0;
static Window windows_[kMaxWindows];
static size_t nWindows_ = 0;
static SemaphoreHandle_t mu;

void rostercache::begin() { mu = xSemaphoreCreateMutex(); }

void rostercache::set(const Card* cards, size_t nCards, const Window* windows, size_t nWindows) {
  xSemaphoreTake(mu, portMAX_DELAY);
  nCards_ = nCards < kMaxCards ? nCards : kMaxCards;
  memcpy(cards_, cards, nCards_ * sizeof(Card));
  nWindows_ = nWindows < kMaxWindows ? nWindows : kMaxWindows;
  memcpy(windows_, windows, nWindows_ * sizeof(Window));
  xSemaphoreGive(mu);
}

bool rostercache::nameFor(const char* uid, char* out, size_t cap) {
  bool found = false;
  xSemaphoreTake(mu, portMAX_DELAY);
  for (size_t i = 0; i < nCards_ && !found; i++) {
    if (strcmp(cards_[i].uid, uid) == 0) {
      strncpy(out, cards_[i].name, cap - 1);
      out[cap - 1] = '\0';
      found = true;
    }
  }
  xSemaphoreGive(mu);
  return found;
}

size_t rostercache::windows(Window* out, size_t max) {
  xSemaphoreTake(mu, portMAX_DELAY);
  const size_t n = nWindows_ < max ? nWindows_ : max;
  memcpy(out, windows_, n * sizeof(Window));
  xSemaphoreGive(mu);
  return n;
}
