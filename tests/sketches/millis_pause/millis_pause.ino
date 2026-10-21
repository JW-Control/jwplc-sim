// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// G1 SPEED_X10: imprime millis() cada 100 ms. Una pausa de la simulación no
// debe producir saltos: la diferencia entre líneas consecutivas es siempre 100.
#include <Arduino.h>

void setup()
{
    Serial.begin(115200);
}

void loop()
{
    static uint32_t next = 1000;
    const uint32_t now = millis();
    if ((int32_t)(now - next) >= 0)
    {
        Serial.printf("millis=%lu\n", (unsigned long)now);
        next += 100;
    }
    delay(1);
}
