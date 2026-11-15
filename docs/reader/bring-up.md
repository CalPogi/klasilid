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

Expected: every Unity test passes (`19 Tests 0 Failures 0 Ignored`, then `PASSED`). These are the tests for the tap log, debounce, time, upload body, ack and roster parsing that couldn't run before the board arrived. Copy the summary into the plan 5 notes. After the tests, upload the real firmware again (step 2): the tests replace it.

## 5. Check each part

With the reader running (step 2 again, then the monitor from step 3):
- **Screen:** shows the time (or `--:--` and "Clock not set" until the first Wi-Fi sync) and "Tap your card".
- **Card reader:** tap a card. The screen shows "Card not registered" and the buzzer gives two short beeps. The monitor prints `tap 04A1B2C3 seq 1: 85 ms to feedback`.
- **Buzzer beeps all the time** right after power-on: open `firmware/src/hw/pins.h`, change `BUZZER_ACTIVE_LOW = false` to `true`, and upload again.
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

- **"Reader key not accepted"** on the screen: the key typed on the setup page doesn't match the SQL from step 6. Run `new-reader.mjs` again with `--id` and the same Reader ID, replace the row in Supabase, and type the new key.
- **Monitor shows `upload failed (-1)`** over and over while Wi-Fi works: the server's TLS certificate may have moved to a root the reader doesn't know. Add the root certificate to `firmware/src/net/roots.h` and upload again.
- **"Reader full - connect Wi-Fi"**: 8,192 taps are waiting. Get the reader onto Wi-Fi; nothing is lost.
- **"Clock not set"**: the DS3231 lost its time (coin cell flat or loose). Taps are still saved and marked so the teacher can check them; the next Wi-Fi connection sets the clock.
