// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// G3 BREAKPOINTS_STEP y FREEZE_TIME: el gate pone breakpoints en las líneas
// marcadas con "MARCA:" (las busca por texto, no por número).
#include <Arduino.h>

uint32_t vueltas = 0;
uint32_t ultimo = 0;

static uint32_t doble(uint32_t x)
{
    const uint32_t r = x * 2; // MARCA:doble
    return r;
}

void setup()
{
    Serial.begin(115200);
    pinMode(Q0_0, OUTPUT);
}

void loop()
{
    vueltas++; // MARCA:loop
    ultimo = doble(vueltas); // MARCA:llamada
    digitalWrite(Q0_0, (millis() / 100) % 2);
    delay(10); // MARCA:delay
}
