// Ejercicio 3 · Semáforo (ver ENUNCIADO.md)
//   I0_0  S1, pulsador NA: Marcha
//   I0_1  S0, pulsador NC: Parada (1 = sin pulsar)
//   Q0_0  H1, piloto rojo: Luz roja
//   Q0_1  H2, piloto amarillo: Luz ámbar
//   Q0_2  H3, piloto verde: Luz verde
#include <Arduino.h>

void setup()
{
    for (uint8_t i = 0; i < I0_COUNT; i++) pinMode(I0_X[i], INPUT);
    for (uint8_t i = 0; i < Q0_COUNT; i++) pinMode(Q0_X[i], OUTPUT);
}

void loop()
{
    // Escriba aquí su programa.
}
