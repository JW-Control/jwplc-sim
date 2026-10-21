// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Modelo de datos ILP32: micros() desborda cada 2^32 µs (71,6 min). El
// modismo Arduino `micros() - last >= periodo` con `unsigned long` funciona
// en el ESP32 (long de 32 bits) y falla si el host usa long de 64 bits.
#include <Arduino.h>

static unsigned long g_last = 0;
static uint32_t g_ticks = 0;

void setup()
{
    Serial.begin(115200);
    Serial.printf("sizeof(long)=%u sizeof(void*)=%u\n", (unsigned)sizeof(long), (unsigned)sizeof(void *));
}

void loop()
{
    const unsigned long now = micros();
    if (now - g_last >= 1000000UL)   // un tick por segundo
    {
        g_last = now;
        g_ticks++;
        if (g_ticks % 600 == 0)
        {
            Serial.printf("min=%lu ticks=%lu\n", (unsigned long)(millis() / 60000UL), (unsigned long)g_ticks);
        }
    }
    delay(5);
}
