// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Prueba de comunicación con Open Industry Project (OIP).
// Sin escena: la planta 3D de OIP maneja la bornera por el puente de E/S
// (Modbus TCP 127.0.0.1:5020, OIP en modo «The simulator polls the PLC»).
//
//   I0_0  fotocelda de OIP   (Photo Eye,   Presence Tag = %IX0.0)
//   I0_1  marcha / rearme    (Push Button, tag          = %IX0.1)
//   Q0_0  marcha de la cinta (Belt Conveyor, Run Tag    = %QX2.0)
//   Q0_1  caja detectada     (piloto; en OIP, %QX2.1 si se quiere ver)
//
// Al ver la caja la cinta se detiene y queda enclavada: la caja sigue un
// poco por inercia y sale del haz, así que «cinta = NOT fotocelda» la
// volvía a arrancar. Se rearma con I0_1 (flanco de subida), siempre que la
// fotocelda esté libre.
#include <Arduino.h>

static bool detenida = false;
static bool marchaAnterior = false;

void setup()
{
    Serial.begin(115200);
    Serial.println("oip_cinta: listo, esperando a OIP en el puente de E/S");
    Serial.println("fotocelda: libre -> cinta en marcha");
}

void loop()
{
    const bool caja = digitalRead(I0_0);
    const bool marcha = digitalRead(I0_1);

    if (caja && !detenida) {
        detenida = true;
        Serial.println("fotocelda: caja detectada -> cinta detenida (enclavada)");
    }
    if (marcha && !marchaAnterior && detenida && !caja) {
        detenida = false;
        Serial.println("marcha: rearme -> cinta en marcha");
    }
    marchaAnterior = marcha;

    digitalWrite(Q0_0, !detenida);
    digitalWrite(Q0_1, detenida);
    delay(5);
}
