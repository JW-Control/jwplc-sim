// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_G4_RS485_MULTINODE: tercer nodo del bus, esclavo Modbus RTU ID 3
// (115200 8N1), como 01.ModbusRTU_Slave_Holding pero con otro ID y otros
// valores: HR0 = segundos, HR1 libre, HR2..HR3 = 3002, 3003.
static constexpr uint8_t SLAVE_ID = 3;
static uint16_t holding[4] = {0, 3001, 3002, 3003};

void setup() {
  Serial.begin(115200);
  delay(300);
  JWPLC_ModbusRTU.setHoldingRegisters(holding, 4);
  if (!JWPLC_ModbusRTU.begin(SLAVE_ID, 115200, SERIAL_8N1)) {
    Serial.print("Modbus begin failed: ");
    Serial.println(JWPLC_ModbusRTU.lastErrorString());
    return;
  }
  Serial.println("Esclavo ID=3 listo");
}

void loop() {
  JWPLC_ModbusRTU.task();
  holding[0] = static_cast<uint16_t>(millis() / 1000UL);
  static uint16_t lastHr1 = holding[1];
  if (holding[1] != lastHr1) {
    lastHr1 = holding[1];
    Serial.printf("HR1 escrito = %u\n", lastHr1);
  }
}
