// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// G1 HAL_CORE: bucle sin puntos de sincronización. El vigilante del
// simulador debe detenerlo con un mensaje claro (código de salida 70).
#include <Arduino.h>

volatile bool g_flag = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("entrando al bucle");
}

void loop()
{
    while (!g_flag)
    {
    }
}
