// SPDX-FileCopyrightText: 2026 JW Control
// SPDX-License-Identifier: GPL-3.0-or-later
// Planta 3D, piloto: «cinta = NOT fotocelda», sin enclavamiento. Con la
// rampa de parada del motor la caja sigue avanzando, sale del haz y la
// cinta vuelve a arrancar: lo mismo que se midió con Open Industry Project
// el 18/11/2026 (docs/integration/OIP_CONEXION.md §5).
#include <Arduino.h>

static int last = -1;

void setup()
{
    Serial.begin(115200);
    Serial.println("cinta_simple: lista");
}

void loop()
{
    const bool caja = digitalRead(I0_0);
    digitalWrite(Q0_0, !caja);
    digitalWrite(Q0_1, caja);
    if (caja != last) {
        last = caja;
        Serial.println(caja ? "caja en el haz: parar" : "haz libre: marchar");
    }
    delay(5);
}
