#pragma once
namespace rfid {
void begin();
bool poll(char uid[21]);  // a new card was read: uppercase hex UID, no separators
}
