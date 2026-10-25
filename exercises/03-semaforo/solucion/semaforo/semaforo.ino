// Ejercicio 3 · Semáforo · solución de referencia (la rúbrica le da 20/20).
//   I0_0  S1, pulsador NA: Marcha
//   I0_1  S0, pulsador NC: Parada (1 = sin pulsar)
//   Q0_0  H1, piloto rojo: Luz roja
//   Q0_1  H2, piloto amarillo: Luz ámbar
//   Q0_2  H3, piloto verde: Luz verde
#include <Arduino.h>

static bool activo = false;
static uint32_t t0 = 0;

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool marcha = digitalRead(I0_0);
    const bool parada = !digitalRead(I0_1);
    if (parada) activo = false;
    else if (marcha && !activo)
    {
        activo = true;
        t0 = millis();
    }
    const uint32_t e = (millis() - t0) % 9000;   // verde 4 s, ámbar 1 s, rojo 4 s
    digitalWrite(Q0_2, activo && e < 4000);
    digitalWrite(Q0_1, activo && e >= 4000 && e < 5000);
    digitalWrite(Q0_0, activo && e >= 5000);
    delay(1);
}
