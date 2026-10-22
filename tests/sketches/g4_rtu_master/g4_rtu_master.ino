// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_RS485_MULTINODE: maestro Modbus RTU del bus de 3 nodos (ID local
// 247, 115200 8N1). Cada 200 ms, en ronda: lee HR0..HR3 del esclavo 2, lee
// HR0..HR3 del esclavo 3, escribe HR1 del esclavo 3 con un contador y pide
// al esclavo 4 (inexistente: debe vencer el plazo). Imprime cada resultado:
//   "M <op> esclavo=<id> OK v=a,b,c,d" o "M <op> esclavo=<id> FAIL <error>"
static uint16_t values[4] = {};
static uint8_t step = 0;
static uint16_t counter = 0;
static uint32_t nextMs = 1000;

void setup() {
  Serial.begin(115200);
  delay(300);
  if (!JWPLC_ModbusRTU.begin(247, 115200, SERIAL_8N1)) {
    Serial.println("Modbus begin failed");
    return;
  }
  Serial.println("Maestro listo");
}

static const char *op(uint8_t s) { return s == 2 ? "write" : "read"; }
static uint8_t target(uint8_t s) { return s == 0 ? 2 : s == 3 ? 4 : 3; }

void loop() {
  JWPLC_ModbusRTU.task();
  const uint32_t now = millis();
  if (JWPLC_ModbusRTU.masterDone()) {
    if (JWPLC_ModbusRTU.masterSucceeded()) {
      if (step == 2) Serial.printf("M write esclavo=3 OK v=%u\n", counter);
      else Serial.printf("M read esclavo=%u OK v=%u,%u,%u,%u\n", target(step), values[0], values[1], values[2], values[3]);
    } else {
      Serial.printf("M %s esclavo=%u FAIL %s\n", op(step), target(step), JWPLC_ModbusRTU.lastErrorString());
    }
    JWPLC_ModbusRTU.clearMasterResult();
    step = (step + 1) % 4;
    nextMs = now + 200;
  }
  if (!JWPLC_ModbusRTU.masterBusy() && !JWPLC_ModbusRTU.masterDone() && (int32_t)(now - nextMs) >= 0) {
    switch (step) {
      case 0: JWPLC_ModbusRTU.requestReadHoldingRegisters(2, 0, 4, values, 300); break;
      case 1: JWPLC_ModbusRTU.requestReadHoldingRegisters(3, 0, 4, values, 300); break;
      case 2: JWPLC_ModbusRTU.requestWriteSingleRegister(3, 1, ++counter, 300); break;
      default: JWPLC_ModbusRTU.requestReadHoldingRegisters(4, 0, 4, values, 300); break;
    }
  }
}
