// Ejercicio 8 · Alarma con reconocimiento · solución de referencia (la rúbrica le da 20/20).
//   I0_0  B1, presostato (interruptor NA): Cerrado: presión alta (alarma)
//   I0_1  S1, pulsador NA: Reconocer
//   Q0_0  HA1, zumbador: Bocina
//   Q0_1  H1, piloto rojo: Alarma
#include <Arduino.h>

static bool activa = false;
static bool reconocida = false;

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool alarma = digitalRead(I0_0);
    const bool reconocer = digitalRead(I0_1);
    if (alarma && !activa)
    {
        activa = true;
        reconocida = false;
    }
    if (reconocer && activa) reconocida = true;
    if (!alarma && reconocida) activa = false;
    const bool parpadeo = (millis() / 500) % 2;
    digitalWrite(Q0_0, activa && !reconocida);
    digitalWrite(Q0_1, activa && (reconocida || parpadeo));
    delay(1);
}
