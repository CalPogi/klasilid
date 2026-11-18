# First power-on of the door reader

Do this once, the day the parts arrive. You need the Windows PC with this project, a USB data cable (some cables only charge), and one student card.

All `pio` commands run inside the `firmware` folder and are written `python -m platformio …` (PlatformIO was installed with `python -m pip install --user platformio`).

## 1. Let Windows see the board

Plug the ESP32 into the PC. Open Device Manager → Ports (COM & LPT).
- You see `USB-SERIAL CH340 (COM5)` or similar: go on.
- You see nothing, or an unknown device: install the **CH340 driver** from the WCH website (wch-ic.com, "CH341SER"), unplug, plug in again.

## 2. Put the firmware on the board

```bash
cd firmware
python -m platformio run -t upload
```

If it stops at `Connecting....`, hold the **BOOT** button on the ESP32 until the upload starts.

## 3. Watch it start

```bash
python -m platformio device monitor
```

You should see `Klasilid reader`, then a line like `log: 0 unsent, next seq 1`. Press Ctrl+C to leave.

## 4. Run the firmware tests on the board

```bash
python -m platformio test -e esp32dev
```

Expected: both test groups pass. `test_core` shows `24 Tests 0 Failures 0 Ignored` (tap log, debounce, time, upload body, ack and roster parsing, setup-page checks, screen text). `test_storage` shows `4 Tests 0 Failures 0 Ignored` and prints the slowest tap write (must be under 150 ms; ~110 ms on the first reader) and how long the log takes to open at start-up (must be under 5 s; ~4 s). `test_storage` erases the reader's flash; that's fine on a new reader. Copy the summary into the plan 5 notes.

After the tests, wipe the flash and upload the real firmware again (the tests replace it, and an old test run could leave test taps behind that the reader would upload as real ones):

```bash
python -m platformio run -t erase
python -m platformio run -t upload
```

The first start after a wipe takes about 10 s (it creates the tap log); later starts, including after a brownout, take about 4 s before taps are accepted.

First reader, 2026-11-18: all 28 tests passed; slowest tap write 107–120 ms; log opens in 4.0 s.

## 5. Check each part

With the reader running (step 2 again, then the monitor from step 3):
- **Screen:** shows the time (or `--:--` and "Clock not set" until the first Wi-Fi sync) and "Tap your card".
- **Card reader:** tap a card. The screen shows "Card not registered" and the buzzer gives two short beeps. The monitor prints `tap 04A1B2C3 seq 1: 85 ms to feedback`.
- **Buzzer beeps all the time** right after power-on: first check the transistor on the buzzer module (wiring guide, "Check the buzzer module first"). An S8550 module can't work from VIN; it needs 3.3 V. With an S8050 module, open `firmware/src/hw/pins.h`, change `BUZZER_ACTIVE_LOW = false` to `true`, and upload again.
- **Power for the clock and screen:** with the screen showing the time, measure between the ESP32's D32 and D33 pins with a multimeter (DC volts). It should read 3.0 V or more. Lower than that, or the screen flickers: buy the ESP32 expansion board named in the wiring guide and move rows 8 and 9 to its 3V3 and GND pins.
- **Clock keeps time:** after step 6 has synced it once, unplug the USB for a minute and plug it back in. The time on the screen is still right (the DS3231 runs on its coin cell).
- **Nothing on the screen, or "clock" errors:** check rows 8–15 of the wiring guide. D32 and D33 power both the clock and the screen; SDA and SCL swapped is the other usual cause.

## 6. Connect it to Klasilid

1. On the PC, in the project folder, make the reader's credentials. Use the class id of Grade 6 Diamond from Supabase (Table editor → classes → id):
   ```bash
   node scripts/new-reader.mjs <class-id>
   ```
   It prints one SQL line and three values: Reader ID, Reader key, Pairing code.
2. Run the SQL line in Supabase (SQL editor). It stores only fingerprints of the key and code.
3. On a phone, join the Wi-Fi hotspot **Klasilid-Diamond** (the reader opens it when it has no Wi-Fi saved). Open `http://192.168.4.1` in the browser.
4. Fill in the setup page: choose the school Wi-Fi from the list, its password, the server address (`https://<project>.supabase.co`), and the Reader ID, Reader key and Pairing code from step 1. Save. The reader restarts and joins the school Wi-Fi.
5. Keep the printed values somewhere private (not in a group chat). The Pairing code is needed to change the settings later; the setup page asks for it.

## 7. See a tap reach the app

Register the test card in the app (Students → Register card, then tap the card). Tap it again at the door: the screen shows the short name ("Ana A.") and "On time" or "Late", with one short beep. Within about 10 seconds of a tap the monitor prints `upload: 1 sent, 1 acked`, and the tap appears in the app after its next sync. The reader downloads the class list on connect and then every 10 minutes, so a newly registered card shows its name within 10 minutes.

## 8. Measure the tap response

In the monitor, each tap prints `… ms to feedback`. Tap ten times; every number should be under 500. Write the slowest one in the plan 5 notes.

## If something goes wrong

- **"Key not accepted"** on the screen: the key typed on the setup page doesn't match the SQL from step 6. Run `node scripts/new-reader.mjs <class-id> --id KD-0001` (the same Reader ID). In the Supabase SQL editor, first run `delete from devices where id = 'KD-0001';`, then the new insert line. Open the setup page (it asks for the old pairing code), and type the new key and the new pairing code.
- **Monitor shows `upload failed (-1)`** over and over while Wi-Fi works: the server's TLS certificate may have moved to a root the reader doesn't know. Add the root certificate to `firmware/src/net/roots.h` and upload again.
- **"Full: connect Wi-Fi"**: 8,192 taps are waiting. Get the reader onto Wi-Fi; nothing is lost.
- **"Clock not set"**: the DS3231 lost its time (coin cell flat or loose). Taps are still saved and marked so the teacher can check them; the next Wi-Fi connection sets the clock.
