// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Emulación de planta (G9): el PLC es maestro Modbus RTU (9600 8N1) y lee
// dos transmisores de la escena: PT100 (dirección 1, registro 0 = °C × 10)
// y pH con temperatura (dirección 2, registros 0 = pH × 100 y 1 = °C × 10).
// Como en los ejemplos del package: el maestro JWPLC_ModbusRTU ya existe,
// solo se arranca con la velocidad del bus.

static uint16_t regs[2];
static uint8_t sensor = 0;  // 0 = PT100, 1 = pH
static uint32_t proximaMs = 0;

void setup()
{
    Serial.begin(115200);
    if (!JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1)) Serial.println("begin failed");
}

void loop()
{
    JWPLC_ModbusRTU.task();
    const unsigned long now = millis();

    if (JWPLC_ModbusRTU.masterDone())
    {
        const bool ok = JWPLC_ModbusRTU.masterSucceeded();
        if (sensor == 0 && ok) Serial.printf("%lu ms T=%.1f\n", now, (int16_t)regs[0] / 10.0);
        else if (sensor == 0) Serial.printf("%lu ms T FAIL %s\n", now, JWPLC_ModbusRTU.lastErrorString());
        else if (ok) Serial.printf("%lu ms pH=%.2f Tm=%.1f\n", now, regs[0] / 100.0, (int16_t)regs[1] / 10.0);
        else Serial.printf("%lu ms pH FAIL %s\n", now, JWPLC_ModbusRTU.lastErrorString());
        JWPLC_ModbusRTU.clearMasterResult();
        sensor ^= 1;
        if (sensor == 0) proximaMs = now + 500;
    }

    if (!JWPLC_ModbusRTU.masterBusy() && !JWPLC_ModbusRTU.masterDone() && (int32_t)(now - proximaMs) >= 0)
    {
        if (sensor == 0) JWPLC_ModbusRTU.requestReadHoldingRegisters(1, 0, 1, regs, 200);
        else JWPLC_ModbusRTU.requestReadInputRegisters(2, 0, 2, regs, 200);
    }
}
