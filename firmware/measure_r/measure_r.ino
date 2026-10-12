// High-precision mode for finding the load resistance: R = V / I.
// INA219 set to +-40 mV shunt range with 128-sample averaging; each line averages 20 conversions.
#include <Wire.h>

const uint8_t ADDR = 0x40;

void wakeBus() { Wire.beginTransmission(ADDR); Wire.endTransmission(); }

void writeReg(uint8_t reg, uint16_t v) {
  wakeBus();
  Wire.beginTransmission(ADDR); Wire.write(reg); Wire.write(v >> 8); Wire.write(v & 0xFF);
  Wire.endTransmission();
}

int16_t readReg(uint8_t reg) {
  Wire.beginTransmission(ADDR); Wire.write(reg); Wire.endTransmission();
  Wire.requestFrom(ADDR, (uint8_t)2);
  return (int16_t)((Wire.read() << 8) | Wire.read());
}

void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);
  delay(300);
  // BRNG=16V, PG=/1 (+-40mV), BADC=SADC=128 samples, continuous shunt+bus.
  writeReg(0x00, 0x07FF);
  Serial.println("measure_r ready");
}

void loop() {
  double shunt = 0, bus = 0;
  const int N = 20;
  for (int i = 0; i < N; i++) {
    wakeBus();
    shunt += readReg(0x01) * 0.01;                 // mV, 10 uV per LSB
    bus += ((uint16_t)readReg(0x02) >> 3) * 0.004; // V, 4 mV per LSB
    delay(70);                                      // one 128-sample conversion
  }
  shunt /= N; bus /= N;
  double mA = shunt / 0.1;                          // 0.1 ohm shunt
  Serial.printf("M bus=%.4f V shunt=%.4f mV current=%.3f mA\n", bus, shunt, mA);
}
