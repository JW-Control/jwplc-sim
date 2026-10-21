// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Start/Stop con enclavamiento y 8 E/S (gates G1 DETERMINISM y SPEED_X10).
//   I0_0 marcha (NA), I0_1 parada (NC: 1 = sin pulsar), I0_2 térmico (NC)
//   Q0_0 motor, Q0_1 piloto marcha, Q0_2 piloto falla
//   I0_3..I0_7 se copian en Q0_3..Q0_7
//   Q0_1 parpadea a 1 Hz mientras el motor arranca (primeros 3 s).
#include <Arduino.h>

static bool motor = false;
static uint32_t arranque = 0;

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool marcha = digitalRead(I0_0);
    const bool parada = !digitalRead(I0_1);
    const bool termico = !digitalRead(I0_2);

    if (parada || termico)
    {
        motor = false;
    }
    else if (marcha && !motor)
    {
        motor = true;
        arranque = millis();
    }

    const bool arrancando = motor && (millis() - arranque) < 3000;
    digitalWrite(Q0_0, motor);
    digitalWrite(Q0_1, arrancando ? ((millis() / 500) % 2) : motor);
    digitalWrite(Q0_2, termico);
    for (uint8_t i = 3; i < 8; i++) digitalWrite(Q0_X[i], digitalRead(I0_X[i]));
}
