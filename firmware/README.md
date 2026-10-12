# Solaris Labs mini meter firmware

Hardware: ESP32 DevKit (CH9102 USB, shows up as `/dev/ttyACM0`), INA219 module, 6 V / 250 mA panel.

| INA219 | Connects to |
|---|---|
| Vcc | ESP32 3V3 |
| Gnd | ESP32 GND |
| Scl | ESP32 D22 |
| Sda | ESP32 D21 |
| Vin+ | panel ⊕ |
| Vin− | load resistor → GND (panel ⊖ also to GND) |

Load: 22–47 Ω, 1 W or more (a ¼ W resistor overheats in full sun below ~220 Ω).
Diagrams: `diagrams/full_wiring.png`.

## Sketches

- `solar_meter/` – the real firmware. Precision INA219 mode (±40 mV, 128-sample averaging). Each reading is signed
  with the meter's Ed25519 key (created on first boot, kept in flash; printed at boot as `meter key <hex>`) as
  `solaris-reading-v1:<boot>:<seq>:<millivolts>:<microamps>`, printed as a JSON line over USB and, if `secrets.h` has
  Wi-Fi details, POSTed to the operator.
- `measure_r/` – prints averaged V and I to work out the load resistance (R = V / I).
- `hello_esp32/`, `ina219_read/` – bring-up tests (LED blink + I2C scan, basic readings).

On this board the first I2C transfer after an idle period gets a NACK, so every sketch sends a throwaway
probe (`wakeBus()`) before reading.

## Build and flash

```bash
arduino-cli compile --fqbn esp32:esp32:esp32 solar_meter
arduino-cli upload  --fqbn esp32:esp32:esp32 -p /dev/ttyACM0 solar_meter
```

The serial port belongs to the `uucp` group; until you log out and back in after joining it,
prefix commands with `sg uucp -c "..."`.

## Getting readings to the dashboard

**USB (no setup):** `./run.sh` at the repo root starts it, or by hand:
```bash
python3 tools/usb_bridge.py          # forwards /dev/ttyACM0 -> http://localhost:4100/api/meter/readings
```
The bridge only relays; the operator checks every signature, so a bridge can't alter readings.
Only one program can use the port at a time: stop the bridge before flashing or running `tools/live.py`.

**Wi-Fi:** copy `solar_meter/secrets.example.h` to `secrets.h`, fill in a 2.4 GHz network and your
laptop's IP (`ip -4 addr show wlp4s0`), flash, and open port 4100 in the firewall:
```bash
sudo ufw allow 4100/tcp
```
