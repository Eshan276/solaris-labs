// Bring-up test: blinks the onboard LED (GPIO 2) and scans I2C (SDA 21, SCL 22) for the INA219 at 0x40.
#include <Wire.h>

const int LED = 2;

void setup() {
  Serial.begin(115200);
  pinMode(LED, OUTPUT);
  Wire.begin(21, 22);
  delay(500);
  Serial.println("\nSolaris Labs ESP32 bring-up OK");
}

void loop() {
  digitalWrite(LED, !digitalRead(LED));
  int found = 0;
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() == 0) {
      Serial.printf("I2C device at 0x%02X%s\n", addr, addr == 0x40 ? " (INA219)" : "");
      found++;
    }
  }
  if (!found) Serial.println("No I2C devices (INA219 not connected yet)");
  delay(1000);
}
