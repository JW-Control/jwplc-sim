// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Dispositivo nativo del SDK (gate G7): Q0_0 habilita el generador de pulsos
// (sdk/native/examples/pulse-generator) durante 1 s (de 100 a 1100 ms
// después de setup); el sketch cuenta los flancos de subida de I0_7 y los
// informa al terminar.
//
// El core escanea las entradas cada 20 ms por defecto: un tren de 100 Hz se
// perdería por aliasing, como en la placa. Para contar pulsos rápidos el
// sketch acorta el escaneo (función débil del core).
#include <Arduino.h>

uint32_t getJWPLCIoScanPeriod_ms(void)
{
    return 1;
}

static uint32_t flancos = 0;
static bool anterior = false;
static bool informado = false;
static uint32_t inicio = 0;

void setup()
{
    Serial.begin(115200);
    pinMode(I0_7, INPUT);
    pinMode(Q0_0, OUTPUT);
    inicio = millis();
}

void loop()
{
    const uint32_t t = millis() - inicio;
    digitalWrite(Q0_0, t >= 100 && t < 1100);
    const bool nivel = digitalRead(I0_7);
    if (nivel && !anterior) flancos++;
    anterior = nivel;
    if (t >= 1400 && !informado)
    {
        informado = true;
        Serial.printf("flancos=%lu\n", (unsigned long)flancos);
    }
}
