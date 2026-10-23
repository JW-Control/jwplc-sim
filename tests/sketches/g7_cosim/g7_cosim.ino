// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Co-simulación con la escena (gate G7): marcha/parada de un contactor con
// confirmación por su auxiliar y ciclo de un cilindro con dos finales.
//   I0_0 marcha (NA)   I0_1 parada (NC: 1 = sin pulsar)   I0_2 KM1 13-14
//   I0_3 B1 cilindro afuera (fin de carrera)   I0_4 B0 cilindro adentro (inductivo)
//   Q0_0 bobina de KM1   Q0_1 electroválvula Y1   Q0_2 piloto de falla
// Si KM1 no confirma en 100 ms después de mandar la bobina: falla.
#include <Arduino.h>

static bool marcha = false;
static bool falla = false;
static bool sale = false;
static uint32_t orden = 0;
static uint32_t ciclos = 0;

static void log(const char *msg)
{
    Serial.printf("%lu ms %s\n", (unsigned long)millis(), msg);
}

void setup()
{
    Serial.begin(115200);
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
    log("listo");
}

void loop()
{
    const bool pMarcha = digitalRead(I0_0);
    const bool pParada = !digitalRead(I0_1);
    const bool km1 = digitalRead(I0_2);
    const bool afuera = digitalRead(I0_3);
    const bool adentro = digitalRead(I0_4);

    if (pParada && (marcha || falla))
    {
        marcha = false;
        falla = false;
        log("parada");
    }
    else if (pMarcha && !marcha && !falla)
    {
        marcha = true;
        orden = millis();
        log("marcha");
    }
    if (marcha && !km1 && millis() - orden > 100)
    {
        marcha = false;
        falla = true;
        log("FALLA KM1 sin confirmacion");
    }

    // Ciclo del cilindro con KM1 confirmado.
    if (marcha && km1)
    {
        if (!sale && adentro)
        {
            sale = true;
            log("cilindro sale");
        }
        else if (sale && afuera)
        {
            sale = false;
            ciclos++;
            Serial.printf("%lu ms cilindro afuera, ciclo %lu\n", (unsigned long)millis(), (unsigned long)ciclos);
        }
    }
    else
    {
        sale = false;
    }

    digitalWrite(Q0_0, marcha);
    digitalWrite(Q0_1, sale);
    digitalWrite(Q0_2, falla);
    delay(1);
}
