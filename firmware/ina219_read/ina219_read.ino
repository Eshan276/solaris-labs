// Prints INA219 readings once a second: bus voltage, current, power.
#include <Wire.h>
#include <Adafruit_INA219.h>

Adafruit_INA219 ina219;

// On this board the first I2C transaction after an idle period gets a NACK;
// a throwaway probe wakes the bus so the real reads succeed.
void wakeBus() {
  Wire.beginTransmission(0x40);
  Wire.endTransmission();
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  pinMode(2, OUTPUT);
  delay(200);
  wakeBus();
  while (!ina219.begin()) {
    Serial.println("INA219 not found - check wiring");
    delay(1000);
    wakeBus();
  }
  Serial.println("INA219 ready");
}

void loop() {
  wakeBus();
  float v = ina219.getBusVoltage_V() + ina219.getShuntVoltage_mV() / 1000.0;
  float mA = ina219.getCurrent_mA();
  float mW = ina219.getPower_mW();
  Serial.printf("V=%.2f V  I=%.1f mA  P=%.0f mW\n", v, mA, mW);
  digitalWrite(2, !digitalRead(2));
  delay(1000);
}
