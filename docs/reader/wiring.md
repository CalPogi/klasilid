# Wiring the door reader

No soldering. Every wire is a female-to-female jumper pushed onto pins that are already on the boards.
Unplug the USB cable while you connect wires. You need 18 jumpers.

## Before you start

- **The RC522 card reader runs on 3.3 V only.** Its 3.3V pin goes to the ESP32 pin labelled **3V3**, never to VIN or 5V. 5 V can damage it.
- **Each pin takes one wire.** The ESP32 has only one 3V3 pin and two GND pins, so not every part can plug into them. The clock (DS3231) and the screen (OLED) get their power from two ordinary ESP32 pins, **D32** (3.3 V) and **D33** (ground), which the firmware switches on at start-up. They use little power (about 20 mA together), so this usually works; bring-up step 5 checks it with a multimeter.
- **The screen plugs into the clock, not the ESP32.** The DS3231 has two sets of pins: a 6-pin side (`32K SQW SCL SDA VCC GND`) and a 4-pin side (`SCL SDA VCC GND`). The ESP32 connects to the 6-pin side; the OLED connects to the 4-pin side, which passes everything through.
- **Check the buzzer module first.** Look at the small transistor on it. If it reads **S8050** (or the listing says "high level trigger"), it works on VIN as wired below. If it reads **S8550** (or "low level trigger"), it can't be switched off from 5 V: it would sound all the time. That kind needs 3.3 V instead, which means an ESP32 expansion board (see the end of this page).
- Pin labels are printed next to each pin. Some ESP32 boards print `G5` or just `5` instead of `D5`; they are the same pin.

## One row per wire

| # | From | To | Pin on the part |
|---|---|---|---|
| 1 | ESP32 **3V3** | RC522 card reader | 3.3V |
| 2 | ESP32 **GND** (one of the two) | RC522 card reader | GND |
| 3 | ESP32 **D5** | RC522 card reader | SDA (also called SS) |
| 4 | ESP32 **D18** | RC522 card reader | SCK |
| 5 | ESP32 **D23** | RC522 card reader | MOSI |
| 6 | ESP32 **D19** | RC522 card reader | MISO |
| 7 | ESP32 **D27** | RC522 card reader | RST |
| — | (nothing) | RC522 card reader | IRQ: leave empty |
| 8 | ESP32 **D32** | DS3231 clock, 6-pin side | VCC |
| 9 | ESP32 **D33** | DS3231 clock, 6-pin side | GND |
| 10 | ESP32 **D21** | DS3231 clock, 6-pin side | SDA |
| 11 | ESP32 **D22** | DS3231 clock, 6-pin side | SCL |
| 12 | DS3231 4-pin side **VCC** | OLED screen | VCC |
| 13 | DS3231 4-pin side **GND** | OLED screen | GND |
| 14 | DS3231 4-pin side **SDA** | OLED screen | SDA |
| 15 | DS3231 4-pin side **SCL** | OLED screen | SCL |
| 16 | ESP32 **VIN** (5 V from USB; S8050 buzzer modules only) | Buzzer | VCC (sometimes +) |
| 17 | ESP32 **GND** (the other one) | Buzzer | GND (sometimes −) |
| 18 | ESP32 **D25** | Buzzer | I/O (sometimes S or SIG) |


