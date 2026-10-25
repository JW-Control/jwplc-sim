// Ejercicio 1 · solución de referencia (la rúbrica le da 20/20).
#include <Arduino.h>

static bool marcha = false;

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool pMarcha = digitalRead(I0_0);
    const bool parada = !digitalRead(I0_1);   // NC: 0 = pulsada o cable cortado
    if (parada) marcha = false;
    else if (pMarcha) marcha = true;
    digitalWrite(Q0_0, marcha);
    digitalWrite(Q0_1, marcha);
    delay(1);
}
