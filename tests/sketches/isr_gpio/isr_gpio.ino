// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// G1 HAL_CORE: interrupción GPIO en contexto ISR.
// GPIO4 como salida con interrupción CHANGE sobre el mismo pin (el ESP32
// mantiene la entrada habilitada en OUTPUT). loop() lo conmuta cada 10 ms.
#include <Arduino.h>

static volatile uint32_t g_isrCount = 0;
static volatile uint32_t g_isrOutsideContext = 0;

void IRAM_ATTR onEdge()
{
    g_isrCount = g_isrCount + 1;
    if (!xPortInIsrContext())
    {
        g_isrOutsideContext = g_isrOutsideContext + 1;
    }
}

void setup()
{
    Serial.begin(115200);
    pinMode(4, OUTPUT);
    digitalWrite(4, LOW);
    attachInterrupt(4, onEdge, CHANGE);
}

void loop()
{
    static uint32_t toggles = 0;
    digitalWrite(4, (toggles & 1) ? LOW : HIGH);
    toggles++;
    delay(10);
    if (toggles == 50)
    {
        Serial.printf("ISR toggles=%lu isr=%lu fuera_de_contexto=%lu\n",
                      (unsigned long)toggles, (unsigned long)g_isrCount,
                      (unsigned long)g_isrOutsideContext);
    }
}
