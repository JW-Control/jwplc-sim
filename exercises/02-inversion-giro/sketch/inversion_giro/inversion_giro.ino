// Ejercicio 2 · Inversión de giro con enclavamiento (ver ENUNCIADO.md)
//   I0_0  S1, pulsador NA: Giro a la izquierda
//   I0_1  S2, pulsador NA: Giro a la derecha
//   I0_2  S0, pulsador NC: Parada (1 = sin pulsar)
//   Q0_0  KM1, contactor: Motor a la izquierda
//   Q0_1  KM2, contactor: Motor a la derecha
//   Q0_2  H1, piloto amarillo: Motor en marcha
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
