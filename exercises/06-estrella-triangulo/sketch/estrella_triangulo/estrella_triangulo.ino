// Ejercicio 6 · Arranque estrella-triángulo (ver ENUNCIADO.md)
//   I0_0  S1, pulsador NA: Marcha
//   I0_1  S0, pulsador NC: Parada (1 = sin pulsar)
//   Q0_0  KM1, contactor: Línea
//   Q0_1  KM2, contactor: Estrella
//   Q0_2  KM3, contactor: Triángulo
//   Q0_3  H1, piloto verde: En marcha
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
