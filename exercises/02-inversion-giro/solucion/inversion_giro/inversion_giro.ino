// Ejercicio 2 · Inversión de giro con enclavamiento · solución de referencia (la rúbrica le da 20/20).
//   I0_0  S1, pulsador NA: Giro a la izquierda
//   I0_1  S2, pulsador NA: Giro a la derecha
//   I0_2  S0, pulsador NC: Parada (1 = sin pulsar)
//   Q0_0  KM1, contactor: Motor a la izquierda
//   Q0_1  KM2, contactor: Motor a la derecha
//   Q0_2  H1, piloto amarillo: Motor en marcha
#include <Arduino.h>

static int sentido = 0;   // 1 izquierda, -1 derecha, 0 parado

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    const bool izq = digitalRead(I0_0);
    const bool der = digitalRead(I0_1);
    const bool parada = !digitalRead(I0_2);
    if (parada) sentido = 0;
    else if (sentido == 0)
    {
        if (izq && !der) sentido = 1;
        else if (der && !izq) sentido = -1;
    }
    digitalWrite(Q0_0, sentido == 1);
    digitalWrite(Q0_1, sentido == -1);
    digitalWrite(Q0_2, sentido != 0);
    delay(1);
}
