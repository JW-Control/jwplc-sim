// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Calibración del modelo de costos (G1): cuenta las vueltas de loop() por
// segundo en tres casos, 10 s cada uno, y lo imprime por Serial. Se sube
// igual a la placa y al simulador; la comparación ajusta los costos de
// sim/engine/src/scheduler.cpp (DEFAULT_COSTS).
//   caso 0: loop() vacío
//   caso 1: millis() y 5 digitalWrite a Q0 (salidas del expansor)
//   caso 2: caso 1 + JWPLC_ModbusRTU.task() con el bus arrancado
// Salida: "CAL caso=N vueltas_por_s=V" una vez por segundo.

static uint8_t caso = 0;
static uint32_t vueltas = 0, t0 = 0, inicioCaso = 0;
static bool q = false;

void setup()
{
    Serial.begin(115200);
    JWPLC_ModbusRTU.begin(247, 9600, SERIAL_8N1);
    t0 = inicioCaso = millis();
}

void loop()
{
    if (caso >= 1)
    {
        q = (millis() & 0x100) != 0;
        digitalWrite(Q0_0, q);
        digitalWrite(Q0_1, q);
        digitalWrite(Q0_2, q);
        digitalWrite(Q0_3, q);
        digitalWrite(Q0_4, q);
    }
    if (caso == 2) JWPLC_ModbusRTU.task();
    vueltas++;

    const uint32_t now = millis();
    if (now - t0 >= 1000)
    {
        Serial.printf("CAL caso=%u vueltas_por_s=%lu\n", caso, (unsigned long)vueltas);
        vueltas = 0;
        t0 = now;
        if (now - inicioCaso >= 10000 && caso < 2)
        {
            caso++;
            inicioCaso = now;
        }
    }
}