<svg viewBox="0 0 760 440" xmlns="http://www.w3.org/2000/svg" font-family="system-ui, sans-serif" font-size="12" role="img" aria-label="Wiring diagram: ESP32 in the middle; RC522 card reader on the left; DS3231 clock, OLED screen and buzzer on the right">
  <rect width="760" height="440" fill="#ffffff"/>
  <rect x="300" y="40" width="160" height="350" rx="10" fill="#1f2937"/>
  <text x="380" y="64" fill="#fff" text-anchor="middle" font-weight="700">ESP32</text>
  <g fill="#fff">
    <text x="312" y="100">3V3</text><text x="312" y="125">GND</text><text x="312" y="150">D5</text><text x="312" y="175">D18</text>
    <text x="312" y="200">D23</text><text x="312" y="225">D19</text><text x="312" y="250">D27</text>
    <text x="448" y="100" text-anchor="end">D32</text><text x="448" y="125" text-anchor="end">D33</text>
    <text x="448" y="150" text-anchor="end">D21</text><text x="448" y="175" text-anchor="end">D22</text>
    <text x="448" y="310" text-anchor="end">VIN</text><text x="448" y="335" text-anchor="end">GND</text><text x="448" y="360" text-anchor="end">D25</text>
  </g>
  <rect x="40" y="70" width="150" height="200" rx="8" fill="#e0f2fe" stroke="#0369a1"/>
  <text x="115" y="88" text-anchor="middle" font-weight="700" fill="#0c4a6e">RC522 (3.3 V only)</text>
  <g fill="#0c4a6e"><text x="180" y="100" text-anchor="end">3.3V</text><text x="180" y="125" text-anchor="end">GND</text><text x="180" y="150" text-anchor="end">SDA/SS</text>
  <text x="180" y="175" text-anchor="end">SCK</text><text x="180" y="200" text-anchor="end">MOSI</text><text x="180" y="225" text-anchor="end">MISO</text><text x="180" y="250" text-anchor="end">RST</text></g>
  <g stroke-width="2" fill="none">
    <path d="M190 96H300" stroke="#dc2626"/><path d="M190 121H300" stroke="#111827"/><path d="M190 146H300" stroke="#7c3aed"/>
    <path d="M190 171H300" stroke="#2563eb"/><path d="M190 196H300" stroke="#059669"/><path d="M190 221H300" stroke="#d97706"/><path d="M190 246H300" stroke="#64748b"/>
  </g>
  <rect x="570" y="70" width="160" height="120" rx="8" fill="#fef3c7" stroke="#b45309"/>
  <text x="650" y="88" text-anchor="middle" font-weight="700" fill="#78350f">DS3231 clock</text>
  <g fill="#78350f"><text x="580" y="100">VCC</text><text x="580" y="125">GND</text><text x="580" y="150">SDA</text><text x="580" y="175">SCL</text>
  <text x="720" y="125" text-anchor="end" font-size="11">6-pin side</text></g>
  <g stroke-width="2" fill="none">
    <path d="M460 96H570" stroke="#dc2626"/><path d="M460 121H570" stroke="#111827"/>
    <path d="M460 146H570" stroke="#0891b2"/><path d="M460 171H570" stroke="#16a34a"/>
  </g>
  <rect x="570" y="215" width="160" height="60" rx="8" fill="#ede9fe" stroke="#6d28d9"/>
  <text x="650" y="238" text-anchor="middle" font-weight="700" fill="#4c1d95">OLED screen</text>
  <text x="650" y="258" text-anchor="middle" fill="#4c1d95" font-size="11">4 wires from the DS3231's 4-pin side</text>
  <path d="M650 190V215" stroke="#6d28d9" stroke-width="3" stroke-dasharray="5 3"/>
  <rect x="570" y="295" width="160" height="80" rx="8" fill="#dcfce7" stroke="#15803d"/>
  <text x="650" y="313" text-anchor="middle" font-weight="700" fill="#14532d">Buzzer</text>
  <g fill="#14532d"><text x="580" y="331">VCC (5 V)</text><text x="580" y="351">GND</text><text x="580" y="369">I/O</text></g>
  <g stroke-width="2" fill="none">
    <path d="M460 306H520V327H570" stroke="#dc2626"/>
    <path d="M460 331H520V347H570" stroke="#111827"/>
    <path d="M460 356H520V365H570" stroke="#9333ea"/>
  </g>
  <text x="380" y="420" text-anchor="middle" fill="#475569">Red = power, black = ground. Only the buzzer uses VIN (5 V); the RC522 uses 3V3.</text>
</svg>

**Cleaner option for a second reader:** an "ESP32 30-pin expansion board" (about ₱150 on Lazada) has a 3V3, GND and 5V pin beside every signal pin. With it, rows 8 and 9 can go to real 3V3 and GND pins instead of D32 and D33, and an S8550 buzzer module can take its VCC from a 3V3 pin; nothing else changes.

## Putting it in the box

1. Make one small hole in the side of the junction box for the USB cable (heated nail or cutter).
2. **RC522:** tape it flat to the inside of the clear cover near the top, the side with the printed coil facing the cover. Put a sticker on the outside above it: "Tap here". Cards read through a few millimetres of plastic.
3. **OLED:** tape it to the inside of the cover below the RC522, screen facing out, so the text shows through.
4. **ESP32, DS3231 and buzzer:** stick them to the bottom of the box with double-sided foam tape. Line the ESP32's USB port up with the hole.
5. Leave the jumper wires loose enough that the cover can open without pulling them off.
6. Close the cover and plug the USB cable into the power bank (pass-through charging), with the power bank plugged into the wall.
