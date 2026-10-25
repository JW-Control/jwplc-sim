// Ejercicio 1 · Marcha y parada con enclavamiento (ver ENUNCIADO.md)
//   I0_0 S1 marcha (NA)        I0_1 S0 parada (NC: 1 = sin pulsar)
//   Q0_0 KM1 motor             Q0_1 H1 piloto de marcha
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
