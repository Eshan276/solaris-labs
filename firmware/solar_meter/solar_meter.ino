// Solaris Labs mini solar meter.
// Reads the panel through the INA219 about once a second, signs each reading with the meter's
// own Ed25519 key, and reports it two ways:
//   - USB serial: one JSON line per reading (tools/usb_bridge.py forwards these)
//   - Wi-Fi: HTTP POST to SERVER_URL, when WIFI_SSID is set in secrets.h
//
// Signed message: "solaris-reading-v1:<boot>:<seq>:<millivolts>:<microamps>"
// The key is generated on first boot and kept in flash; its public half is the meter address
// recorded on-chain for the project.
#include <Wire.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Ed25519.h>
#include "bootloader_random.h"
#include "secrets.h"

const uint8_t INA219 = 0x40;
const int LED = 2;
const float SHUNT_OHMS = 0.1;

uint8_t privateKey[32];
uint8_t publicKey[32];
char publicKeyHex[65];
uint32_t bootCount = 0;
uint32_t seq = 0;

void toHex(const uint8_t *bytes, size_t len, char *out) {
  static const char digits[] = "0123456789abcdef";
  for (size_t i = 0; i < len; i++) {
    out[2 * i] = digits[bytes[i] >> 4];
    out[2 * i + 1] = digits[bytes[i] & 0x0F];
  }
  out[2 * len] = '\0';
}

// Loads the meter key from flash, creating it from the hardware RNG on first boot,
// and bumps the boot counter so sequence numbers never repeat across restarts.
void loadIdentity() {
  Preferences prefs;
  prefs.begin("meter", false);
  if (prefs.getBytesLength("sk") != sizeof(privateKey)) {
    bootloader_random_enable();
    esp_fill_random(privateKey, sizeof(privateKey));
    bootloader_random_disable();
    prefs.putBytes("sk", privateKey, sizeof(privateKey));
  } else {
    prefs.getBytes("sk", privateKey, sizeof(privateKey));
  }
  bootCount = prefs.getUInt("boot", 0) + 1;
  prefs.putUInt("boot", bootCount);
  prefs.end();
  Ed25519::derivePublicKey(publicKey, privateKey);
  toHex(publicKey, sizeof(publicKey), publicKeyHex);
}

// On this board the first I2C transaction after an idle period gets a NACK;
// a throwaway probe wakes the bus so the real transfers succeed.
void wakeBus() {
  Wire.beginTransmission(INA219);
  Wire.endTransmission();
}

bool writeReg(uint8_t reg, uint16_t value) {
  wakeBus();
  Wire.beginTransmission(INA219);
  Wire.write(reg);
  Wire.write(value >> 8);
  Wire.write(value & 0xFF);
  return Wire.endTransmission() == 0;
}

bool readReg(uint8_t reg, int16_t &value) {
  Wire.beginTransmission(INA219);
  Wire.write(reg);
  if (Wire.endTransmission() != 0) return false;
  if (Wire.requestFrom(INA219, (uint8_t)2) != 2) return false;
  value = (int16_t)((Wire.read() << 8) | Wire.read());
  return true;
}

// Averages 10 conversions (each already a 128-sample average) into one reading.
bool measure(float &volts, float &milliamps) {
  double shuntMv = 0, busV = 0;
  const int N = 10;
  for (int i = 0; i < N; i++) {
    int16_t shunt, bus;
    wakeBus();
    if (!readReg(0x01, shunt) || !readReg(0x02, bus)) return false;
    shuntMv += shunt * 0.01;                   // 10 uV per LSB
    busV += ((uint16_t)bus >> 3) * 0.004;      // 4 mV per LSB
    delay(70);                                 // one 128-sample conversion
  }
  shuntMv /= N;
  volts = busV / N + shuntMv / 1000.0;         // panel voltage = bus + shunt drop
  milliamps = shuntMv / SHUNT_OHMS;
  return true;
}

void connectWifi() {
  if (strlen(WIFI_SSID) == 0 || WiFi.status() == WL_CONNECTED) return;
  static unsigned long lastTry = 0;
  if (lastTry && millis() - lastTry < 10000) return;
  lastTry = millis();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
}

// Builds the signed JSON record for one reading.
void signedRecord(float volts, float milliamps, char *out, size_t outLen) {
  long mv = lroundf(volts * 1000.0f);
  long ua = lroundf(milliamps * 1000.0f);
  seq++;
  char message[80];
  int len = snprintf(message, sizeof(message), "solaris-reading-v1:%lu:%lu:%ld:%ld",
                     (unsigned long)bootCount, (unsigned long)seq, mv, ua);
  uint8_t signature[64];
  Ed25519::sign(signature, privateKey, publicKey, message, len);
  char sigHex[129];
  toHex(signature, sizeof(signature), sigHex);
  snprintf(out, outLen,
           "{\"b\":%lu,\"n\":%lu,\"mv\":%ld,\"ua\":%ld,\"k\":\"%s\",\"sig\":\"%s\"}",
           (unsigned long)bootCount, (unsigned long)seq, mv, ua, publicKeyHex, sigHex);
}

void postReading(const char *record) {
  if (strlen(WIFI_SSID) == 0 || WiFi.status() != WL_CONNECTED) return;
  HTTPClient http;
  http.setTimeout(1500);
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(record);
  http.end();
  if (code != 200) Serial.printf("# wifi post failed: %d\n", code);
}

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  Wire.begin(21, 22);
  delay(300);
  // BRNG=16V, PGA=/1 (+-40 mV, up to 400 mA), 128-sample averaging, continuous.
  while (!writeReg(0x00, 0x07FF)) {
    Serial.println("# INA219 not found - check wiring");
    delay(1000);
  }
  loadIdentity();
  Serial.printf("# solar_meter ready, meter key %s, boot %lu\n", publicKeyHex, (unsigned long)bootCount);
  connectWifi();
}

void loop() {
  connectWifi();
  float volts, milliamps;
  if (!measure(volts, milliamps)) {
    Serial.println("# INA219 read failed");
    delay(500);
    return;
  }
  char record[320];
  signedRecord(volts, milliamps, record, sizeof(record));
  Serial.println(record);
  postReading(record);
  digitalWrite(LED, !digitalRead(LED));
}
