#pragma once
// The only place pins are named. Wiring guide: docs/reader/wiring.md
constexpr int PIN_RC522_SS = 5;
constexpr int PIN_RC522_SCK = 18;
constexpr int PIN_RC522_MOSI = 23;
constexpr int PIN_RC522_MISO = 19;
constexpr int PIN_RC522_RST = 27;
constexpr int PIN_I2C_SDA = 21;  // OLED and DS3231 share the bus
constexpr int PIN_I2C_SCL = 22;
// The board has one 3V3 pin and two GND pins, and female-to-female jumpers can't split a pin. The DS3231 and the
// OLED (chained through the DS3231's pass-through pins, ~20 mA together) are powered from these two GPIOs instead:
// one held HIGH as 3.3 V, one held LOW as ground. The RC522 keeps the real 3V3 pin.
constexpr int PIN_I2C_POWER = 32;
constexpr int PIN_I2C_GROUND = 33;
constexpr int PIN_BUZZER = 25;
// Some buzzer modules sound when the signal is LOW. If it beeps all the time after power-on, set this to true.
constexpr bool BUZZER_ACTIVE_LOW = false;
