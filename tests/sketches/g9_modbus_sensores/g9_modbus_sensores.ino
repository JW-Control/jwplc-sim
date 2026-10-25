// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Emulación de planta (G9): el PLC es maestro Modbus RTU (9600 8N1) y lee
// dos transmisores de la escena: PT100 (dirección 1, registro 0 = °C × 10)
// y pH con temperatura (dirección 2, registros 0 = pH × 100 y 1 = °C × 10).
#include <JW_ModbusRTU.h>

JW_RS485 rs485(Serial2, JWPLC_RS485_RX_PIN, JWPLC_RS485_TX_PIN);
JW_ModbusRTU modbus(rs485);

void setup()
{
    Serial.begin(115200);
    rs485.setAutoDirection();
    modbus.setQueuedTxEnabled(false);
    if (!modbus.begin(247, 9600, SERIAL_8N1)) Serial.println("begin failed");
}

void loop()
{
    uint16_t t[1] = {};
    uint16_t a[2] = {};
    if (modbus.readHoldingRegistersSync(1, 0, 1, t, 200))
        Serial.printf("%lu ms T=%.1f\n", (unsigned long)millis(), (int16_t)t[0] / 10.0);
    else
        Serial.printf("%lu ms T FAIL %s\n", (unsigned long)millis(), modbus.lastErrorString());
    if (modbus.readInputRegistersSync(2, 0, 2, a, 200))
        Serial.printf("%lu ms pH=%.2f Tm=%.1f\n", (unsigned long)millis(), a[0] / 100.0, (int16_t)a[1] / 10.0);
    else
        Serial.printf("%lu ms pH FAIL %s\n", (unsigned long)millis(), modbus.lastErrorString());
    delay(500);
}
