// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// JWSIM_EXPANSION_RTU: maestro de prueba del protocolo de expansión v2
// (JWPLC_Expansion) contra el ejemplo Expansion_Esclavo_Basic del package.
// Imprime una línea "M ..." por paso; el gate las compara.
#include <JWPLC_ModbusRTU.h>
#include <JWPLC_Expansion.h>
static uint16_t ir[16], hr[13];
static void ident(uint8_t id) {
  if (JWPLC_ModbusRTU.readInputRegistersSync(id, 240, 16, ir, 300))
    Serial.printf("M ident id=%u magic=%04X%04X prot=%u io=%04X caps=%04X status=%u/%u\n", id, ir[0], ir[1], ir[2], ir[5], ir[6], ir[7] >> 8, ir[7] & 0xFF);
  else Serial.printf("M ident id=%u FAIL\n", id);
}
static void readHr(uint8_t id) {
  if (JWPLC_ModbusRTU.readHoldingRegistersSync(id, 224, 13, hr, 300))
    Serial.printf("M hr id=%u res=%u safe=%02X hold=%02X wd=%u flags=%u link=%04X%04X\n", hr[1], hr[5], hr[7], hr[8], hr[9], hr[10], hr[11], hr[12]);
  else Serial.printf("M hr FAIL\n");
}
void setup() {
  Serial.begin(115200);
  delay(1000);
  JWPLC_ModbusRTU.begin(1, 115200, SERIAL_8N1);
  ident(247);
  ident(5);
  // Guardar todo: ID 5, Q1 ON y Q2 mantener sin maestro, vigilancia 1 s, vínculo.
  const uint16_t cfg[13] = {JWX_UNLOCK_KEY, 5, 4, JWX_CMD_SAVE_ALL, 0, 0xFFFF, 0, 0x01, 0x02, 10, 0, 0x1234, 0x5678};
  Serial.printf("M save %s\n", JWPLC_ModbusRTU.writeMultipleRegistersSync(247, 224, 13, cfg, 300) ? "OK" : "FAIL");
  delay(200);
  ident(247);
  ident(5);
  readHr(5);
  // Clave errónea: resultado 1 y nada cambia.
  const uint16_t bad[4] = {0x1111, 9, 4, JWX_CMD_SAVE_ID};
  JWPLC_ModbusRTU.writeMultipleRegistersSync(5, 224, 4, bad, 300);
  delay(50);
  readHr(5);
  // Q2 y Q3 cada 100 ms durante 1 s; luego el maestro calla.
  uint8_t q = 0x06;
  for (int i = 0; i < 10; i++) { JWPLC_ModbusRTU.writeMultipleCoilsSync(5, 0, 8, &q, 300); delay(100); }
  JWPLC_ModbusRTU.readCoilsSync(5, 0, 8, &q, 300);
  Serial.printf("M activo coils=%02X\n", q);
  delay(1500);
  JWPLC_ModbusRTU.readCoilsSync(5, 0, 8, &q, 300);
  Serial.printf("M seguro coils=%02X\n", q);
}
void loop() { delay(1000); }
