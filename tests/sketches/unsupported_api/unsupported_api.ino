// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// G1 HAL_CORE: una API no soportada falla con un mensaje que la nombra.
#include <Arduino.h>

void setup()
{
    Serial.begin(115200);
}

void loop()
{
    Serial.println(analogRead(36));
    delay(100);
}
