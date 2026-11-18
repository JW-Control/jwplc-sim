// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Planta 3D, piloto: la misma lógica que tests/projects/oip-cinta, pero con
// la cinta con física del propio Sim (sin OIP).
//
//   I0_0  fotocelda B1 (haz en C1.sensorA)
//   I0_1  pulsador de marcha S1
//   Q0_0  contactor KM1 → motor M1 → cinta C1
//   Q0_1  piloto H1: caja detectada
//
// Al ver la caja la cinta se detiene y queda enclavada (la caja sigue un
// poco mientras el motor frena); se rearma con S1 si la fotocelda está
// libre.
#include <Arduino.h>

static bool detenida = false;
static bool marchaAnterior = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("cinta_enclavada: lista");
}

void loop()
{
    const bool caja = digitalRead(I0_0);
    const bool marcha = digitalRead(I0_1);

    if (caja && !detenida) {
        detenida = true;
        Serial.println("caja detectada: cinta detenida (enclavada)");
    }
    if (marcha && !marchaAnterior && detenida && !caja) {
        detenida = false;
        Serial.println("marcha: rearme");
    }
    marchaAnterior = marcha;

    digitalWrite(Q0_0, !detenida);
    digitalWrite(Q0_1, detenida);
    delay(5);
}
