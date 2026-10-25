// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Falla G9 "microSD retirada": cada 500 ms el sketch mira la tarjeta, la
// vuelve a iniciar si hace falta y agrega una línea a /log.txt.
#include <Arduino.h>

static uint32_t next = 0;

void setup()
{
    Serial.begin(115200);
    Serial.println("g9 sd hotplug");
}

void loop()
{
    if (millis() < next) return;
    next = millis() + 500;
    const bool present = JWPLC_SD.isCardPresent();
    if (present && !JWPLC_SD.isReady()) JWPLC_SD.begin();
    bool ok = false;
    if (JWPLC_SD.isReady())
    {
        JWPLCFile f = JWPLC_SD.open("/log.txt", FILE_APPEND);
        if (f)
        {
            ok = f.println(millis()) > 0;
            f.close();
        }
    }
    Serial.printf("%lu ms present=%d ready=%d write=%s\n", (unsigned long)millis(), present, JWPLC_SD.isReady(), ok ? "OK" : "FAIL");
}
