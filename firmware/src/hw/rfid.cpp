#include "rfid.h"
#include <MFRC522.h>
#include <SPI.h>
#include <stdio.h>
#include "pins.h"

static MFRC522 reader(PIN_RC522_SS, PIN_RC522_RST);

void rfid::begin() {
  SPI.begin(PIN_RC522_SCK, PIN_RC522_MISO, PIN_RC522_MOSI, PIN_RC522_SS);
  reader.PCD_Init();
}

bool rfid::poll(char uid[21]) {
  if (!reader.PICC_IsNewCardPresent() || !reader.PICC_ReadCardSerial()) return false;
  const byte n = reader.uid.size > 10 ? 10 : reader.uid.size;
  for (byte i = 0; i < n; i++) snprintf(uid + 2 * i, 3, "%02X", reader.uid.uidByte[i]);
  uid[2 * n] = '\0';
  reader.PICC_HaltA();  // the same card isn't read again until it leaves the field
  return n > 0;
}
